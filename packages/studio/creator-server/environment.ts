// What this machine can actually do. Every probe runs a binary with an argument
// array (never a shell string) and reports "missing" with an install hint.

import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";

export type CheckStatus = "ok" | "missing";

export interface EnvironmentCheck {
  id: "ffmpeg" | "ffprobe" | "browser" | "whisper";
  status: CheckStatus;
  detail: string;
  hint?: string;
  required: boolean;
}

function firstLine(binary: string, args: string[]): Promise<string | null> {
  return new Promise((resolvePromise) => {
    execFile(binary, args, { timeout: 20000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise(null);
        return;
      }
      const out = `${stdout}${stderr}`.split("\n").find((line) => line.trim());
      resolvePromise(out?.trim() ?? "");
    });
  });
}

/** chrome-headless-shell installed by `npx hyperframes browser ensure`, if any. */
function cachedHeadlessShell(): string | null {
  const root = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!existsSync(root)) return null;
  for (const version of readdirSync(root)) {
    for (const platformDir of safeReaddir(join(root, version))) {
      const binary = join(root, version, platformDir, "chrome-headless-shell");
      if (existsSync(binary)) return binary;
    }
  }
  return null;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export async function checkEnvironment(
  findSystemChrome: () => string | undefined,
): Promise<EnvironmentCheck[]> {
  const [ffmpeg, ffprobe, whisper] = await Promise.all([
    firstLine(findFfBinary("ffmpeg") ?? "ffmpeg", ["-version"]),
    firstLine(findFfBinary("ffprobe") ?? "ffprobe", ["-version"]),
    firstLine("whisper-cli", ["--help"]),
  ]);
  const browser = cachedHeadlessShell() ?? findSystemChrome() ?? null;
  return [
    {
      id: "ffmpeg",
      required: true,
      status: ffmpeg ? "ok" : "missing",
      detail: ffmpeg ?? "FFmpeg est introuvable : l'export MP4 est impossible.",
      hint: ffmpeg ? undefined : "brew install ffmpeg (ou ajoutez ffmpeg à votre PATH)",
    },
    {
      id: "ffprobe",
      required: true,
      status: ffprobe ? "ok" : "missing",
      detail: ffprobe ?? "FFprobe est introuvable : les métadonnées des médias sont indisponibles.",
      hint: ffprobe ? undefined : "FFprobe est fourni avec FFmpeg.",
    },
    {
      id: "browser",
      required: true,
      status: browser ? "ok" : "missing",
      detail: browser ?? "Aucun navigateur de rendu trouvé.",
      hint: browser ? undefined : "npx hyperframes browser ensure",
    },
    {
      id: "whisper",
      required: false,
      status: whisper !== null ? "ok" : "missing",
      detail:
        whisper !== null
          ? "whisper-cli disponible (transcription locale via la commande hyperframes transcribe)."
          : "Transcription automatique non configurée.",
      hint: whisper !== null ? undefined : "Optionnel : npx hyperframes doctor",
    },
  ];
}
