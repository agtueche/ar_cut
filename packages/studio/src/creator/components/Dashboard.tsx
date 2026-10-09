import { useCallback, useEffect, useState } from "react";
import { Plus, Translate as TranslateIcon } from "@phosphor-icons/react";
import { Button, cn } from "../../components/ui";
import { ArCutLogo } from "../../components/ui/ArCutLogo";
import {
  creatorApi,
  type EnvironmentCheck,
  type ExportEntry,
  type ProjectSummary,
  type PublicTemplate,
  type TrashEntry,
} from "../creatorApi";
import { setLocale, useI18n, type MessageKey } from "../i18n";
import { CtaButton, ErrorBanner, Field, Modal, errorMessage, inputClass } from "./common";
import { EnvironmentStatus, ExportsView, TemplatesView, TrashView } from "./LibraryViews";
import { NewProjectWizard } from "./NewProjectWizard";
import type { ProjectActions } from "./ProjectCard";
import { ProjectsView } from "./ProjectsView";

export type DashboardTab = "projets" | "modeles" | "exports" | "corbeille";

const TABS: Array<{ id: DashboardTab; label: MessageKey }> = [
  { id: "projets", label: "nav.projects" },
  { id: "modeles", label: "nav.templates" },
  { id: "exports", label: "nav.exports" },
  { id: "corbeille", label: "nav.trash" },
];

type Dialog =
  | { kind: "wizard"; template: string | null }
  | { kind: "rename"; project: ProjectSummary }
  | { kind: "delete"; project: ProjectSummary }
  | { kind: "purge"; entry: TrashEntry }
  | null;

interface DashboardData {
  projects: ProjectSummary[];
  templates: PublicTemplate[];
  exports: ExportEntry[];
  trash: TrashEntry[];
  projectsDir: string;
}

export function Dashboard({
  tab,
  onNavigate,
  onOpenProject,
}: {
  tab: DashboardTab;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [checks, setChecks] = useState<EnvironmentCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [projects, templates, exportsList, trash, workspace] = await Promise.all([
        creatorApi.listProjects(),
        creatorApi.listTemplates(),
        creatorApi.listExports(),
        creatorApi.listTrash(),
        creatorApi.workspace(),
      ]);
      setData({
        projects: projects.projects,
        templates: templates.templates,
        exports: exportsList.exports,
        trash: trash.entries,
        projectsDir: workspace.projectsDir,
      });
    } catch (caught) {
      setError(errorMessage(caught, t));
    }
  }, [t]);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    void load();
    creatorApi
      .environment()
      .then((result) => setChecks(result.checks))
      .catch(() => setChecks(null));
    // Reload when returning to the tab: an export or an outside edit may have landed.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // `load` changes with the locale only; one subscription per mount is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dialogError, setDialogError] = useState<string | null>(null);
  const run = async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      await task();
      setDialog(null);
      await load();
    } catch (caught) {
      // An open dialog covers the page banner: show the error where the user is looking.
      if (dialog) setDialogError(errorMessage(caught, t));
      else setError(errorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  };
  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const actions: ProjectActions = {
    open: (project) => onOpenProject(project.id),
    duplicate: (project) => void run(() => creatorApi.duplicateProject(project.id)),
    rename: (project) => setDialog({ kind: "rename", project }),
    remove: (project) => setDialog({ kind: "delete", project }),
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-bg-0 text-text-0">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <ArCutLogo />
        </div>
        <nav aria-label="Navigation" className="flex gap-1 max-md:order-last max-md:w-full">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "h-ctl rounded-md px-3 text-step-12 font-medium",
                tab === item.id ? "bg-raised text-text-0" : "text-text-muted hover:bg-hover",
              )}
            >
              {t(item.label)}
              {item.id === "corbeille" &&
                data &&
                data.trash.length > 0 &&
                ` (${data.trash.length})`}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <EnvironmentStatus checks={checks} />
          <Button
            variant="ghost"
            icon={<TranslateIcon size={16} />}
            aria-label={t("nav.language")}
            title={t("nav.language")}
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
          >
            {locale.toUpperCase()}
          </Button>
          <CtaButton
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setDialog({ kind: "wizard", template: null })}
          >
            {t("dashboard.newProject")}
          </CtaButton>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {error && (
          <ErrorBanner message={error} onRetry={() => void load()} retryLabel={t("error.retry")} />
        )}
        {!data && !error && (
          <p className="text-step-12 text-text-muted">{t("dashboard.loading")}</p>
        )}
        {data && tab === "projets" && (
          <ProjectsView
            projects={data.projects}
            actions={actions}
            onNewProject={() => setDialog({ kind: "wizard", template: null })}
          />
        )}
        {data && tab === "modeles" && (
          <TemplatesView
            templates={data.templates}
            onUse={(template) => setDialog({ kind: "wizard", template: template.id })}
          />
        )}
        {data && tab === "exports" && (
          <ExportsView exports={data.exports} onOpenProject={onOpenProject} />
        )}
        {data && tab === "corbeille" && (
          <TrashView
            entries={data.trash}
            onRestore={(entry) => void run(() => creatorApi.restore(entry.trashId))}
            onPurge={(entry) => setDialog({ kind: "purge", entry })}
          />
        )}
        {data && (
          <p className="mt-auto pt-6 text-step-11 text-text-off">
            {t("dashboard.workspace", { path: data.projectsDir })}
          </p>
        )}
      </main>

      {dialog?.kind === "wizard" && data && (
        <NewProjectWizard
          templates={data.templates}
          initialTemplate={dialog.template}
          onClose={() => setDialog(null)}
          onCreated={(project) => {
            setDialog(null);
            onOpenProject(project.id);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameDialog
          project={dialog.project}
          busy={busy}
          error={dialogError}
          onClose={closeDialog}
          onSubmit={(title) => void run(() => creatorApi.renameProject(dialog.project.id, title))}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={t("project.delete")}
          body={t("project.deleteConfirm", { title: dialog.project.title })}
          confirmLabel={t("project.delete")}
          busy={busy}
          error={dialogError}
          onClose={closeDialog}
          onConfirm={() => void run(() => creatorApi.trashProject(dialog.project.id))}
        />
      )}
      {dialog?.kind === "purge" && (
        <ConfirmDialog
          title={t("trash.purge")}
          body={t("trash.purgeConfirm", { title: dialog.entry.title })}
          confirmLabel={t("trash.purge")}
          busy={busy}
          error={dialogError}
          onClose={closeDialog}
          onConfirm={() => void run(() => creatorApi.purge(dialog.entry.trashId))}
        />
      )}
    </div>
  );
}

function RenameDialog({
  project,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  project: ProjectSummary;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(project.title);
  return (
    <Modal
      title={t("project.rename")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("wizard.cancel")}
          </Button>
          <CtaButton disabled={!title.trim() || busy} onClick={() => onSubmit(title.trim())}>
            {t("project.rename")}
          </CtaButton>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) onSubmit(title.trim());
        }}
      >
        <Field label={t("project.renamePrompt")} htmlFor="rename-title">
          <input
            id="rename-title"
            className={inputClass}
            value={title}
            maxLength={120}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        {error && (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        )}
      </form>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("wizard.cancel")}
          </Button>
          <Button variant="danger" size="lg" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-step-13 text-text-1">{body}</p>
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </Modal>
  );
}
