// Dates and durations of a project's media, for the media panel's sort menu.
//
// Lives under the `session` prefix on purpose: the Vite SSR transform
// (vite.session-fs.ts) leaves `node:fs` native in creator-server/session* modules.
// This module must stat and probe the REAL media files, not the session's
// in-memory placeholders (which are empty and dated when the session opened).

import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";

export interface MediaInfo {
  path: string;
  size: number;
  /** When the file arrived in the project (file birth time). */
  importedAt: number;
  /** When the file's content was made (modification time, kept by copies). */
  createdAt: number;
  /** Seconds, for audio and video; null when unknown or not timed media. */
  duration: number | null;
}

const TIMED = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".mkv",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".opus",
]);
const MEDIA = new Set([
  ...TIMED,
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);
const SKIP = new Set([
  "node_modules",
  ".git",
  "renders",
  ".hyperframes",
  ".thumbnails",
  ".transcode-cache",
  ".waveform-cache",
  "snapshots",
]);
const MAX_FILES = 3000;
const PROBE_CONCURRENCY = 4;

const durationCache = new Map<string, number | null>();

function probeDuration(file: string): Promise<number | null> {
  const ffprobe = findFfBinary("ffprobe") ?? "ffprobe";
  return new Promise((resolve) => {
    execFile(
      ffprobe,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 15000, windowsHide: true },
      (error, stdout) => {
        const value = Number.parseFloat(String(stdout).trim());
        resolve(!error && Number.isFinite(value) && value > 0 ? value : null);
      },
    );
  });
}

function listMediaFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && MEDIA.has(extname(entry.name).toLowerCase())) out.push(path);
      if (out.length >= MAX_FILES) return;
    }
  };
  walk(root);
  return out;
}

/** Every media file of the project with its dates; durations probed once and cached. */
export async function readMediaInfo(projectDir: string): Promise<MediaInfo[]> {
  const files = listMediaFiles(projectDir);
  const infos: MediaInfo[] = [];
  const toProbe: Array<{ info: MediaInfo; file: string; key: string }> = [];
  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    const info: MediaInfo = {
      path: relative(projectDir, file).split(sep).join("/"),
      size: stat.size,
      importedAt: Math.round(stat.birthtimeMs || stat.ctimeMs),
      createdAt: Math.round(Math.min(stat.mtimeMs, stat.birthtimeMs || stat.mtimeMs)),
      duration: null,
    };
    infos.push(info);
    if (TIMED.has(extname(file).toLowerCase())) {
      const key = `${file}|${stat.size}|${Math.round(stat.mtimeMs)}`;
      if (durationCache.has(key)) info.duration = durationCache.get(key) ?? null;
      else toProbe.push({ info, file, key });
    }
  }
  for (let i = 0; i < toProbe.length; i += PROBE_CONCURRENCY) {
    await Promise.all(
      toProbe.slice(i, i + PROBE_CONCURRENCY).map(async ({ info, file, key }) => {
        info.duration = await probeDuration(file);
        durationCache.set(key, info.duration);
      }),
    );
  }
  return infos;
}
