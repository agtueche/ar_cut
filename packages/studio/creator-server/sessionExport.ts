import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { memoryFor, sources } from "./sessionMemory";

/** Export consumes a frozen technical snapshot, never commits the user's session. */
export function exportSnapshot(projectDir: string) {
  const session = memoryFor(projectDir);
  if (!session) return { dir: projectDir, dispose() {} };
  const dir = mkdtempSync(join(tmpdir(), "hf-studio-export-"));
  try {
    const omit = new Set([
      ".git",
      "node_modules",
      "renders",
      ".studio-memory-history",
      ".thumbnails",
      ".transcode-cache",
      ".waveform-cache",
    ]);
    cpSync(projectDir, dir, {
      recursive: true,
      filter: (path) => path === projectDir || !omit.has(basename(path)),
    });
    const current = sources(session);
    for (const path of session.baseline.keys())
      if (!current.has(path)) rmSync(join(dir, relative(session.root, path)), { force: true });
    for (const [path, content] of current) {
      const target = join(dir, relative(session.root, path));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
