// The editor header's project controls, CapCut-style: editable name, save
// state, undo/redo and project settings. Mounted by StudioHeader only when the
// editor runs inside Creator.

import { useEffect, useState } from "react";
import {
  ArrowArcLeft,
  ArrowArcRight,
  CheckCircle,
  CircleNotch,
  GearSix,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button, IconButton, Tooltip, cn } from "../../components/ui";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { hasStudioPendingEdits, isStudioEditSaving } from "../../utils/studioPendingEdits";
import { useCreatorEditorControls } from "../CreatorEditorContext";
import { useI18n } from "../i18n";
import {
  isValidSettings,
  readCompositionSettings,
  saveCompositionSettings,
  type CompositionSettings,
} from "../projectSettings";
import { useStudioBridge } from "../studioBridge";
import { ErrorBanner, Field, Modal, CtaButton, errorMessage, inputClass } from "./common";

const SAVE_POLL_MS = 400;

export function ProjectTitleField({ fallback }: { fallback: string }) {
  const { t } = useI18n();
  const creator = useCreatorEditorControls();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const title = creator?.project?.title ?? fallback;

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if (!creator || !next || next === title) return;
    await creator.updateProject({ title: next }).catch(() => undefined);
  };

  if (!editing) {
    return (
      <Tooltip label={t("header.renameHint")} side="bottom">
        <button
          type="button"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className="max-w-64 truncate rounded px-1.5 py-0.5 text-step-11 font-medium text-text-1 hover:bg-hover"
          aria-label={t("header.rename")}
        >
          {title}
        </button>
      </Tooltip>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      maxLength={120}
      aria-label={t("header.rename")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") void commit();
        if (event.key === "Escape") setEditing(false);
        event.stopPropagation();
      }}
      className="h-ctl-sm w-56 rounded border border-accent bg-input px-1.5 text-step-11 text-text-0 outline-none"
    />
  );
}

type SaveState = "saved" | "saving" | "error";

function useSaveState(): SaveState {
  const bridge = useStudioBridge();
  const [state, setState] = useState<SaveState>("saved");
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const read = () =>
      setState(
        bridge?.writeBlockedReason
          ? "error"
          : isStudioEditSaving() || hasStudioPendingEdits()
            ? "saving"
            : "saved",
      );
    read();
    const timer = window.setInterval(read, SAVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [bridge?.writeBlockedReason]);
  return state;
}

export function SaveStatus() {
  const { t } = useI18n();
  const state = useSaveState();
  const bridge = useStudioBridge();
  const label =
    state === "saving"
      ? t("header.saving")
      : state === "error"
        ? t("header.saveError")
        : t("header.saved");
  return (
    <Tooltip
      label={state === "error" ? (bridge?.writeBlockedReason ?? label) : label}
      side="bottom"
    >
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1 text-step-11",
          state === "error"
            ? "text-danger-ink"
            : state === "saving"
              ? "text-text-muted"
              : "text-text-off",
        )}
      >
        {state === "saving" ? (
          <CircleNotch size={13} className="animate-spin motion-reduce:animate-none" />
        ) : state === "error" ? (
          <WarningCircle size={13} />
        ) : (
          <CheckCircle size={13} />
        )}
        <span className="max-[1200px]:hidden">{label}</span>
      </span>
    </Tooltip>
  );
}

export function HeaderHistoryButtons() {
  const { t } = useI18n();
  const shell = useStudioShellContext();
  const { canUndo, canRedo, undoLabel, redoLabel } = shell.editHistory;
  return (
    <div className="flex items-center">
      <Tooltip
        label={undoLabel ? `${t("header.undo")} : ${undoLabel} (⌘Z)` : `${t("header.undo")} (⌘Z)`}
        side="bottom"
      >
        <IconButton
          aria-label={t("header.undo")}
          icon={<ArrowArcLeft size={15} />}
          disabled={!canUndo}
          onClick={() => void shell.handleUndo()}
        />
      </Tooltip>
      <Tooltip
        label={redoLabel ? `${t("header.redo")} : ${redoLabel} (⌘⇧Z)` : `${t("header.redo")} (⌘⇧Z)`}
        side="bottom"
      >
        <IconButton
          aria-label={t("header.redo")}
          icon={<ArrowArcRight size={15} />}
          disabled={!canRedo}
          onClick={() => void shell.handleRedo()}
        />
      </Tooltip>
    </div>
  );
}

const FORMATS: Array<{ label: string; width: number; height: number }> = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:5", width: 1080, height: 1350 },
];
const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function ProjectSettingsButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip label={t("header.settings")} side="bottom">
        <IconButton
          aria-label={t("header.settings")}
          data-testid="creator-settings"
          icon={<GearSix size={15} />}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      {open && <ProjectSettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const bridge = useStudioBridge();
  const creator = useCreatorEditorControls();
  const [settings, setSettings] = useState<CompositionSettings | null>(null);
  const [fps, setFps] = useState(creator?.project?.fps ?? 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!bridge) return;
    bridge
      .readProjectFile("index.html")
      .then((html) => setSettings(readCompositionSettings(html)))
      .catch((caught: unknown) => setError(errorMessage(caught, t)));
    // Read once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!bridge || !settings || !creator) return;
    if (!isValidSettings(settings)) {
      setError(t("settings.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveCompositionSettings(bridge, settings);
      if (fps !== creator.project?.fps) await creator.updateProject({ fps });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage(caught, t));
      setBusy(false);
    }
  };

  const set = (patch: Partial<CompositionSettings>) =>
    setSettings((current) => (current ? { ...current, ...patch } : current));

  return (
    <Modal
      title={t("settings.title")}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("wizard.cancel")}
          </Button>
          <CtaButton disabled={!settings || busy} onClick={() => void save()}>
            {t("settings.apply")}
          </CtaButton>
        </>
      }
    >
      {!settings && !error && (
        <p className="text-step-12 text-text-muted">{t("dashboard.loading")}</p>
      )}
      {settings && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2">
            {FORMATS.map((format) => (
              <button
                key={format.label}
                type="button"
                aria-pressed={settings.width === format.width && settings.height === format.height}
                onClick={() => set({ width: format.width, height: format.height })}
                className={cn(
                  "h-ctl-lg rounded-md border text-step-12",
                  settings.width === format.width && settings.height === format.height
                    ? "border-accent bg-accent/10 text-text-0"
                    : "border-border-strong text-text-muted hover:bg-hover",
                )}
              >
                {format.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t("wizard.width")} htmlFor="settings-width">
              <input
                id="settings-width"
                type="number"
                step={2}
                className={inputClass}
                value={settings.width}
                onChange={(event) => set({ width: Number(event.target.value) })}
              />
            </Field>
            <Field label={t("wizard.height")} htmlFor="settings-height">
              <input
                id="settings-height"
                type="number"
                step={2}
                className={inputClass}
                value={settings.height}
                onChange={(event) => set({ height: Number(event.target.value) })}
              />
            </Field>
            <Field label={t("wizard.fps")} htmlFor="settings-fps">
              <select
                id="settings-fps"
                className={inputClass}
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
              >
                {FPS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.duration")} htmlFor="settings-duration">
              <input
                id="settings-duration"
                type="number"
                step={0.5}
                className={inputClass}
                value={settings.duration}
                onChange={(event) => set({ duration: Number(event.target.value) })}
              />
            </Field>
          </div>
          <p className="text-step-11 text-text-off">{t("settings.hint")}</p>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </Modal>
  );
}
