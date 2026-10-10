// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCreatorRequest, type CreatorContext } from "./router";
import { LIBRARY_DIR, libraryFile } from "./sessionLibrary";
import { createWorkspace } from "./workspace";

let home: string;
let ctx: CreatorContext;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "creator-library-"));
  ctx = {
    workspace: createWorkspace(home),
    templatesDir: resolve(__dirname, "../creator-templates"),
    findSystemChrome: () => undefined,
  };
  const project = join(ctx.workspace.projectsDir, "mon-projet", "assets");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "logo.png"), "png-bytes");
  writeFileSync(join(project, "notes.txt"), "pas un média");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const call = (method: string, path: string, body: unknown = null) =>
  handleCreatorRequest(ctx, method, path, body);

describe("Ma bibliothèque", () => {
  it("lists library media and flags the bundled examples", async () => {
    mkdirSync(join(home, LIBRARY_DIR), { recursive: true });
    writeFileSync(join(home, LIBRARY_DIR, "Exemple - Fond.png"), "x");
    writeFileSync(join(home, LIBRARY_DIR, "mon-logo.png"), "y");
    const res = await call("GET", "/library");
    const items = (res.body as { items: Array<{ path: string; example: boolean }> }).items;
    expect(items.map((i) => [i.path, i.example]).sort()).toEqual([
      ["Exemple - Fond.png", true],
      ["mon-logo.png", false],
    ]);
  });

  it("copies a project media into the library, renaming on collision", async () => {
    const first = await call("POST", "/library/items", {
      projectId: "mon-projet",
      path: "assets/logo.png",
    });
    const second = await call("POST", "/library/items", {
      projectId: "mon-projet",
      path: "assets/logo.png",
    });
    expect(first.status).toBe(201);
    expect((first.body as { path: string }).path).toBe("logo.png");
    expect((second.body as { path: string }).path).toBe("logo (2).png");
    expect(readFileSync(join(home, LIBRARY_DIR, "logo.png"), "utf8")).toBe("png-bytes");
    // The project keeps its own file.
    expect(existsSync(join(ctx.workspace.projectsDir, "mon-projet", "assets", "logo.png"))).toBe(
      true,
    );
  });

  it("refuses non-media, missing files and paths outside the project", async () => {
    expect(
      (await call("POST", "/library/items", { projectId: "mon-projet", path: "assets/notes.txt" }))
        .status,
    ).toBe(400);
    expect(
      (await call("POST", "/library/items", { projectId: "mon-projet", path: "assets/absent.png" }))
        .status,
    ).toBe(404);
    expect(
      (await call("POST", "/library/items", { projectId: "mon-projet", path: "../../secret.png" }))
        .status,
    ).toBe(400);
    expect(
      (await call("POST", "/library/items", { projectId: "../x", path: "a.png" })).status,
    ).toBe(400);
  });

  it("removes a media from the library only", async () => {
    await call("POST", "/library/items", { projectId: "mon-projet", path: "assets/logo.png" });
    expect((await call("POST", "/library/remove", { path: "logo.png" })).status).toBe(200);
    expect(existsSync(join(home, LIBRARY_DIR, "logo.png"))).toBe(false);
    expect(existsSync(join(ctx.workspace.projectsDir, "mon-projet", "assets", "logo.png"))).toBe(
      true,
    );
    expect((await call("POST", "/library/remove", { path: "logo.png" })).status).toBe(404);
  });

  it("never resolves a file outside the library", () => {
    expect(libraryFile(ctx.workspace, "../projects/mon-projet/assets/logo.png")).toBeNull();
    expect(libraryFile(ctx.workspace, "/etc/passwd")).toBeNull();
    expect(libraryFile(ctx.workspace, "ok.png")).toBe(join(home, LIBRARY_DIR, "ok.png"));
  });
});
