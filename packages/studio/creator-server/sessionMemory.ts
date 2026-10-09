/** Studio-only file system. Source edits and history stay in RAM until an explicit commit. */
import * as disk from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Volume, createFsFromVolume } from "memfs";

const OMIT = new Set([
  ".git",
  "node_modules",
  "renders",
  ".thumbnails",
  ".transcode-cache",
  ".waveform-cache",
]);
const SOURCE = /\.(html?|css|[cm]?js|json|svg|txt|srt|vtt|cube|glsl|wgsl)$/i;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export type MemoryFs = ReturnType<typeof createFsFromVolume>;
export interface StudioMemory {
  root: string;
  fs: MemoryFs;
  baseline: Map<string, Buffer>;
  media: Set<string>;
  revision: number;
  saving: boolean;
  error: string | null;
}
interface Registry {
  sessions: Map<string, StudioMemory>;
  fds: Map<number, { session: StudioMemory; inner: number }>;
}
const key = Symbol.for("hyperframes.creator.memory.v1");
const globalRegistry = globalThis as typeof globalThis & { [key]?: Registry };
export const registry: Registry = (globalRegistry[key] ??= { sessions: new Map(), fds: new Map() });

export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return disk.realpathSync(absolute);
  } catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(canonicalPath(parent), relative(parent, absolute));
  }
}

export function memoryFor(path: unknown): StudioMemory | undefined {
  if (typeof path === "number") return registry.fds.get(path)?.session;
  if (typeof path !== "string") return undefined;
  const absolute = canonicalPath(path);
  return [...registry.sessions.values()].find(
    (s) => absolute === s.root || absolute.startsWith(s.root + sep),
  );
}

export function beginMemory(root: string): StudioMemory {
  root = disk.realpathSync(root);
  const existing = registry.sessions.get(root);
  if (existing) return existing;
  const fs = createFsFromVolume(new Volume());
  const session: StudioMemory = {
    root,
    fs,
    baseline: new Map(),
    media: new Set(),
    revision: 0,
    saving: false,
    error: null,
  };
  let bytes = 0;
  const walk = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of disk.readdirSync(dir, { withFileTypes: true })) {
      if (OMIT.has(entry.name)) continue;
      if (dir.endsWith("/.hyperframes") && !entry.name.startsWith("studio-")) continue;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Lien symbolique non pris en charge dans la session : ${relative(root, path)}`,
        );
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        if (SOURCE.test(path) || entry.name === ".gitkeep") {
          bytes += disk.statSync(path).size;
          if (bytes > MAX_SOURCE_BYTES)
            throw new Error("Les sources dépassent la limite de session de 64 Mo.");
          const content = disk.readFileSync(path);
          fs.writeFileSync(path, content);
          session.baseline.set(path, content);
        } else {
          // Directory discovery sees assets; decoding and probing still read their original bytes.
          fs.writeFileSync(path, "");
          session.media.add(path);
        }
      }
    }
  };
  walk(root);
  registry.sessions.set(root, session);
  return session;
}

export function sources(session: StudioMemory): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const entry of session.fs.readdirSync(dir, { withFileTypes: true })) {
      const name = String(entry.name);
      if (OMIT.has(name) || name === ".studio-memory-history") continue;
      // Match the baseline filter: internal history IDs belong to the session,
      // while studio-* manifests are editable project sources.
      if (dir.endsWith("/.hyperframes") && !name.startsWith("studio-")) continue;
      const path = join(dir, name);
      if (entry.isDirectory()) walk(path);
      else if (!session.media.has(path))
        files.set(path, Buffer.from(session.fs.readFileSync(path)));
    }
  };
  walk(session.root);
  return files;
}

export function memoryStatus(session: StudioMemory) {
  const current = sources(session);
  const dirty =
    current.size !== session.baseline.size ||
    [...current].some(
      ([path, value]) => !value.equals(session.baseline.get(path) ?? Buffer.alloc(0)),
    );
  return { dirty, revision: session.revision, saving: session.saving, error: session.error };
}

/** Coherent synchronous commit: preflight every source, stage all files, rollback on failure. */
export function saveMemory(session: StudioMemory) {
  if (session.saving) throw new Error("Un enregistrement est déjà en cours.");
  session.saving = true;
  session.error = null;
  const current = sources(session);
  const changed = [...new Set([...current.keys(), ...session.baseline.keys()])].filter((path) => {
    const a = current.get(path),
      b = session.baseline.get(path);
    return !a || !b || !a.equals(b);
  });
  const staged = new Map<string, string>();
  const applied: string[] = [];
  try {
    for (const path of changed) {
      const before = session.baseline.get(path);
      const actual = disk.existsSync(path) ? disk.readFileSync(path) : undefined;
      const after = current.get(path);
      if (!before && actual && after?.equals(actual)) continue;
      // A technical import may already have published these exact bytes.
      if (before ? !actual?.equals(before) : actual !== undefined)
        throw new Error(
          `Conflit externe : ${relative(session.root, path)}. Les modifications restent en mémoire.`,
        );
      if (after) {
        disk.mkdirSync(dirname(path), { recursive: true });
        const temp = path + `.studio-save-${process.pid}.tmp`;
        disk.writeFileSync(temp, after, { flag: "wx" });
        staged.set(path, temp);
      }
    }
    for (const path of changed) {
      const temp = staged.get(path);
      if (temp) disk.renameSync(temp, path);
      else if (!current.has(path)) disk.unlinkSync(path);
      else continue;
      applied.push(path);
    }
    session.baseline = current;
  } catch (error) {
    for (const path of applied.reverse()) {
      const before = session.baseline.get(path);
      if (before) disk.writeFileSync(path, before);
      else disk.rmSync(path, { force: true });
    }
    session.error = error instanceof Error ? error.message : "Échec de l’enregistrement.";
    throw error;
  } finally {
    for (const temp of staged.values()) disk.rmSync(temp, { force: true });
    session.saving = false;
  }
  return memoryStatus(session);
}

export function discardMemory(session: StudioMemory) {
  registry.sessions.delete(session.root);
  for (const [fd, owner] of registry.fds) if (owner.session === session) registry.fds.delete(fd);
}
