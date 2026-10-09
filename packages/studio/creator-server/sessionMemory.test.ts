// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { beginMemory, discardMemory, memoryStatus, saveMemory } from "./sessionMemory";
import * as sessionFs from "./sessionFs";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "studio-memory-"));
  roots.push(root);
  const file = join(root, "index.html");
  writeFileSync(file, "original");
  const session = beginMemory(root);
  return { root, file, session };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    discardMemory(beginMemory(root));
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Studio manual storage", () => {
  it("keeps an edit and atomic rename in RAM until Save", () => {
    const { file, session } = fixture();
    sessionFs.writeFileSync(file + ".tmp", "edited");
    sessionFs.renameSync(file + ".tmp", file);
    expect(readFileSync(file, "utf8")).toBe("original");
    expect(sessionFs.readFileSync(file, "utf8")).toBe("edited");
    expect(memoryStatus(session).dirty).toBe(true);
    saveMemory(session);
    expect(readFileSync(file, "utf8")).toBe("edited");
    expect(memoryStatus(session).dirty).toBe(false);
  });
  it("discards without touching saved files", () => {
    const { file, session } = fixture();
    sessionFs.writeFileSync(file, "abandoned");
    discardMemory(session);
    expect(readFileSync(file, "utf8")).toBe("original");
  });
  it("keeps edits on a save conflict", () => {
    const { file, session } = fixture();
    sessionFs.writeFileSync(file, "edited");
    writeFileSync(file, "external");
    expect(() => saveMemory(session)).toThrow("Conflit externe");
    expect(sessionFs.readFileSync(file, "utf8")).toBe("edited");
    expect(readFileSync(file, "utf8")).toBe("external");
    expect(memoryStatus(session).dirty).toBe(true);
  });
  it("keeps history writes in RAM and excludes them from Save", () => {
    const { root, session } = fixture();
    const dir = join(root, ".studio-memory-history");
    sessionFs.mkdirSync(dir, { recursive: true });
    sessionFs.writeFileSync(join(dir, "log.json"), "{}");
    saveMemory(session);
    expect(existsSync(dir)).toBe(false);
  });
  it("routes file descriptors to the owning memory volume", () => {
    const { file } = fixture();
    const fd = sessionFs.openSync(file, "r+");
    sessionFs.writeFileSync(fd, "inmemory");
    sessionFs.closeSync(fd);
    expect(readFileSync(file, "utf8")).toBe("original");
    expect(sessionFs.readFileSync(file, "utf8")).toBe("inmemory");
  });
  it("ignores a session history ID while saving sources and Studio manifests", () => {
    const { root, file, session } = fixture();
    const hidden = join(root, ".hyperframes");
    mkdirSync(hidden);
    const historyId = join(hidden, "history-id");
    writeFileSync(historyId, "saved-project-history");
    sessionFs.mkdirSync(hidden, { recursive: true });
    sessionFs.writeFileSync(historyId, "temporary-session-history");
    expect(memoryStatus(session).dirty).toBe(false);

    const manifest = join(hidden, "studio-manual-edits.json");
    sessionFs.writeFileSync(manifest, '{"edited":true}');
    sessionFs.writeFileSync(file, "corrected montage");
    expect(memoryStatus(session).dirty).toBe(true);
    expect(() => saveMemory(session)).not.toThrow();
    expect(readFileSync(historyId, "utf8")).toBe("saved-project-history");
    expect(readFileSync(manifest, "utf8")).toBe('{"edited":true}');
    expect(readFileSync(file, "utf8")).toBe("corrected montage");
    expect(memoryStatus(session).dirty).toBe(false);
  });
});

