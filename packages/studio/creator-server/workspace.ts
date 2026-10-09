// Hyperframes Creator — the on-disk workspace shared by the dashboard and Studio.
//
//   <home>/projects/<id>/        one HyperFrames project per folder (Studio's dataDir)
//   <home>/projects/<id>/.creator.json  Creator's own metadata (the HTML stays the source of truth)
//   <home>/projects/<id>/renders/       exports of that project
//   <home>/corbeille/<entry>/     deleted projects, restorable
//
// Every path that comes from a request goes through `projectDirFor` /
// `trashDirFor`, which refuse anything that is not a single safe segment.

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface CreatorWorkspace {
  home: string;
  projectsDir: string;
  trashDir: string;
}

export const CREATOR_HOME_ENV = "HYPERFRAMES_CREATOR_HOME";

export function defaultCreatorHome(): string {
  return join(homedir(), "Movies", "Hyperframes Creator");
}

export function createWorkspace(home: string): CreatorWorkspace {
  const root = resolve(home);
  const workspace = {
    home: root,
    projectsDir: join(root, "projects"),
    trashDir: join(root, "corbeille"),
  };
  for (const dir of [workspace.projectsDir, workspace.trashDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  return workspace;
}

/** A project or trash id: one path segment of letters, digits, `-` and `_`. */
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function projectDirFor(workspace: CreatorWorkspace, id: unknown): string | null {
  if (!isSafeId(id)) return null;
  const dir = join(workspace.projectsDir, id);
  return isWithin(workspace.projectsDir, dir) ? dir : null;
}

export function trashDirFor(workspace: CreatorWorkspace, id: unknown): string | null {
  if (!isSafeId(id)) return null;
  const dir = join(workspace.trashDir, id);
  return isWithin(workspace.trashDir, dir) ? dir : null;
}

/** "Ma Vidéo d'été !" → "ma-video-d-ete". Never empty. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "projet";
}

/** The first free id derived from `title` (`titre`, `titre-2`, `titre-3`…). */
export function uniqueProjectId(workspace: CreatorWorkspace, title: string): string {
  const base = slugify(title);
  let candidate = base;
  for (let n = 2; existsSync(join(workspace.projectsDir, candidate)); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
