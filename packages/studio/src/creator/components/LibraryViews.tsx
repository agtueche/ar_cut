import { useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  FolderOpen,
  Play,
  Sparkle,
  Trash,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button, cn } from "../../components/ui";
import {
  exportFileUrl,
  type EnvironmentCheck,
  type ExportEntry,
  type PublicTemplate,
  type TrashEntry,
} from "../creatorApi";
import { formatBytes, formatDate, useI18n, type MessageKey } from "../i18n";
import { EmptyState, Modal } from "./common";

const TEMPLATE_ACCENTS: Record<string, string> = {
  marketing: "from-accent to-cta",
  education: "from-text-0 to-accent",
  motion: "from-bg-0 to-cta",
  business: "from-raised to-accent",
  social: "from-accent/40 to-bg-0",
};

export function TemplatesView({
  templates,
  onUse,
}: {
  templates: PublicTemplate[];
  onUse: (template: PublicTemplate) => void;
}) {
  const { t } = useI18n();
  if (templates.length === 0) {
    return <EmptyState icon={<Sparkle size={40} />} title={t("templates.empty")} />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => {
        const vertical = template.height > template.width;
        return (
          <article
            key={template.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
          >
            <div
              className={cn(
                "flex aspect-video items-center justify-center bg-gradient-to-br",
                TEMPLATE_ACCENTS[template.category] ?? "from-raised to-bg-0",
              )}
            >
              <span
                className="rounded-md border-2 border-white/80 bg-black/20"
                style={vertical ? { width: 54, height: 96 } : { width: 128, height: 72 }}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="text-step-14 font-semibold text-text-0">{template.title}</h3>
              <p className="flex-1 text-step-12 text-text-muted">{template.description}</p>
              <p className="text-step-11 text-text-off">
                {template.width}×{template.height} · {template.duration} s · {template.fps}{" "}
                {t("unit.fps")}
              </p>
              <Button variant="primary" onClick={() => onUse(template)}>
                {t("templates.use")}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ExportsView({
  exports,
  onOpenProject,
}: {
  exports: ExportEntry[];
  onOpenProject: (projectId: string) => void;
}) {
  const { t, locale } = useI18n();
  const [playing, setPlaying] = useState<ExportEntry | null>(null);
  if (exports.length === 0) {
    return <EmptyState icon={<VideoCamera size={40} />} title={t("exports.empty")} />;
  }
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {exports.map((entry) => (
          <div
            key={`${entry.projectId}/${entry.filename}`}
            className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-step-13 font-medium text-text-0">{entry.filename}</p>
              <p className="text-step-11 text-text-muted">
                {entry.projectTitle} · {formatBytes(locale, entry.size)} ·{" "}
                {formatDate(locale, entry.createdAt)}
              </p>
            </div>
            <Button variant="secondary" icon={<Play size={14} />} onClick={() => setPlaying(entry)}>
              {t("exports.play")}
            </Button>
            <a
              href={exportFileUrl(entry)}
              download={entry.filename}
              className="inline-flex h-ctl items-center gap-1.5 rounded-md border border-border-strong px-3 text-step-12 text-text-1 hover:bg-hover"
            >
              <DownloadSimple size={14} />
              {t("exports.download")}
            </a>
            <Button
              variant="ghost"
              icon={<FolderOpen size={14} />}
              onClick={() => onOpenProject(entry.projectId)}
            >
              {t("exports.open")}
            </Button>
          </div>
        ))}
      </div>
      {playing && (
        <Modal title={playing.filename} onClose={() => setPlaying(null)} width={960}>
          <video
            src={exportFileUrl(playing)}
            controls
            autoPlay
            className="max-h-[70vh] w-full rounded-lg bg-black"
          />
        </Modal>
      )}
    </>
  );
}

export function TrashView({
  entries,
  onRestore,
  onPurge,
}: {
  entries: TrashEntry[];
  onRestore: (entry: TrashEntry) => void;
  onPurge: (entry: TrashEntry) => void;
}) {
  const { t, locale } = useI18n();
  if (entries.length === 0) {
    return <EmptyState icon={<Trash size={40} />} title={t("trash.empty")} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {entries.map((entry) => (
        <div
          key={entry.trashId}
          className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-step-13 font-medium text-text-0">{entry.title}</p>
            <p className="text-step-11 text-text-muted">
              {t("trash.deleted", { date: formatDate(locale, entry.deletedAt) })}
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<ArrowCounterClockwise size={14} />}
            onClick={() => onRestore(entry)}
          >
            {t("trash.restore")}
          </Button>
          <Button variant="danger" icon={<Trash size={14} />} onClick={() => onPurge(entry)}>
            {t("trash.purge")}
          </Button>
        </div>
      ))}
    </div>
  );
}

const CHECK_LABELS: Record<EnvironmentCheck["id"], MessageKey> = {
  ffmpeg: "env.ffmpeg",
  ffprobe: "env.ffprobe",
  browser: "env.browser",
  whisper: "env.whisper",
};

export function EnvironmentStatus({ checks }: { checks: EnvironmentCheck[] | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!checks) return null;
  const blocking = checks.filter((check) => check.required && check.status === "missing");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-ctl items-center gap-1.5 rounded-md px-2.5 text-step-11 font-medium",
          blocking.length
            ? "bg-danger/15 text-danger-ink"
            : "bg-accent/10 text-accent-ink hover:bg-accent/20",
        )}
        title={t("env.title")}
      >
        {blocking.length ? <WarningCircle size={14} /> : <CheckCircle size={14} />}
        <span className="max-sm:hidden">{blocking.length ? t("env.missing") : t("env.ok")}</span>
      </button>
      {open && (
        <Modal title={t("env.title")} onClose={() => setOpen(false)}>
          <ul className="flex flex-col gap-3">
            {checks.map((check) => (
              <li key={check.id} className="flex gap-3">
                <span className={check.status === "ok" ? "text-accent-ink" : "text-danger-ink"}>
                  {check.status === "ok" ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-step-13 font-medium text-text-0">
                    {t(CHECK_LABELS[check.id])}
                    {!check.required && (
                      <span className="ml-1.5 text-step-11 text-text-off">
                        ({t("env.optional")})
                      </span>
                    )}
                  </p>
                  <p className="break-all text-step-11 text-text-muted">{check.detail}</p>
                  {check.hint && (
                    <code className="mt-1 inline-block rounded bg-raised px-1.5 py-0.5 text-step-11 text-text-0">
                      {check.hint}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
