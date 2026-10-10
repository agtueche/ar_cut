// Project lifecycle for the dashboard: list, create, duplicate, rename, trash,
// restore. Studio keeps editing the files; these operations only manage the
// folders and Creator's manifest.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";
import { blankCompositionHtml } from "./blankComposition";
import {
  MANIFEST_FILE,
  type ProjectSummary,
  modifiedAt,
  readCompositionInfo,
  readManifest,
  writeFileAtomic,
  writeManifest,
  defaultManifest,
} from "./projectMeta";
import { findTemplate } from "./templates";
import {
  type CreatorWorkspace,
  isSafeId,
  projectDirFor,
  trashDirFor,
  uniqueProjectId,
} from "./workspace";

export class CreatorError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "CreatorError";
  }
}

const RENDER_EXTENSIONS = /\.(mp4|webm|mov)$/i;
/** Folders a duplicate must not inherit: Studio's history and the source's exports. */
const NOT_COPIED = new Set([".hyperframes", "renders", "node_modules", ".thumbnails"]);

function countRenders(projectDir: string): number {
  const dir = join(projectDir, "renders");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((file) => RENDER_EXTENSIONS.test(file)).length;
}

export function summarizeProject(workspace: CreatorWorkspace, id: string): ProjectSummary | null {
  const dir = projectDirFor(workspace, id);
  if (!dir || !existsSync(join(dir, "index.html"))) return null;
  const manifest = readManifest(dir, id);
  const info = readCompositionInfo(readFileSync(join(dir, "index.html"), "utf-8"));
  return {
    id,
    title: manifest.title,
    width: info.width,
    height: info.height,
    duration: info.duration,
    fps: manifest.fps,
    template: manifest.template,
    createdAt: manifest.createdAt,
    modifiedAt: modifiedAt(dir),
    lastOpenedAt: manifest.lastOpenedAt,
    renderCount: countRenders(dir),
    owner: manifest.owner,
    visibility: manifest.visibility,
  };
}

export function listProjects(workspace: CreatorWorkspace): ProjectSummary[] {
  if (!existsSync(workspace.projectsDir)) return [];
  return readdirSync(workspace.projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSafeId(entry.name))
    .map((entry) => summarizeProject(workspace, entry.name))
    .filter((summary): summary is ProjectSummary => summary !== null);
}

export interface CreateProjectInput {
  title: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  template: string | null;
}

const MIN_SIDE = 64;
const MAX_SIDE = 7680;
const ALLOWED_FPS = new Set([24, 25, 30, 50, 60]);

/** Validates the wizard's input; throws a CreatorError naming the bad field. */
export function validateCreateInput(raw: unknown): CreateProjectInput {
  const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) throw new CreatorError("Le nom du projet est obligatoire.");
  const width = Number(body.width);
  const height = Number(body.height);
  for (const [label, value] of [
    ["largeur", width],
    ["hauteur", height],
  ] as const) {
    if (!Number.isInteger(value) || value < MIN_SIDE || value > MAX_SIDE || value % 2 !== 0) {
      throw new CreatorError(
        `La ${label} doit être un nombre pair entre ${MIN_SIDE} et ${MAX_SIDE} pixels.`,
      );
    }
  }
  const fps = Number(body.fps);
  if (!ALLOWED_FPS.has(fps)) {
    throw new CreatorError("La fréquence d'images doit être 24, 25, 30, 50 ou 60 i/s.");
  }
  const duration = Number(body.duration);
  if (!Number.isFinite(duration) || duration < 1 || duration > 3600) {
    throw new CreatorError("La durée doit être comprise entre 1 et 3600 secondes.");
  }
  const template = typeof body.template === "string" && body.template ? body.template : null;
  if (template !== null && !isSafeId(template)) throw new CreatorError("Modèle inconnu.");
  return { title, width, height, fps, duration: Math.round(duration * 100) / 100, template };
}

