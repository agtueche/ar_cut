// Actions on ONE project media, from the media panel's right-click menu:
// reveal in the Finder, technical details (ffprobe), audio extraction (ffmpeg).
//
// Lives under the `session` prefix on purpose: the Vite SSR transform
// (vite.session-fs.ts) leaves `node:fs` native in creator-server/session* modules,
// and these actions work on the REAL media bytes, not the session placeholders.

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";
import { isSafeMediaPath } from "./folders";
import { CreatorError } from "./projectOps";
import { canonicalPath, memoryFor } from "./sessionMemory";
import { projectDirFor, type CreatorWorkspace } from "./workspace";

export interface AssetDetails {
  path: string;
  size: number;
  duration: number | null;
  video: { codec: string; width: number; height: number; fps: number | null } | null;
  audio: { codec: string; channels: number; sampleRate: number } | null;
}

/** The project's absolute path for `path`, refused if it leaves the project or is missing. */
function assetFile(workspace: CreatorWorkspace, projectId: string, path: unknown): string {
  const dir = projectDirFor(workspace, projectId);
  if (!dir || !existsSync(dir)) throw new CreatorError("Projet introuvable.", 404);
  if (!isSafeMediaPath(path)) throw new CreatorError("Chemin de média invalide.");
  const file = resolve(dir, path);
  if (!file.startsWith(resolve(dir) + sep)) throw new CreatorError("Chemin de média invalide.");
  if (!existsSync(file) || !statSync(file).isFile())
    throw new CreatorError("Fichier introuvable sur le disque.", 404);
  return file;
}

/** Shows the file selected in the Finder (macOS) or opens its folder elsewhere. */
export function revealAsset(workspace: CreatorWorkspace, projectId: string, path: unknown): void {
  const file = assetFile(workspace, projectId, path);
  const [command, args] =
    process.platform === "darwin"
      ? ["open", ["-R", file]]
      : process.platform === "win32"
        ? ["explorer", [`/select,${file}`]]
        : ["xdg-open", [dirname(file)]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    /* No file manager: nothing to show, the call already answered. */
  });
  child.unref();
}

function fps(rate: unknown): number | null {
  if (typeof rate !== "string") return null;
  const [n, d] = rate.split("/").map(Number);
  const value = d ? n / d : n;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  channels?: number;
  sample_rate?: string;
}

function probe(file: string): Promise<{ streams?: ProbeStream[]; format?: { duration?: string } }> {
  const ffprobe = findFfBinary("ffprobe") ?? "ffprobe";
  const args = ["-v", "error", "-show_entries", "format=duration:stream", "-of", "json", file];
  return new Promise((done, fail) => {
    execFile(ffprobe, args, { timeout: 20000, windowsHide: true }, (error, stdout) => {
      if (error) {
        fail(new CreatorError("Impossible de lire ce fichier (FFprobe)."));
        return;
      }
      try {
        done(JSON.parse(String(stdout)));
      } catch {
        fail(new CreatorError("Réponse illisible de FFprobe."));
      }
    });
  });
}

export async function assetDetails(
  workspace: CreatorWorkspace,
  projectId: string,
  path: unknown,
): Promise<AssetDetails> {
  const file = assetFile(workspace, projectId, path);
  const data = await probe(file);
  const streams = data.streams ?? [];
  // A still or cover art is a "video" stream with one frame: keep only real moving video.
  const v = streams.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg");
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = Number.parseFloat(data.format?.duration ?? "");
  return {
    path: String(path),
    size: statSync(file).size,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    video: v
      ? {
          codec: v.codec_name ?? "?",
          width: v.width ?? 0,
          height: v.height ?? 0,
          fps: fps(v.avg_frame_rate) ?? fps(v.r_frame_rate),
        }
      : null,
    audio: a
      ? {
          codec: a.codec_name ?? "?",
          channels: a.channels ?? 0,
          sampleRate: Number(a.sample_rate) || 0,
        }
      : null,
  };
}

function uniqueFile(dir: string, stem: string, ext: string): string {
  let candidate = join(dir, `${stem}${ext}`);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`);
  return candidate;
}

/**
 * Writes the sound of a video as `assets/audio/<nom> (audio).wav` (48 kHz, 16 bits),
 * the original untouched. Returns the new project-relative path.
 */
export async function extractAssetAudio(
  workspace: CreatorWorkspace,
  projectId: string,
  path: unknown,
): Promise<string> {
  const file = assetFile(workspace, projectId, path);
  const details = await assetDetails(workspace, projectId, path);
  if (!details.audio) throw new CreatorError("Ce média ne contient pas de piste audio.");
  const dir = resolve(projectDirFor(workspace, projectId) ?? "");
  const outDir = join(dir, "assets", "audio");
  mkdirSync(outDir, { recursive: true });
  const target = uniqueFile(outDir, `${basename(file, extname(file))} (audio)`, ".wav");
  const temp = join(outDir, `.extract-${process.pid}-${Date.now()}.wav`);
  const ffmpeg = findFfBinary("ffmpeg") ?? "ffmpeg";
  const args = ["-v", "error", "-y", "-i", file, "-vn", "-ac", "2", "-ar", "48000"];
  await new Promise<void>((done, fail) => {
    execFile(
      ffmpeg,
      [...args, "-c:a", "pcm_s16le", temp],
      { timeout: 10 * 60 * 1000, windowsHide: true },
      (error) => (error ? fail(new CreatorError("L'extraction de l'audio a échoué.")) : done()),
    );
  }).catch((error: unknown) => {
    rmSync(temp, { force: true });
    throw error;
  });
  renameSync(temp, target);
  // A project open in Studio lists its files from the in-memory session:
  // declare the new media there too, or it would only appear after a restart.
  const session = memoryFor(target);
  if (session) {
    const key = canonicalPath(target);
    session.fs.mkdirSync(dirname(key), { recursive: true });
    session.fs.writeFileSync(key, "");
    session.media.add(key);
  }
  return relative(dir, target).split(sep).join("/");
}
