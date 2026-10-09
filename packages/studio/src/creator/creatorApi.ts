// Typed client for /api/creator/* (served by vite.creator.ts) plus the few
// Studio API routes the Creator screens reuse (thumbnails, renders, history).

import { studioApiFetch } from "../utils/studioApiFetch";
import type { ProjectSummary, AssistantRequest } from "../../creator-server/projectMeta";
import type { TrashEntry, ExportEntry } from "../../creator-server/projectOps";
import type { PublicTemplate } from "../../creator-server/templates";
import type { EnvironmentCheck } from "../../creator-server/environment";

export type {
  ProjectSummary,
  AssistantRequest,
  TrashEntry,
  ExportEntry,
  PublicTemplate,
  EnvironmentCheck,
};

export class CreatorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CreatorApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await studioApiFetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CreatorApiError("network", 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new CreatorApiError(message, response.status);
  }
  return payload as T;
}

const base = "/api/creator";
const enc = encodeURIComponent;

export interface CreateProjectPayload {
  title: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  template: string | null;
}

export const creatorApi = {
  workspace: () => request<{ home: string; projectsDir: string }>("GET", `${base}/workspace`),
  listProjects: () => request<{ projects: ProjectSummary[] }>("GET", `${base}/projects`),
  createProject: (payload: CreateProjectPayload) =>
    request<{ project: ProjectSummary }>("POST", `${base}/projects`, payload),
  duplicateProject: (id: string) =>
    request<{ project: ProjectSummary }>("POST", `${base}/projects/${enc(id)}/duplicate`, {}),
  renameProject: (id: string, title: string) =>
    request<{ project: ProjectSummary }>("PATCH", `${base}/projects/${enc(id)}`, { title }),
  updateProject: (id: string, patch: { title?: string; fps?: number }) =>
    request<{ project: ProjectSummary }>("PATCH", `${base}/projects/${enc(id)}`, patch),
  trashProject: (id: string) =>
    request<{ trashed: TrashEntry }>("DELETE", `${base}/projects/${enc(id)}`),
  markOpened: (id: string) =>
    request<{ ok: true }>("POST", `${base}/projects/${enc(id)}/opened`, {}),
  listTrash: () => request<{ entries: TrashEntry[] }>("GET", `${base}/trash`),
  restore: (trashId: string) =>
    request<{ project: ProjectSummary }>("POST", `${base}/trash/${enc(trashId)}/restore`, {}),
  purge: (trashId: string) => request<{ ok: true }>("DELETE", `${base}/trash/${enc(trashId)}`),
  listTemplates: () => request<{ templates: PublicTemplate[] }>("GET", `${base}/templates`),
  listExports: () => request<{ exports: ExportEntry[] }>("GET", `${base}/exports`),
  environment: () => request<{ checks: EnvironmentCheck[] }>("GET", `${base}/environment`),
  assistantHistory: (id: string) =>
    request<{ entries: AssistantRequest[] }>("GET", `${base}/projects/${enc(id)}/assistant`),
  prepareAssistantPrompt: (
    id: string,
    payload: {
      request: string;
      compositionPath: string;
      currentTime: number | null;
      selection: unknown;
    },
  ) =>
    request<{ prompt: string; entry: AssistantRequest }>(
      "POST",
      `${base}/projects/${enc(id)}/assistant/prompt`,
      payload,
    ),
};

/** A frame of the project's root composition, rendered by Studio's thumbnail route. */
export function projectThumbnailUrl(project: ProjectSummary): string {
  const width = project.width ?? 1920;
  const height = project.height ?? 1080;
  const params = new URLSearchParams({
    t: String(Math.min(2, (project.duration ?? 4) / 2)),
    w: String(width),
    h: String(height),
    v: project.modifiedAt,
  });
  return `/api/projects/${enc(project.id)}/thumbnail/index.html?${params.toString()}`;
}

export function exportFileUrl(entry: ExportEntry): string {
  return `/api/projects/${enc(entry.projectId)}/renders/file/${enc(entry.filename)}`;
}

// --- Studio history (shared with the editor's undo stack) -------------------

export interface HistoryEntryView {
  id: string;
  label: string;
  who: { kind: "person" | "agent" | "outside"; name: string };
  startedAt: number;
  endedAt: number;
  files: Array<{ path: string }>;
  undone: boolean;
  pinned: boolean;
  undoes?: string;
  restoredTo?: string;
}

export const historyApi = {
  /** Cheap content signature; it changes whenever a project file changes on disk. */
  signature: (projectId: string) =>
    request<{ signature: string }>("GET", `/api/projects/${enc(projectId)}/signature`),
  /**
   * Commits changes made outside the app (Claude Code, an editor) as a history
   * entry. Opening a window settles every pending change first; closing it right
   * away records nothing of its own.
   */
  settle: async (projectId: string) => {
    const opened = await request<{ windowId: string }>(
      "POST",
      `/api/projects/${enc(projectId)}/history/window`,
      { label: "Ar cut" },
    );
    await request<unknown>(
      "POST",
      `/api/projects/${enc(projectId)}/history/window/${enc(opened.windowId)}/close`,
      {},
    );
  },
  list: (projectId: string) =>
    request<{ entries: HistoryEntryView[] }>("GET", `/api/projects/${enc(projectId)}/history`),
  undo: (projectId: string, entryId: string) =>
    request<unknown>("POST", `/api/projects/${enc(projectId)}/history/undo`, {
      entryId,
      mode: "just-this",
    }),
  restore: (projectId: string, point: string) =>
    request<unknown>("POST", `/api/projects/${enc(projectId)}/history/restore`, { point }),
};