export function createProject(
  workspace: CreatorWorkspace,
  templatesDir: string,
  input: CreateProjectInput,
  now = new Date(),
): ProjectSummary {
  const id = uniqueProjectId(workspace, input.title);
  const dir = join(workspace.projectsDir, id);
  const manifest = { ...defaultManifest(input.title, now), fps: input.fps };
  if (input.template) {
    const template = findTemplate(templatesDir, input.template);
    if (!template) throw new CreatorError("Modèle introuvable.", 404);
    cpSync(template.dir, dir, {
      recursive: true,
      filter: (source) => basename(source) !== "template.json",
    });
    manifest.template = template.id;
  } else {
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(
      join(dir, "index.html"),
      blankCompositionHtml({
        title: input.title,
        width: input.width,
        height: input.height,
        duration: input.duration,
      }),
    );
  }
  writeManifest(dir, manifest);
  const summary = summarizeProject(workspace, id);
  if (!summary) throw new CreatorError("Le projet n'a pas pu être créé.", 409);
  return summary;
}

function requireProjectDir(workspace: CreatorWorkspace, id: unknown): string {
  const dir = projectDirFor(workspace, id);
  if (!dir || !existsSync(dir)) throw new CreatorError("Projet introuvable.", 404);
  return dir;
}

export function duplicateProject(workspace: CreatorWorkspace, id: unknown): ProjectSummary {
  const source = requireProjectDir(workspace, id);
  const original = readManifest(source, String(id));
  const title = `${original.title} (copie)`;
  const newId = uniqueProjectId(workspace, title);
  const target = join(workspace.projectsDir, newId);
  cpSync(source, target, {
    recursive: true,
    filter: (path) => path === source || !NOT_COPIED.has(basename(path)),
  });
  writeManifest(target, {
    ...original,
    title,
    createdAt: new Date().toISOString(),
    lastOpenedAt: null,
    assistant: [],
  });
  const summary = summarizeProject(workspace, newId);
  if (!summary) throw new CreatorError("La copie n'a pas pu être créée.", 409);
  return summary;
}

/**
 * Updates the title and/or the frame rate. The folder (and Studio's links and
 * history) keeps its id; the composition HTML is not touched here.
 */
export function updateProject(
  workspace: CreatorWorkspace,
  id: unknown,
  patch: { title?: unknown; fps?: unknown },
): ProjectSummary {
  const dir = requireProjectDir(workspace, id);
  const manifest = readManifest(dir, String(id));
  const next = { ...manifest };
  if (patch.title !== undefined) {
    const title = typeof patch.title === "string" ? patch.title.trim().slice(0, 120) : "";
    if (!title) throw new CreatorError("Le nouveau nom ne peut pas être vide.");
    next.title = title;
  }
  if (patch.fps !== undefined) {
    const fps = Number(patch.fps);
    if (!ALLOWED_FPS.has(fps)) {
      throw new CreatorError("La fréquence d'images doit être 24, 25, 30, 50 ou 60 i/s.");
    }
    next.fps = fps;
  }
  writeManifest(dir, next);
  const summary = summarizeProject(workspace, String(id));
  if (!summary) throw new CreatorError("Projet introuvable.", 404);
  return summary;
}

export function markOpened(workspace: CreatorWorkspace, id: unknown, now = new Date()): void {
  const dir = requireProjectDir(workspace, id);
  writeManifest(dir, { ...readManifest(dir, String(id)), lastOpenedAt: now.toISOString() });
}

export interface TrashEntry {
  trashId: string;
  projectId: string;
  title: string;
  deletedAt: string;
}

const TRASH_INFO = ".corbeille.json";

