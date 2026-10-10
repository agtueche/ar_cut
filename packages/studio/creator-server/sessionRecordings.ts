// « Enregistrements »: voice-over, webcam and screen takes recorded in the app,
// kept in <home>/enregistrements/, and an « Améliorer » pass that makes an
// ordinary microphone sound clean:
//
//   rumble cut (high-pass) → noise reduction (RNNoise speech model, or FFT
//   denoise) → de-esser → voice EQ (less mud, more presence) → compressor →
//   loudness normalisation to -16 LUFS / -1.5 dBTP (video and podcast norm)
//   → silence trimmed at both ends.
//
// Lives under the `session` prefix (see sessionMediaInfo.ts): it writes real
// files and runs FFmpeg on them.

import { execFile } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";
import { isSafeMediaPath } from "./folders";
import { CreatorError } from "./projectOps";
import { libraryDirFor, streamMediaFile } from "./sessionLibrary";
import { readMediaInfo, type MediaInfo } from "./sessionMediaInfo";
import type { CreatorWorkspace } from "./workspace";

export const RECORDINGS_DIR = "enregistrements";
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MODEL = resolve(__dirname, "models", "rnnoise-speech.rnnn");
export const ENHANCED_SUFFIX = " (améliorée)";

export type RecordingKind = "voice" | "webcam" | "screen";
export type DenoiseLevel = "off" | "light" | "medium" | "strong";

export interface EnhanceOptions {
  denoise: DenoiseLevel;
  deEss: boolean;
  voiceEq: boolean;
  compress: boolean;
  normalize: boolean;
  trimSilence: boolean;
}

export const DEFAULT_ENHANCE: EnhanceOptions = {
  denoise: "medium",
  deEss: true,
  voiceEq: true,
  compress: true,
  normalize: true,
  trimSilence: true,
};

export interface RecordingItem extends MediaInfo {
  kind: "audio" | "video";
  enhanced: boolean;
}

