import { createContext, useContext } from "react";
import type { ProjectSummary } from "../../creator-server/projectMeta";

/** What Studio's header needs from Creator when a project is open inside it. */
export type CreatorPanel = "add" | "assistant";

export interface CreatorEditorControls {
  backToProjects: () => void;
  togglePanel: (panel: CreatorPanel) => void;
  openPanel: CreatorPanel | null;
  /** The project's display title (Creator's manifest); null until loaded. */
  projectTitle: string | null;
  /** Creator's summary of the open project (title, fps…); null until loaded. */
  project: ProjectSummary | null;
  /** Saves a title and/or frame rate change, then refreshes `project`. */
  updateProject: (patch: { title?: string; fps?: number }) => Promise<void>;
}

export const CreatorEditorContext = createContext<CreatorEditorControls | null>(null);

/** Null when Studio runs on its own (CLI preview, tests): the header then shows nothing extra. */
export function useCreatorEditorControls(): CreatorEditorControls | null {
  return useContext(CreatorEditorContext);
}
