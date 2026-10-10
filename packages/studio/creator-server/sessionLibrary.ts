// "Ma bibliothèque": the user's reusable media, shared by every project.
// Files live in <home>/bibliotheque/. A media is ADDED by copying it out of a
// project, and brought back into another project through the normal import.
//
// Lives under the `session` prefix on purpose (see sessionMediaInfo.ts): it
// copies REAL project media, which the in-memory session only holds as empty
// placeholders, so it needs Node's native fs, not the session facade.

import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { isSafeMediaPath } from "./folders";
import { CreatorError } from "./projectOps";
import { readMediaInfo, type MediaInfo } from "./sessionMediaInfo";
import { readOwnership, type Ownership } from "./ownership";
import { type CreatorWorkspace, projectDirFor } from "./workspace";

export const LIBRARY_DIR = "bibliotheque";

export const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/** Owner and visibility of the whole library, from <library>/.bibliotheque.json (default: local, private). */
export const LIBRARY_MANIFEST = ".bibliotheque.json";

export function libraryOwnership(workspace: CreatorWorkspace): Ownership {
  const file = join(libraryDirFor(workspace), LIBRARY_MANIFEST);
  try {
    return readOwnership(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
  } catch {
    return readOwnership(null);
  }
}

export interface LibraryItem extends MediaInfo, Ownership {
  /** Example media installed with the app, not added by the user. */
  example: boolean;
}

export function libraryDirFor(workspace: CreatorWorkspace): string {
  const dir = join(workspace.home, LIBRARY_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** A library file from a request path, or null when it would leave the library. */
export function libraryFile(workspace: CreatorWorkspace, relPath: string): string | null {
  if (!isSafeMediaPath(relPath)) return null;
  const root = libraryDirFor(workspace);
  const file = resolve(root, relPath);
  return file.startsWith(root + sep) ? file : null;
}

export async function listLibrary(workspace: CreatorWorkspace): Promise<LibraryItem[]> {
  const items = await readMediaInfo(libraryDirFor(workspace));
  const ownership = libraryOwnership(workspace);
  return items.map((item) => ({
    ...item,
    ...ownership,
    example: basename(item.path).startsWith("Exemple - "),
  }));
}

function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
}

/** Copies a project's media into the library; returns its library path. */
export function addToLibrary(workspace: CreatorWorkspace, body: unknown): string {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const projectId = typeof raw.projectId === "string" ? raw.projectId : "";
  const path = raw.path;
  const projectDir = projectDirFor(workspace, projectId);
  if (!projectDir || !isSafeMediaPath(path)) throw new CreatorError("Média invalide.");
  const source = resolve(projectDir, path);
  if (!source.startsWith(projectDir + sep) || !existsSync(source) || !statSync(source).isFile()) {
    throw new CreatorError("Ce média est introuvable dans le projet.", 404);
  }
  if (!MIME[extname(source).toLowerCase()]) {
    throw new CreatorError("Seuls les vidéos, sons et images vont dans la bibliothèque.");
  }
  const dir = libraryDirFor(workspace);
  const name = uniqueName(dir, basename(source));
  copyFileSync(source, join(dir, name));
  return name;
}

/** Deletes a file from the library only (projects that imported it keep their copy). */
export function removeFromLibrary(workspace: CreatorWorkspace, body: unknown): void {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const file = typeof raw.path === "string" ? libraryFile(workspace, raw.path) : null;
  if (!file || !existsSync(file))
    throw new CreatorError("Média introuvable dans la bibliothèque.", 404);
  unlinkSync(file);
}

/** Streams a library file, with byte ranges so audio and video can seek. */
export function serveLibraryFile(
  workspace: CreatorWorkspace,
  relPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  streamMediaFile(libraryFile(workspace, relPath), req, res);
}

/** Streams a media file (null = refused path), with byte ranges so audio and video can seek. */
export function streamMediaFile(
  file: string | null,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Média introuvable." }));
    return;
  }
  const size = statSync(file).size;
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
}
