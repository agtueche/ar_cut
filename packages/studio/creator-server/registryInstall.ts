// Catalog installs for the Studio dev server. The CLI host implements
// `installRegistryBlock` with its own `add` command; the dev adapter had none,
// so the Catalog tab answered "needs hyperframes preview". This runs the same
// `hyperframes add` (the repo's built CLI) with an argument array, then applies
// the CLI host's viewport rewrite so a 1920×1080 block fits the project's size.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { RegistryItem } from "@hyperframes/core/registry";

const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;

interface AddSummary {
  ok: boolean;
  name: string;
  type: string;
  typeDir: string;
  written: string[];
  warnings?: string[];
}

function isAddSummary(value: unknown): value is AddSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && Array.isArray(record.written) && typeof record.typeDir === "string";
}

interface AddRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const ADD_TIMEOUT_MS = 180_000;

/**
 * Runs the CLI under Node (the dev server itself runs under Bun) with stdin
 * closed and the update check, telemetry and skills refresh off, so nothing can
 * leave it waiting for input or a background task.
 */
function spawnAdd(binary: string, cliPath: string, args: string[]): Promise<AddRun> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        HYPERFRAMES_NO_TELEMETRY: "1",
        HYPERFRAMES_SKIP_SKILLS: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill("SIGTERM"), ADD_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

async function runAdd(cliPath: string, args: string[]): Promise<AddRun> {
  try {
    return await spawnAdd("node", cliPath, args);
  } catch (error) {
    // No `node` on this PATH: the current runtime can run the CLI too.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return spawnAdd(process.execPath, cliPath, args);
    }
    throw error;
  }
}

function lastLines(text: string, count: number): string {
  return text.trim().split("\n").slice(-count).join(" ").slice(0, 400);
}

/** The CLI host's `rewriteWrittenToHostViewport`, for blocks authored at 1920×1080. */
export function fitToHostViewport(projectDir: string, written: string[]): void {
  const indexPath = join(projectDir, "index.html");
  if (!existsSync(indexPath)) return;
  const indexHtml = readFileSync(indexPath, "utf-8");
  const hostW = indexHtml.match(/data-width="(\d+)"/)?.[1];
  const hostH = indexHtml.match(/data-height="(\d+)"/)?.[1];
  if (!hostW || !hostH) return;
  for (const absPath of written) {
    if (!absPath.endsWith(".html") || !existsSync(absPath)) continue;
    let content = readFileSync(absPath, "utf-8");
    content = content.replace(
      /(<meta\s+name="viewport"\s+content="width=)\d+(,\s*height=)\d+/i,
      `$1${hostW}$2${hostH}`,
    );
    content = content.replace(
      /(\bwidth:\s*)\d+(px;\s*\n?\s*height:\s*)\d+(px;)/g,
      (match, pre, mid, post) =>
        match.includes("1920") || match.includes("1080")
          ? `${pre}${hostW}${mid}${hostH}${post}`
          : match,
    );
    const temp = `${absPath}.${process.pid}.tmp`;
    writeFileSync(temp, content, "utf-8");
    renameSync(temp, absPath);
  }
}

function readManifest(registryRoot: string, typeDir: string, name: string): RegistryItem | null {
  const path = join(registryRoot, typeDir, name, "registry-item.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RegistryItem;
  } catch {
    return null;
  }
}

export async function installRegistryItemWithCli(opts: {
  cliPath: string;
  registryRoot: string;
  projectDir: string;
  blockName: string;
}): Promise<{ written: string[]; block: RegistryItem }> {
  if (!SAFE_NAME.test(opts.blockName)) throw new Error("Nom d'élément du catalogue invalide.");
  if (!existsSync(opts.cliPath)) {
    throw new Error(
      "Le CLI HyperFrames n'est pas compilé : lancez `bun run build` à la racine du dépôt.",
    );
  }
  const run = await runAdd(opts.cliPath, [
    "add",
    opts.blockName,
    "--dir",
    opts.projectDir,
    "--json",
    "--no-clipboard",
  ]);
  // Trust the JSON summary when there is one, even on a non-zero exit.
  const jsonLine = run.stdout
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{"));
  let summary: unknown = null;
  try {
    summary = jsonLine ? JSON.parse(jsonLine) : null;
  } catch {
    summary = null;
  }
  if (!isAddSummary(summary)) {
    const why = run.signal
      ? `interrompu (${run.signal}) après ${ADD_TIMEOUT_MS / 1000} s`
      : `code de sortie ${run.code}`;
    const detail = lastLines(run.stderr, 4) || lastLines(run.stdout, 4);
    throw new Error(
      `hyperframes add ${opts.blockName} a échoué : ${why}${detail ? ` — ${detail}` : ""}`,
    );
  }
  for (const warning of summary.warnings ?? [])
    process.stderr.write(`hyperframes:registry ${warning}\n`);

  fitToHostViewport(opts.projectDir, summary.written);
  // The Catalog tab lists this same local registry, so an installed item always has its manifest.
  const block = readManifest(opts.registryRoot, summary.typeDir, summary.name);
  if (!block) throw new Error(`Fiche du catalogue introuvable pour « ${summary.name} ».`);
  // Studio mounts the first .html it receives: the item's own composition first.
  // Re-adding an item already in the project writes nothing: hand back its existing file.
  const existing = join(opts.projectDir, "compositions", `${summary.name}.html`);
  if (!summary.written.some((path) => path.endsWith(".html")) && existsSync(existing)) {
    summary.written.unshift(existing);
  }
  const relativePaths = summary.written.map((abs) =>
    relative(opts.projectDir, abs).split(sep).join("/"),
  );
  const primary = relativePaths.find((path) => path.endsWith(`${summary.name}.html`));
  return {
    written: primary
      ? [primary, ...relativePaths.filter((path) => path !== primary)]
      : relativePaths,
    block,
  };
}
