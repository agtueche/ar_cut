// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_OWNER,
  LOCAL_VIEWER,
  canEdit,
  canView,
  isSharedWith,
  readOwnership,
  type Ownership,
  type Viewer,
} from "./ownership";
import { handleCreatorRequest, type CreatorContext } from "./router";
import { createWorkspace } from "./workspace";

const alice: Viewer = { userId: "alice", teamIds: ["uee"] };
const bob: Viewer = { userId: "bob", teamIds: [] };
const own = (
  kind: "user" | "team",
  id: string,
  visibility: Ownership["visibility"],
): Ownership => ({
  owner: { kind, id },
  visibility,
});

describe("ownership rules", () => {
  it("reads old records as local and private, each field on its own", () => {
    expect(readOwnership(undefined)).toEqual({ owner: LOCAL_OWNER, visibility: "private" });
    expect(readOwnership({ visibility: "team" })).toEqual({
      owner: LOCAL_OWNER,
      visibility: "team",
    });
    expect(readOwnership({ owner: { kind: "team", id: "uee" }, visibility: "nope" })).toEqual({
      owner: { kind: "team", id: "uee" },
      visibility: "private",
    });
    expect(readOwnership({ owner: { kind: "robot", id: "../x" } }).owner).toEqual(LOCAL_OWNER);
  });

  it("lets the owner see and edit a private record, and nobody else", () => {
    const mine = own("user", "alice", "private");
    expect(canView(alice, mine) && canEdit(alice, mine)).toBe(true);
    expect(canView(bob, mine) || canEdit(bob, mine)).toBe(false);
  });

  it("opens a team record to its members only, and lists it as shared", () => {
    const team = own("team", "uee", "team");
    expect(canView(alice, team)).toBe(true);
    expect(canView(bob, team)).toBe(false);
    expect(isSharedWith(alice, team)).toBe(true);
    expect(isSharedWith(alice, own("user", "alice", "team"))).toBe(false);
  });

  it("keeps everything of a local install private to the local user", () => {
    const local = readOwnership(null);
    expect(canView(LOCAL_VIEWER, local) && canEdit(LOCAL_VIEWER, local)).toBe(true);
    expect(isSharedWith(LOCAL_VIEWER, local)).toBe(false);
  });
});

describe("ownership in the API", () => {
  let home: string;
  let ctx: CreatorContext;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "creator-ownership-"));
    ctx = {
      workspace: createWorkspace(home),
      templatesDir: resolve(__dirname, "../creator-templates"),
      findSystemChrome: () => undefined,
    };
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("gives a new folder the local owner and private visibility, and lets it change visibility", async () => {
    const created = await handleCreatorRequest(ctx, "POST", "/folders", { name: "Intro" });
    const folder = (created.body as { folder: Ownership & { id: string } }).folder;
    expect(folder.owner).toEqual(LOCAL_OWNER);
    expect(folder.visibility).toBe("private");
    const patched = await handleCreatorRequest(ctx, "PATCH", `/folders/${folder.id}`, {
      visibility: "team",
    });
    expect((patched.body as { folder: Ownership }).folder.visibility).toBe("team");
    expect(
      (await handleCreatorRequest(ctx, "PATCH", `/folders/${folder.id}`, { visibility: "public" }))
        .status,
    ).toBe(400);
  });

  it("reads an existing project without these fields as local and private", async () => {
    const dir = join(ctx.workspace.projectsDir, "ancien");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "index.html"),
      '<div data-composition-id="main" data-width="720" data-height="1280" data-duration="5"></div>',
    );
    writeFileSync(
      join(dir, ".creator.json"),
      JSON.stringify({ schemaVersion: 1, title: "Ancien", fps: 25 }),
    );
    const res = await handleCreatorRequest(ctx, "GET", "/projects", null);
    const project = (res.body as { projects: Array<Ownership & { id: string }> }).projects[0];
    expect(project).toMatchObject({ id: "ancien", owner: LOCAL_OWNER, visibility: "private" });
  });
});
