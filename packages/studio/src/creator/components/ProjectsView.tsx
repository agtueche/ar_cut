import { useMemo, useState } from "react";
import { FilmStrip, ListBullets, MagnifyingGlass, Plus, SquaresFour } from "@phosphor-icons/react";
import { cn } from "../../components/ui";
import type { ProjectSummary } from "../creatorApi";
import { useI18n, type MessageKey } from "../i18n";
import { CtaButton, EmptyState } from "./common";
import { ProjectCard, ProjectRow, type ProjectActions } from "./ProjectCard";

export type SortKey = "modified" | "title" | "created";
type ViewMode = "grid" | "list";

const SORTS: Array<{ id: SortKey; label: MessageKey }> = [
  { id: "modified", label: "dashboard.sort.modified" },
  { id: "title", label: "dashboard.sort.title" },
  { id: "created", label: "dashboard.sort.created" },
];

const VIEW_KEY = "hf-creator-view";

function readViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function sortProjects(projects: ProjectSummary[], sort: SortKey): ProjectSummary[] {
  const copy = [...projects];
  if (sort === "title") return copy.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  if (sort === "created") return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return copy.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function filterProjects(projects: ProjectSummary[], query: string): ProjectSummary[] {
  const needle = query
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!needle) return projects;
  return projects.filter((project) =>
    `${project.title} ${project.id}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .includes(needle),
  );
}

export function recentProjects(projects: ProjectSummary[], limit = 4): ProjectSummary[] {
  return projects
    .filter((project) => project.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))
    .slice(0, limit);
}

export function ProjectsView({
  projects,
  actions,
  onNewProject,
}: {
  projects: ProjectSummary[];
  actions: ProjectActions;
  onNewProject: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("modified");
  const [view, setView] = useState<ViewMode>(readViewMode);

  const visible = useMemo(
    () => sortProjects(filterProjects(projects, query), sort),
    [projects, query, sort],
  );
  const recent = useMemo(() => recentProjects(projects), [projects]);

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The choice lasts for this tab only.
    }
  };

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FilmStrip size={40} />}
        title={t("dashboard.empty.title")}
        body={t("dashboard.empty.body")}
        action={
          <CtaButton icon={<Plus size={16} weight="bold" />} onClick={onNewProject}>
            {t("dashboard.newProject")}
          </CtaButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {recent.length > 0 && !query && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-3 text-step-13 font-semibold text-text-muted">
            {t("dashboard.recent")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((project) => (
              <ProjectCard key={project.id} project={project} actions={actions} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="all-heading" className="mr-auto text-step-13 font-semibold text-text-muted">
            {t("dashboard.all")} ({projects.length})
          </h2>
          <label className="relative flex items-center">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-2.5 text-text-off"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("dashboard.search")}
              aria-label={t("dashboard.search")}
              className="h-ctl w-56 rounded-md border border-border-strong bg-input pl-8 pr-2 text-step-12 text-text-0 outline-none placeholder:text-text-off focus:border-accent"
            />
          </label>
          <select
            aria-label={t("dashboard.sort")}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-ctl rounded-md border border-border-strong bg-input px-2 text-step-12 text-text-0"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-border-strong">
            {(
              [
                ["grid", <SquaresFour key="g" size={16} />, "dashboard.view.grid"],
                ["list", <ListBullets key="l" size={16} />, "dashboard.view.list"],
              ] as const
            ).map(([mode, icon, label]) => (
              <button
                key={mode}
                type="button"
                title={t(label)}
                aria-label={t(label)}
                aria-pressed={view === mode}
                onClick={() => changeView(mode)}
                className={cn(
                  "flex h-ctl w-8 items-center justify-center",
                  view === mode ? "bg-accent/15 text-accent-ink" : "text-text-muted hover:bg-hover",
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-border px-4 py-8 text-center text-step-12 text-text-muted">
            {t("dashboard.noResults", { query })}
          </p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((project) => (
              <ProjectCard key={project.id} project={project} actions={actions} />
            ))}
          </div>
        ) : (
          <div className="overflow-visible rounded-lg border border-border bg-surface">
            {visible.map((project) => (
              <ProjectRow key={project.id} project={project} actions={actions} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
