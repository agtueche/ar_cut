import { ManualSaveSession } from "./components/ManualSaveSession";
import { allowStudioNavigation } from "./studioNavigation";
// Hyperframes Creator's top level: the dashboard at #/<tab>, Studio at
// #project/<id> (Studio's own hash format, so every Studio deep link still works).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildProjectHash, parseProjectIdFromHash } from "../utils/projectRouting";
import { AssistantPanel } from "./components/AssistantPanel";
import { Dashboard, type DashboardTab } from "./components/Dashboard";
import {
  CreatorEditorContext,
  type CreatorEditorControls,
  type CreatorPanel,
} from "./CreatorEditorContext";
import { creatorApi, type ProjectSummary } from "./creatorApi";
import { useI18n } from "./i18n";

const TABS: DashboardTab[] = ["projets", "modeles", "exports", "corbeille"];

export function dashboardTabFromHash(hash: string): DashboardTab {
  const name = hash.replace(/^#\/?/, "").split(/[/?]/)[0] ?? "";
  return TABS.find((tab) => tab === name) ?? "projets";
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    let pending = false;
    const changed = async () => {
      if (pending) return;
      const next = window.location.hash;
      if (next === hash) return;
      // Selection, playhead and panel changes update the hash inside the same Studio.
      // Only leaving its project should ask whether to save the montage.
      if (parseProjectIdFromHash(next) === parseProjectIdFromHash(hash)) {
        setHash(next);
        return;
      }
      pending = true;
      if (await allowStudioNavigation()) setHash(next);
      else
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + hash,
        );
      pending = false;
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, [hash]);
  return hash;
}

function EditorFrame({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<CreatorPanel | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    let live = true;
    creatorApi
      .listProjects()
      .then(({ projects }) => {
        if (live) setProject(projects.find((item) => item.id === projectId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);
  const controls = useMemo<CreatorEditorControls>(
    () => ({
      backToProjects: () => {
        window.location.hash = "#/projets";
      },
      togglePanel: (panel) => setOpenPanel((open) => (open === panel ? null : panel)),
      openPanel,
      projectTitle: project?.title ?? null,
      project,
      updateProject: async (patch) => {
        const response = await fetch(
          `/api/studio-session/${encodeURIComponent(projectId)}/metadata`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
        setProject((current) => (current ? { ...current, ...result } : current));
      },
    }),
    [openPanel, project, projectId],
  );
  return (
    <CreatorEditorContext.Provider value={controls}>
      <ManualSaveSession projectId={projectId}>{children}</ManualSaveSession>
      {openPanel === "assistant" && (
        <AssistantPanel projectId={projectId} onClose={() => setOpenPanel(null)} />
      )}
    </CreatorEditorContext.Provider>
  );
}

export function CreatorRoot({ renderEditor }: { renderEditor: () => ReactNode }) {
  const hash = useHash();
  const projectId = parseProjectIdFromHash(hash);
  useI18n();

  if (projectId) {
    return (
      <EditorFrame key={projectId} projectId={projectId}>
        {renderEditor()}
      </EditorFrame>
    );
  }

  return (
    <Dashboard
      tab={dashboardTabFromHash(hash)}
      onNavigate={(tab) => {
        window.location.hash = `#/${tab}`;
      }}
      onOpenProject={(id) => {
        void creatorApi.markOpened(id).catch(() => undefined);
        window.location.hash = buildProjectHash(id);
      }}
    />
  );
}