export function trashProject(
  workspace: CreatorWorkspace,
  id: unknown,
  now = new Date(),
): TrashEntry {
  const dir = requireProjectDir(workspace, id);
  const projectId = String(id);
  const title = readManifest(dir, projectId).title;
  const trashId = `${projectId}--${now.getTime()}`;
  const target = trashDirFor(workspace, trashId);
  if (!target) throw new CreatorError("Identifiant de corbeille invalide.");
  renameSync(dir, target);
  const entry: TrashEntry = { trashId, projectId, title, deletedAt: now.toISOString() };
  writeFileAtomic(join(target, TRASH_INFO), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

function readTrashEntry(dir: string, trashId: string): TrashEntry | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, TRASH_INFO), "utf-8")) as Partial<TrashEntry>;
    if (typeof raw.projectId !== "string" || typeof raw.deletedAt !== "string") return null;
    return {
      trashId,
      projectId: raw.projectId,
      title: typeof raw.title === "string" ? raw.title : raw.projectId,
      deletedAt: raw.deletedAt,
    };
  } catch {
    return null;
  }
}

export function listTrash(workspace: CreatorWorkspace): TrashEntry[] {
  if (!existsSync(workspace.trashDir)) return [];
  return readdirSync(workspace.trashDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSafeId(entry.name))
    .map((entry) => readTrashEntry(join(workspace.trashDir, entry.name), entry.name))
    .filter((entry): entry is TrashEntry => entry !== null)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function restoreProject(workspace: CreatorWorkspace, trashId: unknown): ProjectSummary {
  const source = trashDirFor(workspace, trashId);
  const entry = source && existsSync(source) ? readTrashEntry(source, String(trashId)) : null;
  if (!source || !entry) throw new CreatorError("Élément introuvable dans la corbeille.", 404);
  const projectId = existsSync(join(workspace.projectsDir, entry.projectId))
    ? uniqueProjectId(workspace, entry.projectId)
    : entry.projectId;
  const target = projectDirFor(workspace, projectId);
  if (!target) throw new CreatorError("Identifiant de projet invalide.");
  rmSync(join(source, TRASH_INFO), { force: true });
  renameSync(source, target);
  const summary = summarizeProject(workspace, projectId);
  if (!summary) throw new CreatorError("Le projet restauré est incomplet.", 409);
  return summary;
}

/** Permanent deletion, only from the trash: the dashboard asks for confirmation first. */
export function purgeTrashEntry(workspace: CreatorWorkspace, trashId: unknown): void {
  const dir = trashDirFor(workspace, trashId);
  if (!dir || !existsSync(join(dir, TRASH_INFO))) {
    throw new CreatorError("Élément introuvable dans la corbeille.", 404);
  }
  rmSync(dir, { recursive: true, force: true });
}

export interface ExportEntry {
  projectId: string;
  projectTitle: string;
  filename: string;
  size: number;
  createdAt: string;
}

export function listExports(workspace: CreatorWorkspace): ExportEntry[] {
  return listProjects(workspace)
    .flatMap((project) => {
      const dir = join(workspace.projectsDir, project.id, "renders");
      if (!existsSync(dir)) return [];
      return (
        readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && RENDER_EXTENSIONS.test(entry.name))
          // Studio writes the sidecar when a render ends: no "complete" sidecar, not a finished file.
          .filter((entry) => renderIsComplete(join(dir, entry.name)))
          .map((entry) => {
            const stat = statFile(join(dir, entry.name));
            return {
              projectId: project.id,
              projectTitle: project.title,
              filename: entry.name,
              size: stat.size,
              createdAt: stat.mtime,
            };
          })
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function renderIsComplete(videoPath: string): boolean {
  try {
    const meta: unknown = JSON.parse(
      readFileSync(videoPath.replace(RENDER_EXTENSIONS, ".meta.json"), "utf-8"),
    );
    return (
      typeof meta === "object" &&
      meta !== null &&
      (meta as { status?: unknown }).status === "complete"
    );
  } catch {
    return false;
  }
}

function statFile(path: string): { size: number; mtime: string } {
  try {
    const stat = statSync(path);
    return { size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { size: 0, mtime: new Date(0).toISOString() };
  }
}

export { MANIFEST_FILE };