export function recordingsDirFor(workspace: CreatorWorkspace): string {
  const dir = join(workspace.home, RECORDINGS_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function recordingFile(workspace: CreatorWorkspace, relPath: string): string | null {
  if (!isSafeMediaPath(relPath) || relPath.includes("/")) return null;
  const root = recordingsDirFor(workspace);
  const file = resolve(root, relPath);
  return file.startsWith(root + sep) ? file : null;
}

const VIDEO_EXT = new Set([".webm", ".mp4", ".mov", ".mkv"]);

export async function listRecordings(workspace: CreatorWorkspace): Promise<RecordingItem[]> {
  const items = await readMediaInfo(recordingsDirFor(workspace));
  return items
    .filter((i) => !i.path.endsWith(".part"))
    .map((i) => ({
      ...i,
      kind: (VIDEO_EXT.has(extname(i.path).toLowerCase())
        ? "video"
        : "audio") as RecordingItem["kind"],
      enhanced: basename(i.path, extname(i.path)).endsWith(ENHANCED_SUFFIX),
    }))
    .sort((a, b) => b.importedAt - a.importedAt);
}

function ffmpeg(args: string[], timeoutMs = 10 * 60 * 1000): Promise<void> {
  const bin = findFfBinary("ffmpeg") ?? "ffmpeg";
  return new Promise((resolvePromise, reject) => {
    execFile(
      bin,
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, _out, stderr) => {
        if (error)
          reject(new Error(String(stderr).trim().split("\n").slice(-3).join(" ") || error.message));
        else resolvePromise();
      },
    );
  });
}

function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}h${p(now.getMinutes())}m${p(now.getSeconds())}`;
}

const KIND_NAME: Record<RecordingKind, string> = {
  voice: "Voix off",
  webcam: "Webcam",
  screen: "Capture d'écran",
};

function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++)
    if (!existsSync(join(dir, `${stem} (${n})${ext}`))) return `${stem} (${n})${ext}`;
}

/**
 * Receives a take from the browser (MediaRecorder output) and stores it:
 * voice → WAV 48 kHz 24-bit mono (lossless from here on); video → kept as recorded.
 */
export async function receiveRecording(
  workspace: CreatorWorkspace,
  kind: RecordingKind,
  req: IncomingMessage,
): Promise<string> {
  const type = String(req.headers["content-type"] ?? "");
  if (!/^(audio|video)\//.test(type))
    throw new CreatorError("Format d'enregistrement non pris en charge.");
  const dir = recordingsDirFor(workspace);
  const upload = join(dir, `.upload-${process.pid}-${Date.now()}.part`);
  let size = 0;
  await new Promise<void>((resolvePromise, reject) => {
    const out = createWriteStream(upload);
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        req.destroy();
        reject(new CreatorError("Enregistrement trop long (plus de 1 Go).", 409));
      }
    });
    req.pipe(out);
    out.on("finish", () => resolvePromise());
    out.on("error", reject);
    req.on("error", reject);
  }).catch((error: unknown) => {
    rmSync(upload, { force: true });
    throw error;
  });
  if (size === 0) {
    rmSync(upload, { force: true });
    throw new CreatorError("L'enregistrement est vide.");
  }
  const base = `${KIND_NAME[kind]} ${stamp()}`;
  try {
    if (kind === "voice") {
      const name = uniqueName(dir, `${base}.wav`);
      await ffmpeg([
        "-i",
        upload,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s24le",
        join(dir, name),
      ]);
      return name;
    }
    const name = uniqueName(dir, `${base}${type.includes("mp4") ? ".mp4" : ".webm"}`);
    renameSync(upload, join(dir, name));
    return name;
  } catch (error) {
    throw new CreatorError(
      `Conversion impossible : ${error instanceof Error ? error.message : "erreur FFmpeg"}`,
      409,
    );
  } finally {
    rmSync(upload, { force: true });
  }
}

/** FFmpeg filtergraph value quoting: single quotes, with \ and ' escaped. */
function quoteFilterValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function cleanEnhanceOptions(raw: unknown): EnhanceOptions {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof EnhanceOptions) =>
    typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_ENHANCE[key] as boolean);
  const denoise = ["off", "light", "medium", "strong"].includes(String(r.denoise))
    ? (r.denoise as DenoiseLevel)
    : DEFAULT_ENHANCE.denoise;
  return {
    denoise,
    deEss: bool("deEss"),
    voiceEq: bool("voiceEq"),
    compress: bool("compress"),
    normalize: bool("normalize"),
    trimSilence: bool("trimSilence"),
  };
}

/** The audio filter chain for the chosen options. Pure — unit-tested. */
export function enhanceFilterChain(
  options: EnhanceOptions,
  modelPath = MODEL,
  preGainDb = 0,
): string {
  // Level first: the gate threshold below only means something at a known input level.
  const chain: string[] = preGainDb
    ? [`volume=${preGainDb.toFixed(1)}dB`, "highpass=f=80"]
    : ["highpass=f=80"];
  if (options.trimSilence) {
    chain.push("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2");
  }
  if (options.denoise === "light") chain.push("afftdn=nr=10:nf=-45:tn=1");
  if (options.denoise === "medium") chain.push(`arnndn=m=${quoteFilterValue(modelPath)}:mix=0.8`);
  if (options.denoise === "strong")
    chain.push(`arnndn=m=${quoteFilterValue(modelPath)}:mix=1`, "afftdn=nr=12:nf=-50:tn=1");
  // Soft gate after denoising: lowers what remains between words (measured: voice-to-noise
  // 13.6 dB → 33 dB on a voice degraded with pink noise and 50 Hz hum).
  if (options.denoise !== "off")
    chain.push("agate=threshold=0.02:ratio=2:range=0.25:attack=5:release=200");
  if (options.deEss) chain.push("deesser=i=0.4:m=0.5:f=0.5:s=o");
  if (options.voiceEq)
    chain.push(
      "equalizer=f=250:t=q:w=1:g=-2",
      "equalizer=f=3500:t=q:w=1.2:g=3",
      "equalizer=f=10000:t=q:w=1:g=1.5",
    );
  if (options.compress)
    chain.push("acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2");
  if (options.trimSilence) {
    chain.push(
      "areverse",
      "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3",
      "areverse",
    );
  }
  if (options.normalize) chain.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  return chain.join(",");
}

/** Integrated loudness (LUFS) of a file, or null when it cannot be measured. */
function measureLoudness(file: string): Promise<number | null> {
  const bin = findFfBinary("ffmpeg") ?? "ffmpeg";
  return new Promise((resolvePromise) => {
    execFile(
      bin,
      ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128", "-f", "null", "-"],
      { timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (_error, _out, stderr) => {
        const all = [...String(stderr).matchAll(/\bI:\s+(-?[\d.]+) LUFS/g)];
        const value = all.length ? Number(all[all.length - 1]![1]) : NaN;
        resolvePromise(Number.isFinite(value) && value > -70 ? value : null);
      },
    );
  });
}

/** Gain that brings the take to about -20 LUFS before processing, clamped to -12 / +30 dB. */
export function preGainFor(loudness: number | null): number {
  if (loudness === null) return 0;
  return Math.max(-12, Math.min(30, -20 - loudness));
}

/** Writes « <name> (améliorée) » next to the take; the original is kept for comparison. */
export async function enhanceRecording(
  workspace: CreatorWorkspace,
  relPath: unknown,
  rawOptions: unknown,
): Promise<string> {
  const file = typeof relPath === "string" ? recordingFile(workspace, relPath) : null;
  if (!file || !existsSync(file)) throw new CreatorError("Enregistrement introuvable.", 404);
  const ext = extname(file).toLowerCase();
  const stem = basename(file, extname(file)).replace(
    new RegExp(`${ENHANCED_SUFFIX.replace(/[()]/g, "\\$&")}$`),
    "",
  );
  const isVideo = VIDEO_EXT.has(ext);
  const dir = recordingsDirFor(workspace);
  const outName = `${stem}${ENHANCED_SUFFIX}${isVideo ? ext : ".wav"}`;
  const target = join(dir, outName);
  const temp = join(dir, `.enhance-${process.pid}-${Date.now()}${isVideo ? ext : ".wav"}`);
  const options = cleanEnhanceOptions(rawOptions);
  const preGain = options.denoise === "off" ? 0 : preGainFor(await measureLoudness(file));
  const filters = enhanceFilterChain(options, MODEL, preGain);
  const args = isVideo
    ? [
        "-i",
        file,
        "-c:v",
        "copy",
        "-af",
        filters,
        "-ar",
        "48000",
        "-c:a",
        ext === ".webm" ? "libopus" : "aac",
        "-b:a",
        "192k",
        temp,
      ]
    : ["-i", file, "-vn", "-af", filters, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s24le", temp];
  try {
    await ffmpeg(args);
    if (!existsSync(temp) || statSync(temp).size === 0)
      throw new Error("fichier vide (tout le son a-t-il été coupé ?)");
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw new CreatorError(
      `Amélioration impossible : ${error instanceof Error ? error.message : "erreur FFmpeg"}`,
      409,
    );
  }
  return outName;
}

export function removeRecording(workspace: CreatorWorkspace, relPath: unknown): void {
  const file = typeof relPath === "string" ? recordingFile(workspace, relPath) : null;
  if (!file || !existsSync(file)) throw new CreatorError("Enregistrement introuvable.", 404);
  unlinkSync(file);
}

export function serveRecordingFile(
  workspace: CreatorWorkspace,
  relPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  streamMediaFile(recordingFile(workspace, relPath), req, res);
}

export function isRecordingKind(value: unknown): value is RecordingKind {
  return value === "voice" || value === "webcam" || value === "screen";
}

/** Copies a take into « Ma bibliothèque » (the take stays in Enregistrements). */
export function recordingToLibrary(workspace: CreatorWorkspace, relPath: unknown): string {
  const file = typeof relPath === "string" ? recordingFile(workspace, relPath) : null;
  if (!file || !existsSync(file)) throw new CreatorError("Enregistrement introuvable.", 404);
  const dir = libraryDirFor(workspace);
  const name = uniqueName(dir, basename(file));
  copyFileSync(file, join(dir, name));
  return name;
}
