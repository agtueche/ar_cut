// "Mes dossiers" — client state for the virtual media folders (creator-server/folders.ts).
// One hook owns the list and every mutation; a context hands the item actions to the
// asset context menu so the cards themselves need no new props.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  folderApi,
  CreatorApiError,
  type FolderColor,
  type FolderItem,
  type MediaFolder,
} from "../../creator/creatorApi";

export type { MediaFolder, FolderColor, FolderItem };

export interface MediaFoldersState {
  folders: MediaFolder[];
  loaded: boolean;
  error: string | null;
  clearError: () => void;
  create: (name: string, parentId: string | null) => Promise<MediaFolder | null>;
  rename: (id: string, name: string) => Promise<void>;
  setColor: (id: string, color: FolderColor | null) => Promise<void>;
  remove: (id: string) => Promise<string[]>;
  addItem: (id: string, item: FolderItem) => Promise<void>;
  removeItem: (id: string, item: FolderItem) => Promise<void>;
}

function messageOf(error: unknown): string {
  if (error instanceof CreatorApiError && error.status !== 0) return error.message;
  return "Le serveur ne répond pas. Réessayez.";
}

export function useMediaFolders(): MediaFoldersState {
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    folderApi
      .list()
      .then((r) => {
        if (!cancelled) setFolders(r.folders);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(messageOf(e));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Runs a mutation; on success replaces one folder, on failure keeps the list and reports. */
  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | null> => {
    try {
      setError(null);
      return await task();
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  }, []);

  const replace = useCallback((folder: MediaFolder) => {
    setFolders((list) => list.map((f) => (f.id === folder.id ? folder : f)));
  }, []);

  const create = useCallback(
    async (name: string, parentId: string | null) => {
      const r = await run(() => folderApi.create(name, parentId));
      if (!r) return null;
      setFolders((list) => [...list, r.folder]);
      return r.folder;
    },
    [run],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const r = await run(() => folderApi.update(id, { name }));
      if (r) replace(r.folder);
    },
    [run, replace],
  );

  const setColor = useCallback(
    async (id: string, color: FolderColor | null) => {
      const r = await run(() => folderApi.update(id, { color }));
      if (r) replace(r.folder);
    },
    [run, replace],
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await run(() => folderApi.remove(id));
      if (!r) return [];
      const gone = new Set(r.deleted);
      setFolders((list) => list.filter((f) => !gone.has(f.id)));
      return r.deleted;
    },
    [run],
  );

  const addItem = useCallback(
    async (id: string, item: FolderItem) => {
      const r = await run(() => folderApi.addItem(id, item));
      if (r) replace(r.folder);
    },
    [run, replace],
  );

  const removeItem = useCallback(
    async (id: string, item: FolderItem) => {
      const r = await run(() => folderApi.removeItem(id, item));
      if (r) replace(r.folder);
    },
    [run, replace],
  );

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({
      folders,
      loaded,
      error,
      clearError,
      create,
      rename,
      setColor,
      remove,
      addItem,
      removeItem,
    }),
    [folders, loaded, error, clearError, create, rename, setColor, remove, addItem, removeItem],
  );
}

/** Folders ordered as a tree (parents before children), each with its depth. */
export function folderTree(folders: MediaFolder[]): Array<{ folder: MediaFolder; depth: number }> {
  const byParent = new Map<string | null, MediaFolder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }
  const out: Array<{ folder: MediaFolder; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of byParent.get(parent) ?? []) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** What the asset context menu can do with folders, for the current project. */
export interface MediaFolderActions {
  projectId: string;
  folders: MediaFolder[];
  /** The folder currently shown in the media panel, if any. */
  currentFolder: MediaFolder | null;
  addItem: (id: string, item: FolderItem) => Promise<void>;
  removeItem: (id: string, item: FolderItem) => Promise<void>;
  /** Copies a project media into « Ma bibliothèque ». */
  addToLibrary?: (path: string) => Promise<void>;
  /** Creates a folder (« Nouveau dossier avec cet élément »). */
  create?: (name: string, parentId: string | null) => Promise<MediaFolder | null>;
}

export const MediaFolderActionsContext = createContext<MediaFolderActions | null>(null);

export function useMediaFolderActions(): MediaFolderActions | null {
  return useContext(MediaFolderActionsContext);
}

/** The media panel's folder selection: state, selected folder, its paths here, menu actions. */
export function useAssetsTabFolders(projectId: string) {
  const folderState = useMediaFolders();
  const [folderId, setFolderId] = useState<string | null>(null);
  const currentFolder = folderState.folders.find((f) => f.id === folderId) ?? null;
  const folderPaths = useMemo(
    () =>
      currentFolder
        ? new Set(currentFolder.items.filter((i) => i.projectId === projectId).map((i) => i.path))
        : null,
    [currentFolder, projectId],
  );
  const { folders, addItem, removeItem, create } = folderState;
  const folderActions = useMemo<MediaFolderActions>(
    () => ({ projectId, folders, currentFolder, addItem, removeItem, create }),
    [projectId, folders, currentFolder, addItem, removeItem, create],
  );
  return { folderState, folderId, setFolderId, currentFolder, folderPaths, folderActions };
}
