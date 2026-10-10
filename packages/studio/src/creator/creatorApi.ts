// Typed client for /api/creator/* (served by vite.creator.ts) plus the few
// Studio API routes the Creator screens reuse (thumbnails, renders, history).

import { studioApiFetch } from "../utils/studioApiFetch";
import type { ProjectSummary, AssistantRequest } from "../../creator-server/projectMeta";
import type { TrashEntry, ExportEntry } from "../../creator-server/projectOps";
import type { PublicTemplate } from "../../creator-server/templates";
import type { EnvironmentCheck } from "../../creator-server/environment";
import type { MediaFolder, FolderItem, FolderColor } from "../../creator-server/folders";
import type { MediaInfo } from "../../creator-server/sessionMediaInfo";
import type { LibraryItem } from "../../creator-server/sessionLibrary";
import type {
  EnhanceOptions,
  RecordingItem,
  RecordingKind,
} from "../../creator-server/sessionRecordings";
import type {
  StockCredit,
  StockItem,
  StockKind,
  StockPage,
} from "../../creator-server/sessionStock";

export type {
  ProjectSummary,
  AssistantRequest,
  TrashEntry,
  ExportEntry,
  PublicTemplate,
  EnvironmentCheck,
  MediaFolder,
  FolderItem,
  FolderColor,
  MediaInfo,
  LibraryItem,
  StockCredit,
  StockItem,
  StockKind,
  StockPage,
  EnhanceOptions,
  RecordingItem,
  RecordingKind,
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

// "Mes dossiers": virtual media folders shared by every project (creator-server/folders.ts).

export const folderApi = {
  list: () => request<{ folders: MediaFolder[] }>("GET", `${base}/folders`),
  create: (name: string, parentId: string | null) =>
    request<{ folder: MediaFolder }>("POST", `${base}/folders`, { name, parentId }),
  update: (id: string, patch: { name?: string; color?: FolderColor | null }) =>
    request<{ folder: MediaFolder }>("PATCH", `${base}/folders/${enc(id)}`, patch),
  remove: (id: string) => request<{ deleted: string[] }>("DELETE", `${base}/folders/${enc(id)}`),
  addItem: (id: string, item: FolderItem) =>
    request<{ folder: MediaFolder }>("POST", `${base}/folders/${enc(id)}/items`, item),
  removeItem: (id: string, item: FolderItem) =>
    request<{ folder: MediaFolder }>("POST", `${base}/folders/${enc(id)}/items/remove`, item),
};

/** Dates and durations of a project's media, for the media panel's sort menu. */
export const mediaInfoApi = {
  list: (projectId: string) =>
    request<{ media: MediaInfo[] }>("GET", `${base}/projects/${enc(projectId)}/media-info`),
};

/** Right-click actions on one project media (creator-server/sessionAssetActions.ts). */
export interface AssetDetails {
  path: string;
  size: number;
  duration: number | null;
  video: { codec: string; width: number; height: number; fps: number | null } | null;
  audio: { codec: string; channels: number; sampleRate: number } | null;
}

export const assetActionsApi = {
  reveal: (projectId: string, path: string) =>
    request<{ ok: true }>("POST", `${base}/projects/${enc(projectId)}/media/reveal`, { path }),
  details: (projectId: string, path: string) =>
    request<{ details: AssetDetails }>("POST", `${base}/projects/${enc(projectId)}/media/details`, {
      path,
    }),
  extractAudio: (projectId: string, path: string) =>
    request<{ path: string }>("POST", `${base}/projects/${enc(projectId)}/media/extract-audio`, {
      path,
    }),
};

/** "Ma bibliothèque": reusable media shared by every project (creator-server/sessionLibrary.ts). */
export const libraryApi = {
  list: () => request<{ items: LibraryItem[] }>("GET", `${base}/library`),
  add: (projectId: string, path: string) =>
    request<{ path: string }>("POST", `${base}/library/items`, { projectId, path }),
  remove: (path: string) => request<{ ok: true }>("POST", `${base}/library/remove`, { path }),
};

export function libraryFileUrl(path: string): string {
  return `${base}/library/file/${path.split("/").map(enc).join("/")}`;
}

/** « Banque libre de droits » (creator-server/sessionStock.ts). */
export const stockApi = {
  search: (kind: StockKind, query: string, page: number) =>
    request<StockPage>("POST", `${base}/stock/search`, { kind, query, page }),
  toLibrary: (item: StockItem) =>
    request<{ path: string }>("POST", `${base}/stock/library`, {
      kind: item.kind,
      provider: item.provider,
      id: item.id,
    }),
  credit: (projectId: string, file: string, item: StockItem) =>
    request<{ ok: true }>("POST", `${base}/stock/credit`, {
      projectId,
      file,
      kind: item.kind,
      provider: item.provider,
      id: item.id,
    }),
  projectCredits: (projectId: string) =>
    request<{ credits: StockCredit[] }>("GET", `${base}/projects/${enc(projectId)}/credits`),
};

export function stockFileUrl(item: StockItem): string {
  return `${base}/stock/file/${item.kind}/${item.provider}/${enc(item.id)}`;
}

/** « Enregistrements » (creator-server/sessionRecordings.ts). */
export const recordingApi = {
  list: () => request<{ items: RecordingItem[] }>("GET", `${base}/recordings`),
  enhance: (path: string, options: EnhanceOptions) =>
    request<{ path: string }>("POST", `${base}/recordings/enhance`, { path, options }),
  toLibrary: (path: string) =>
    request<{ path: string }>("POST", `${base}/recordings/to-library`, { path }),
  remove: (path: string) => request<{ ok: true }>("POST", `${base}/recordings/remove`, { path }),
  /** Sends a take straight from MediaRecorder. */
  upload: async (kind: RecordingKind, blob: Blob): Promise<{ path: string }> => {
    let response: Response;
    try {
      response = await studioApiFetch(`${base}/recordings/upload?kind=${kind}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
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
    return payload as { path: string };
  },
};

export function recordingFileUrl(path: string): string {
  return `${base}/recordings/file/${enc(path)}`;
}