it("exports an unsaved snapshot without saving or losing motion manifests", async () => {
  const { root, file, session } = fixture();
  const hidden = join(root, ".hyperframes");
  sessionFs.mkdirSync(hidden, { recursive: true });
  sessionFs.writeFileSync(join(hidden, "studio-manual-edits.json"), '{"test":true}');
  sessionFs.writeFileSync(file, "unsaved export");
  const { exportSnapshot } = await import("./sessionExport");
  const snapshot = exportSnapshot(root);
  try {
    expect(readFileSync(join(snapshot.dir, "index.html"), "utf8")).toBe("unsaved export");
    expect(readFileSync(join(snapshot.dir, ".hyperframes/studio-manual-edits.json"), "utf8")).toBe(
      '{"test":true}',
    );
    expect(readFileSync(file, "utf8")).toBe("original");
    expect(memoryStatus(session).dirty).toBe(true);
  } finally {
    snapshot.dispose();
  }
});

it("publishes new technical media without changing the saved montage", () => {
  const { root, file, session } = fixture();
  const media = join(root, "test.wav");
  sessionFs.writeFileSync(media, Buffer.from([1, 2, 3, 4]));
  expect(readFileSync(media)).toEqual(Buffer.from([1, 2, 3, 4]));
  expect(memoryStatus(session).dirty).toBe(false);
  expect(readFileSync(file, "utf8")).toBe("original");
});

it("keeps URL and Buffer source paths in memory until explicit save", async () => {
  const { file, session } = fixture();
  const { pathToFileURL } = await import("node:url");
  sessionFs.writeFileSync(pathToFileURL(file), "URL edit");
  expect(readFileSync(file, "utf8")).toBe("original");
  const promises = await import("./sessionFsPromises");
  await promises.writeFile(Buffer.from(file), "Buffer edit");
  expect(readFileSync(file, "utf8")).toBe("original");
  expect(await promises.readFile(pathToFileURL(file), "utf8")).toBe("Buffer edit");
  saveMemory(session);
  expect(readFileSync(file, "utf8")).toBe("Buffer edit");
});

it("publishes async imports but keeps replacement media unsaved", async () => {
  const { root, session } = fixture();
  const promises = await import("./sessionFsPromises");
  const file = join(root, "async.wav");
  await promises.writeFile(file, Buffer.from([1, 2, 3]));
  expect(readFileSync(file)).toEqual(Buffer.from([1, 2, 3]));
  await promises.writeFile(file, Buffer.from([4, 5, 6]));
  expect(readFileSync(file)).toEqual(Buffer.from([1, 2, 3]));
  expect(memoryStatus(session).dirty).toBe(true);
});

it("accepts the explicit undefined open mode used by atomic media imports", () => {
  const { root } = fixture();
  const path = join(root, "import.tmp");
  const fd = sessionFs.openSync(path, "wx", undefined);
  sessionFs.writeFileSync(fd, Buffer.from([7, 8, 9]));
  sessionFs.closeSync(fd);
  const output = join(root, "import.wav");
  sessionFs.renameSync(path, output);
  expect(readFileSync(output)).toEqual(Buffer.from([7, 8, 9]));
});

it("accepts undefined mode in atomic writer options", () => {
  const { root } = fixture();
  const file = join(root, "atomic.tmp");
  sessionFs.writeFileSync(file, Buffer.from([1, 3, 5]), {
    encoding: "utf-8",
    mode: undefined,
    flag: "wx",
  });
  sessionFs.linkSync(file, join(root, "atomic.wav"));
  sessionFs.unlinkSync(file);
  expect(readFileSync(join(root, "atomic.wav"))).toEqual(Buffer.from([1, 3, 5]));
});

it("saves after metadata updates to a newly imported asset without a false conflict", () => {
  const { root, file, session } = fixture();
  const media = join(root, "new.wav");
  sessionFs.writeFileSync(media, Buffer.from([1, 2, 3]));
  sessionFs.chmodSync(media, 0o644);
  sessionFs.writeFileSync(file, "uses new.wav");
  expect(() => saveMemory(session)).not.toThrow();
  expect(memoryStatus(session).dirty).toBe(false);
  expect(readFileSync(media)).toEqual(Buffer.from([1, 2, 3]));
});
