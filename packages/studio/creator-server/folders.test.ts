// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FOLDERS_FILE, isSafeMediaPath } from "./folders";
import { handleCreatorRequest, type CreatorContext } from "./router";
import { createWorkspace } from "./workspace";

let home: string;
let ctx: CreatorContext;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "creator-folders-"));
  ctx = {
    workspace: createWorkspace(home),
    templatesDir: resolve(__dirname, "../creator-templates"),
    findSystemChrome: () => undefined,
  };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const call = (method: string, path: string, body: unknown = null) =>
  handleCreatorRequest(ctx, method, path, body);

async function create(name: string, parentId?: string): Promise<string> {
  const res = await call("POST", "/folders", { name, parentId });
  expect(res.status).toBe(201);
  return (res.body as { folder: { id: string } }).folder.id;
}

async function list() {
  const res = await call("GET", "/folders");
  return (
    res.body as {
      folders: Array<{
        id: string;
        name: string;
        parentId: string | null;
        items: unknown[];
        color: string | null;
      }>;
    }
  ).folders;
}

describe("Mes dossiers", () => {
  it("starts empty and lists a new folder right away, persisted on disk", async () => {
    expect(await list()).toEqual([]);
    const id = await create("  Intro   client ");
    const folders = await list();
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ id, name: "Intro client", parentId: null, items: [] });
    const onDisk = JSON.parse(readFileSync(join(home, FOLDERS_FILE), "utf8"));
    expect(onDisk.folders[0].name).toBe("Intro client");
  });

  it("refuses an empty name", async () => {
    const res = await call("POST", "/folders", { name: "   " });
    expect(res.status).toBe(400);
  });

  it("renames and colours a folder", async () => {
    const id = await create("A");
    const res = await call("PATCH", `/folders/${id}`, { name: "Musiques", color: "orange" });
    expect(res.status).toBe(200);
    expect((await list())[0]).toMatchObject({ name: "Musiques", color: "orange" });
    const bad = await call("PATCH", `/folders/${id}`, { color: "violet" });
    expect(bad.status).toBe(400);
  });

  it("nests up to three levels and deletes a folder with its sub-folders", async () => {
    const a = await create("A");
    const b = await create("B", a);
    const c = await create("C", b);
    const tooDeep = await call("POST", "/folders", { name: "D", parentId: c });
    expect(tooDeep.status).toBe(400);
    const other = await create("Autre");
    const res = await call("DELETE", `/folders/${a}`);
    expect((res.body as { deleted: string[] }).deleted.sort()).toEqual([a, b, c].sort());
    expect((await list()).map((f) => f.id)).toEqual([other]);
  });

  it("adds a media reference once and removes it, without touching files", async () => {
    const id = await create("Plans");
    const item = { projectId: "mon-projet", path: "assets/plans/V01.mp4" };
    await call("POST", `/folders/${id}/items`, item);
    await call("POST", `/folders/${id}/items`, item);
    expect((await list())[0]?.items).toEqual([item]);
    await call("POST", `/folders/${id}/items/remove`, item);
    expect((await list())[0]?.items).toEqual([]);
  });

  it("rejects unsafe media references", async () => {
    const id = await create("Plans");
    for (const bad of [
      { projectId: "../x", path: "a.mp4" },
      { projectId: "p", path: "../secret.mp4" },
      { projectId: "p", path: "/etc/passwd" },
    ]) {
      expect((await call("POST", `/folders/${id}/items`, bad)).status).toBe(400);
    }
    expect(isSafeMediaPath("assets/voix/G01.wav")).toBe(true);
  });

  it("returns 404 for an unknown folder", async () => {
    expect((await call("PATCH", "/folders/inconnu", { name: "x" })).status).toBe(404);
  });

  it("keeps a corrupted store untouched and reports it", async () => {
    writeFileSync(join(home, FOLDERS_FILE), "{ pas du json");
    const res = await call("GET", "/folders");
    expect(res.status).toBe(409);
    expect(readFileSync(join(home, FOLDERS_FILE), "utf8")).toBe("{ pas du json");
  });
});
