// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";
import { handleCreatorRequest, type CreatorContext } from "./router";
import { createWorkspace } from "./workspace";

let home: string;
let ctx: CreatorContext;
let project: string;

const ffmpeg = findFfBinary("ffmpeg");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "creator-asset-actions-"));
  ctx = {
    workspace: createWorkspace(home),
    templatesDir: resolve(__dirname, "../creator-templates"),
    findSystemChrome: () => undefined,
  };
  project = join(ctx.workspace.projectsDir, "mon-projet");
  mkdirSync(join(project, "assets"), { recursive: true });
  writeFileSync(join(project, "assets", "note.txt"), "pas un média");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const call = (path: string, body: unknown) => handleCreatorRequest(ctx, "POST", path, body);

/** A one-second 64×36 clip at 25 fps with a stereo tone. */
function makeRush(name: string, withAudio = true): void {
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x36:r=25:d=1"];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ac", "2");
  args.push("-shortest", "-pix_fmt", "yuv420p", join(project, "assets", name));
  execFileSync(ffmpeg ?? "ffmpeg", args);
}

describe("actions du menu d'un média", () => {
  it("refuses paths that leave the project or do not exist", async () => {
    const outside = await call("/projects/mon-projet/media/details", { path: "../../secret.mp4" });
    expect(outside.status).toBe(400);
    const missing = await call("/projects/mon-projet/media/details", { path: "assets/absent.mp4" });
    expect(missing.status).toBe(404);
    const noProject = await call("/projects/inconnu/media/reveal", { path: "assets/note.txt" });
    expect(noProject.status).toBe(404);
  });

  it.skipIf(!ffmpeg)("reads the real resolution, frame rate and sound of a rush", async () => {
    makeRush("plan.mp4");
    const res = await call("/projects/mon-projet/media/details", { path: "assets/plan.mp4" });
    expect(res.status).toBe(200);
    const { details } = res.body as {
      details: {
        video: { width: number; height: number; fps: number };
        audio: { channels: number };
      };
    };
    expect(details.video).toMatchObject({ width: 64, height: 36, fps: 25 });
    expect(details.audio.channels).toBe(2);
  });

  it.skipIf(!ffmpeg)(
    "extracts the audio next to the assets without touching the rush",
    async () => {
      makeRush("plan.mp4");
      const first = await call("/projects/mon-projet/media/extract-audio", {
        path: "assets/plan.mp4",
      });
      expect(first.status).toBe(201);
      expect((first.body as { path: string }).path).toBe("assets/audio/plan (audio).wav");
      expect(existsSync(join(project, "assets", "audio", "plan (audio).wav"))).toBe(true);
      expect(existsSync(join(project, "assets", "plan.mp4"))).toBe(true);
      // A second extraction never overwrites the first one.
      const second = await call("/projects/mon-projet/media/extract-audio", {
        path: "assets/plan.mp4",
      });
      expect((second.body as { path: string }).path).toBe("assets/audio/plan (audio) (2).wav");
    },
  );

  it.skipIf(!ffmpeg)("says so when a video has no sound", async () => {
    makeRush("muet.mp4", false);
    const res = await call("/projects/mon-projet/media/extract-audio", { path: "assets/muet.mp4" });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("pas de piste audio");
  });
});
