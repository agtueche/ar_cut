import { useState } from "react";
import { Copy, DotsThreeVertical, PencilSimple, Play, Trash } from "@phosphor-icons/react";
import { Menu, MenuItem, cn } from "../../components/ui";
import { projectThumbnailUrl, type ProjectSummary } from "../creatorApi";
import { formatDate, formatDuration, useI18n } from "../i18n";

export interface ProjectActions {
  open: (project: ProjectSummary) => void;
  duplicate: (project: ProjectSummary) => void;
  rename: (project: ProjectSummary) => void;
  remove: (project: ProjectSummary) => void;
}

export function formatLabel(project: ProjectSummary, unknown: string, fpsUnit = "i/s"): string {
  if (!project.width || !project.height) return unknown;
  const ratio = project.width / project.height;
  const name =
    Math.abs(ratio - 16 / 9) < 0.02
      ? "16:9"
      : Math.abs(ratio - 9 / 16) < 0.02
        ? "9:16"
        : Math.abs(ratio - 1) < 0.02
          ? "1:1"
          : `${project.width}×${project.height}`;
  return `${name} · ${project.fps} ${fpsUnit}`;
}

function Thumbnail({ project }: { project: ProjectSummary }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-raised">
      {!failed && (
        <img
          src={projectThumbnailUrl(project)}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-contain transition-opacity",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {(!loaded || failed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-raised to-bg-0">
          <span className="text-step-12 font-semibold text-text-muted">
            {project.width && project.height ? `${project.width}×${project.height}` : "…"}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-step-11 text-white">
        {formatDuration(project.duration)}
      </span>
    </div>
  );
}

function ActionsMenu({ project, actions }: { project: ProjectSummary; actions: ProjectActions }) {
  const { t } = useI18n();
  const row = (icon: React.ReactNode, label: string) => (
    <span className="flex items-center gap-2">
      {icon}
      {label}
    </span>
  );
  return (
    <Menu
      aria-label={t("project.actions")}
      align="end"
      trigger={
        <button
          type="button"
          aria-label={t("project.actions")}
          className="flex size-ctl items-center justify-center rounded-md text-text-2 hover:bg-hover hover:text-text-0"
        >
          <DotsThreeVertical size={18} weight="bold" />
        </button>
      }
    >
      <MenuItem onClick={() => actions.open(project)}>
        {row(<Play size={14} />, t("project.open"))}
      </MenuItem>
      <MenuItem onClick={() => actions.rename(project)}>
        {row(<PencilSimple size={14} />, t("project.rename"))}
      </MenuItem>
      <MenuItem onClick={() => actions.duplicate(project)}>
        {row(<Copy size={14} />, t("project.duplicate"))}
      </MenuItem>
      <MenuItem tone="danger" onClick={() => actions.remove(project)}>
        {row(<Trash size={14} />, t("project.delete"))}
      </MenuItem>
    </Menu>
  );
}

export function ProjectCard({
  project,
  actions,
}: {
  project: ProjectSummary;
  actions: ProjectActions;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-accent/60">
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => actions.open(project)}
        aria-label={`${t("project.open")} ${project.title}`}
      >
        <Thumbnail key={project.modifiedAt} project={project} />
      </button>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-step-13 font-semibold text-text-0" title={project.title}>
            {project.title}
          </h3>
          <p className="truncate text-step-11 text-text-muted">
            {formatLabel(project, t("project.unknownFormat"), t("unit.fps"))}
          </p>
          <p className="truncate text-step-11 text-text-off">
            {t("project.modified", { date: formatDate(locale, project.modifiedAt) })}
          </p>
        </div>
        <ActionsMenu project={project} actions={actions} />
      </div>
    </article>
  );
}

export function ProjectRow({
  project,
  actions,
}: {
  project: ProjectSummary;
  actions: ProjectActions;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center gap-4 border-b border-border px-3 py-2 last:border-b-0 hover:bg-hover">
      <button
        type="button"
        onClick={() => actions.open(project)}
        className="min-w-0 flex-1 truncate text-left text-step-13 font-medium text-text-0"
      >
        {project.title}
      </button>
      <span className="hidden w-36 text-step-11 text-text-muted md:block">
        {formatLabel(project, t("project.unknownFormat"), t("unit.fps"))}
      </span>
      <span className="hidden w-16 font-mono text-step-11 text-text-muted sm:block">
        {formatDuration(project.duration)}
      </span>
      <span className="hidden w-44 text-step-11 text-text-muted lg:block">
        {formatDate(locale, project.modifiedAt)}
      </span>
      <span className="hidden w-20 text-step-11 text-text-off lg:block">
        {t("project.renders", { count: project.renderCount })}
      </span>
      <ActionsMenu project={project} actions={actions} />
    </div>
  );
}
