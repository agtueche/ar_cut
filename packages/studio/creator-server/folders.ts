// "Mes dossiers": virtual folders of media, shared by every project of the
// workspace. A folder never moves or copies a file — it only lists references
// ({ projectId, path }) to media that stay where they are. Stored in
// <home>/dossiers.json, written atomically.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./projectMeta";
import { CreatorError } from "./projectOps";
import {
  defaultOwnership,
  isVisibility,
  readOwnership,
  type Owner,
  type Visibility,
} from "./ownership";
import { type CreatorWorkspace, isSafeId } from "./workspace";

export const FOLDERS_FILE = "dossiers.json";
export const FOLDER_COLORS = ["teal", "orange", "blue", "amber", "red", "gray"] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];
const MAX_NAME = 60;
const MAX_DEPTH = 3;
const MAX_FOLDERS = 500;
const MAX_ITEMS = 5000;

export interface FolderItem {
  projectId: string;
  path: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  color: FolderColor | null;
  parentId: string | null;
  createdAt: string;
  items: FolderItem[];
  /** Who owns the folder and who may see it (see ownership.ts). « Partagé » = visibility ≠ private. */
  owner: Owner;
  visibility: Visibility;
}

interface FolderStore {
  version: 1;
  folders: MediaFolder[];
}

function storePath(workspace: CreatorWorkspace): string {
  return join(workspace.home, FOLDERS_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isColor(value: unknown): value is FolderColor {
  return typeof value === "string" && (FOLDER_COLORS as readonly string[]).includes(value);
}

/** A project-relative media path: no absolute path, no `..`, no backslash. */
export function isSafeMediaPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 500) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function cleanItem(value: unknown): FolderItem | null {
  if (!isRecord(value)) return null;
  const { projectId, path } = value;
  if (typeof projectId !== "string" || !isSafeId(projectId) || !isSafeMediaPath(path)) return null;
  return { projectId, path };
}

function cleanFolder(value: unknown): MediaFolder | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string")
    return null;
  const items = Array.isArray(value.items)
    ? value.items.map(cleanItem).filter((item): item is FolderItem => item !== null)
    : [];
  return {
    id: value.id,
    name: value.name.slice(0, MAX_NAME),
    color: isColor(value.color) ? value.color : null,
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    items,
    ...readOwnership(value),
  };
}

export function readFolders(workspace: CreatorWorkspace): MediaFolder[] {
  const file = storePath(workspace);
  if (!existsSync(file)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    const raw = isRecord(data) && Array.isArray(data.folders) ? data.folders : [];
    const folders = raw.map(cleanFolder).filter((f): f is MediaFolder => f !== null);
    const ids = new Set(folders.map((f) => f.id));
    // A parent that no longer exists turns the folder into a top-level one.
    return folders.map((f) => (f.parentId && !ids.has(f.parentId) ? { ...f, parentId: null } : f));
  } catch {
    throw new CreatorError("Le fichier des dossiers est illisible. Il n'a pas été modifié.", 409);
  }
}

function writeFolders(workspace: CreatorWorkspace, folders: MediaFolder[]): void {
  const store: FolderStore = { version: 1, folders };
  writeFileAtomic(storePath(workspace), JSON.stringify(store, null, 2));
}

export function normalizeFolderName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
  if (!name) throw new CreatorError("Donnez un nom au dossier.");
  return name;
}

function depthOf(folders: MediaFolder[], id: string | null): number {
  let depth = 0;
  let current = id;
  while (current) {
    depth++;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
    if (depth > MAX_DEPTH + 1) break;
  }
  return depth;
}

function findFolder(folders: MediaFolder[], id: string): MediaFolder {
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new CreatorError("Dossier introuvable.", 404);
  return folder;
}

export function createFolder(workspace: CreatorWorkspace, body: unknown): MediaFolder {
  const raw = isRecord(body) ? body : {};
  const folders = readFolders(workspace);
  if (folders.length >= MAX_FOLDERS) throw new CreatorError("Nombre maximal de dossiers atteint.");
  const parentId = typeof raw.parentId === "string" && raw.parentId ? raw.parentId : null;
  if (parentId) findFolder(folders, parentId);
  if (depthOf(folders, parentId) >= MAX_DEPTH) {
    throw new CreatorError(`Pas plus de ${MAX_DEPTH} niveaux de dossiers.`);
  }
  const folder: MediaFolder = {
    id: randomUUID(),
    name: normalizeFolderName(raw.name),
    color: isColor(raw.color) ? raw.color : null,
    parentId,
    createdAt: new Date().toISOString(),
    items: [],
    ...defaultOwnership(),
  };
  writeFolders(workspace, [...folders, folder]);
  return folder;
}

export function updateFolder(workspace: CreatorWorkspace, id: string, body: unknown): MediaFolder {
  const raw = isRecord(body) ? body : {};
  const folders = readFolders(workspace);
  const folder = findFolder(folders, id);
  const next: MediaFolder = { ...folder };
  if ("name" in raw) next.name = normalizeFolderName(raw.name);
  if ("visibility" in raw) {
    if (!isVisibility(raw.visibility)) throw new CreatorError("Visibilité invalide.");
    next.visibility = raw.visibility;
  }
  if ("color" in raw) {
    if (raw.color !== null && !isColor(raw.color)) throw new CreatorError("Couleur invalide.");
    next.color = raw.color === null ? null : raw.color;
  }
  writeFolders(
    workspace,
    folders.map((f) => (f.id === id ? next : f)),
  );
  return next;
}

/** Deletes the folder and its sub-folders. The media themselves are untouched. */
export function deleteFolder(workspace: CreatorWorkspace, id: string): string[] {
  const folders = readFolders(workspace);
  findFolder(folders, id);
  const removed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && removed.has(f.parentId) && !removed.has(f.id)) {
        removed.add(f.id);
        grew = true;
      }
    }
  }
  writeFolders(
    workspace,
    folders.filter((f) => !removed.has(f.id)),
  );
  return [...removed];
}

function editItems(
  workspace: CreatorWorkspace,
  id: string,
  body: unknown,
  edit: (items: FolderItem[], item: FolderItem) => FolderItem[],
): MediaFolder {
  const item = cleanItem(body);
  if (!item) throw new CreatorError("Média invalide.");
  const folders = readFolders(workspace);
  const folder = findFolder(folders, id);
  const next = { ...folder, items: edit(folder.items, item) };
  if (next.items.length > MAX_ITEMS) throw new CreatorError("Ce dossier est plein.");
  writeFolders(
    workspace,
    folders.map((f) => (f.id === id ? next : f)),
  );
  return next;
}

const sameItem = (a: FolderItem, b: FolderItem) => a.projectId === b.projectId && a.path === b.path;

export function addFolderItem(workspace: CreatorWorkspace, id: string, body: unknown): MediaFolder {
  return editItems(workspace, id, body, (items, item) =>
    items.some((i) => sameItem(i, item)) ? items : [...items, item],
  );
}

export function removeFolderItem(
  workspace: CreatorWorkspace,
  id: string,
  body: unknown,
): MediaFolder {
  return editItems(workspace, id, body, (items, item) => items.filter((i) => !sameItem(i, item)));
}
