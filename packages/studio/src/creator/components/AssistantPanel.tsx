// "Assistant IA": no model is called from Creator. The panel prepares a
// context-rich prompt for Claude Code, then shows the file changes that arrive
// from outside (Studio's history records them) so the user can keep or undo
// each one, or return to any earlier restore point.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, ClipboardText, Robot, X } from "@phosphor-icons/react";
import { Button, IconButton, cn } from "../../components/ui";
import { readStudioUrlStateFromWindow } from "../../utils/studioUrlState";
import { studioApiFetch } from "../../utils/studioApiFetch";
import {
  creatorApi,
  historyApi,
  type AssistantRequest,
  type HistoryEntryView,
} from "../creatorApi";
import { formatDate, useI18n } from "../i18n";
import { ErrorBanner, errorMessage } from "./common";

const EXAMPLES = ["assistant.example1", "assistant.example2", "assistant.example3"] as const;

interface SelectionSnapshot {
  label: string;
  tagName?: string;
  compositionPath?: string;
  currentTime?: number;
  target?: { id?: string | null; hfId?: string };
  textContent?: string | null;
  dataAttributes?: Record<string, string>;
}

async function readSelection(projectId: string): Promise<SelectionSnapshot | null> {
  try {
    const response = await studioApiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/selection`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { selection: SelectionSnapshot | null };
    return body.selection;
  } catch {
    return null;
  }
}

const POLL_MS = 2500;
/** Creator's former manifest name: older history entries may still list it. */
const MANIFEST = "creator.json";
const OUTSIDE_LABEL = "Changed outside the app";

function reviewedFiles(entry: HistoryEntryView): string[] {
  return entry.files.map((file) => file.path).filter((path) => path !== MANIFEST);
}

export function AssistantPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [requestText, setRequestText] = useState("");
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantRequest[]>([]);
  const [entries, setEntries] = useState<HistoryEntryView[]>([]);
  const [kept, setKept] = useState<Set<string>>(new Set());

  const urlState = readStudioUrlStateFromWindow();
  const compositionPath = selection?.compositionPath ?? urlState.activeCompPath ?? "index.html";
  const currentTime = selection?.currentTime ?? urlState.currentTime ?? null;

  const lastSignature = useRef<string | null>(null);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    // A slow settle must not let the next poll start a second one on top of it.
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      // An outside write stays pending in Studio's history until something settles it:
      // settle only when the files actually changed, then read the entries.
      const signature = await historyApi
        .signature(projectId)
        .then((result) => result.signature)
        .catch(() => null);
      if (signature && signature !== lastSignature.current) {
        await historyApi.settle(projectId).catch(() => undefined);
      }
      if (signature) lastSignature.current = signature;
      const [snapshot, edits] = await Promise.all([
        readSelection(projectId),
        historyApi.list(projectId).catch(() => null),
      ]);
      setSelection(snapshot);
      if (edits) setEntries(edits.entries);
    } finally {
      refreshing.current = false;
    }
  }, [projectId]);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    void refresh();
    creatorApi
      .assistantHistory(projectId)
      .then((result) => setHistory(result.entries))
      .catch(() => setHistory([]));
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [projectId, refresh]);

  const prepare = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await creatorApi.prepareAssistantPrompt(projectId, {
        request: requestText,
        compositionPath,
        currentTime,
        selection: selection
          ? {
              label: selection.label,
              tagName: selection.tagName,
              id: selection.target?.id ?? null,
              hfId: selection.target?.hfId,
              textContent: selection.textContent ?? null,
              dataAttributes: selection.dataAttributes ?? {},
            }
          : null,
      });
      setPrompt(result.prompt);
      setHistory((previous) => [result.entry, ...previous]);
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError(t("error.generic"));
    }
  };

  const reject = async (entry: HistoryEntryView) => {
    setError(null);
    try {
      await historyApi.undo(projectId, entry.id);
      setNotice(t("assistant.rejected"));
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  };

  const restore = async (entry: HistoryEntryView) => {
    if (!window.confirm(t("assistant.restoreConfirm", { label: entry.label }))) return;
    setError(null);
    try {
      await historyApi.restore(projectId, entry.id);
      setNotice(t("assistant.restored"));
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  };

  // Only what arrived after the latest request prepared here is a change to review:
  // imports and catalog installs are outside writes too, and are not Claude Code's.
  const lastRequestAt = history.reduce(
    (latest, entry) => Math.max(latest, Date.parse(entry.createdAt) || 0),
    0,
  );
  const outsideChanges = lastRequestAt
    ? entries.filter(
        (entry) =>
          entry.who.kind !== "person" &&
          entry.endedAt >= lastRequestAt &&
          !entry.undone &&
          !kept.has(entry.id) &&
          reviewedFiles(entry).length > 0,
      )
    : [];
  const entryLabel = (entry: HistoryEntryView) =>
    entry.label === OUTSIDE_LABEL || !entry.label ? t("assistant.external") : entry.label;
  const authorLabel = (entry: HistoryEntryView) =>
    entry.who.kind === "outside" ? t("assistant.outsideAuthor") : entry.who.name;
  const restorePoints = [...entries].sort((a, b) => b.endedAt - a.endedAt).slice(0, 8);

  return (
    <aside
      aria-label={t("assistant.title")}
      className="fixed bottom-3 right-3 top-12 z-[900] flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Robot size={18} className="text-accent-ink" />
        <h2 className="flex-1 text-step-13 font-semibold text-text-0">{t("assistant.title")}</h2>
        <IconButton aria-label={t("assistant.close")} icon={<X size={16} />} onClick={onClose} />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <p className="rounded-md bg-raised px-3 py-2 text-step-11 text-text-muted">
          {t("assistant.noProvider")}
        </p>

        <section className="flex flex-col gap-2">
          <label htmlFor="assistant-request" className="text-step-11 font-medium text-text-muted">
            {t("assistant.request")}
          </label>
          <textarea
            id="assistant-request"
            rows={3}
            value={requestText}
            onChange={(event) => setRequestText(event.target.value)}
            placeholder={t("assistant.placeholder")}
            className="resize-y rounded-md border border-border-strong bg-input px-3 py-2 text-step-12 text-text-0 outline-none placeholder:text-text-off focus:border-accent"
          />
          <div className="flex flex-wrap gap-1.5" aria-label={t("assistant.examples")}>
            {EXAMPLES.map((key) => t(key)).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRequestText(example)}
                className="rounded-full border border-border-strong px-2 py-0.5 text-step-11 text-text-muted hover:bg-hover"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-border px-3 py-2 text-step-11 text-text-muted">
            <p className="font-medium text-text-1">{t("assistant.context")}</p>
            <p>{t("assistant.contextComposition", { path: compositionPath })}</p>
            <p>
              {t("assistant.contextTime", {
                time: currentTime === null ? "—" : currentTime.toFixed(2),
              })}
            </p>
            <p>
              {selection
                ? t("assistant.contextSelection", { label: selection.label })
                : t("assistant.contextNoSelection")}
            </p>
          </div>
          <Button
            variant="primary"
            disabled={!requestText.trim() || busy}
            onClick={() => void prepare()}
          >
            {busy ? t("assistant.preparing") : t("assistant.prepare")}
          </Button>
        </section>

        {error && <ErrorBanner message={error} />}
        {notice && <p className="text-step-11 text-accent-ink">{notice}</p>}

        {prompt && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-step-12 font-semibold text-text-0">{t("assistant.prompt")}</h3>
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <Check size={14} /> : <ClipboardText size={14} />}
                onClick={() => void copy()}
              >
                {copied ? t("assistant.copied") : t("assistant.copy")}
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-bg-0 p-3 font-mono text-step-11 text-text-1">
              {prompt}
            </pre>
            <p className="text-step-11 text-text-muted">{t("assistant.howto")}</p>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-step-12 font-semibold text-text-0">{t("assistant.changes")}</h3>
          {outsideChanges.length === 0 ? (
            <p className="text-step-11 text-text-off">{t("assistant.noChanges")}</p>
          ) : (
            outsideChanges.map((entry) => (
              <div key={entry.id} className="rounded-md border border-accent/40 bg-accent/5 p-2.5">
                <p className="text-step-12 font-medium text-text-0">{entryLabel(entry)}</p>
                <p className="text-step-11 text-text-muted">
                  {authorLabel(entry)} ·{" "}
                  {t("assistant.files", { count: reviewedFiles(entry).length })}
                </p>
                <p className="truncate text-step-11 text-text-off">
                  {reviewedFiles(entry).join(", ")}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Check size={12} />}
                    onClick={() => setKept((previous) => new Set(previous).add(entry.id))}
                  >
                    {t("assistant.keep")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<ArrowCounterClockwise size={12} />}
                    onClick={() => void reject(entry)}
                  >
                    {t("assistant.reject")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-step-12 font-semibold text-text-0">{t("assistant.restorePoints")}</h3>
          {restorePoints.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 text-step-11">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  entry.undone ? "text-text-off line-through" : "text-text-1",
                )}
                title={entry.label}
              >
                {entryLabel(entry)} · {formatDate(locale, new Date(entry.endedAt).toISOString())}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void restore(entry)}>
                {t("assistant.restore")}
              </Button>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-1.5 pb-2">
          <h3 className="text-step-12 font-semibold text-text-0">{t("assistant.history")}</h3>
          {history.length === 0 ? (
            <p className="text-step-11 text-text-off">{t("assistant.noHistory")}</p>
          ) : (
            history.slice(0, 10).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setRequestText(entry.request)}
                className="truncate rounded px-1.5 py-1 text-left text-step-11 text-text-muted hover:bg-hover"
                title={entry.request}
              >
                {formatDate(locale, entry.createdAt)} — {entry.request}
              </button>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}
