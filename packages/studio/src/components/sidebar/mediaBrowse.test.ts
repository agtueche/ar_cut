import { describe, expect, it } from "vitest";
import type { MediaInfo } from "../../creator/creatorApi";
import { sortAssets } from "./mediaBrowse";

const info = new Map<string, MediaInfo>(
  (
    [
      ["assets/b.mp4", 300, 100, 12],
      ["assets/a.wav", 100, 300, 3],
      ["assets/c.png", 200, 200, null],
    ] as const
  ).map(([path, importedAt, createdAt, duration]) => [
    path,
    { path, size: 1, importedAt, createdAt, duration },
  ]),
);
const files = ["assets/b.mp4", "assets/a.wav", "assets/c.png", "assets/inconnu.mp3"];

describe("sortAssets", () => {
  it("sorts by import time both ways, unknown dates last", () => {
    expect(sortAssets(files, info, "imported", "asc")).toEqual([
      "assets/a.wav",
      "assets/c.png",
      "assets/b.mp4",
      "assets/inconnu.mp3",
    ]);
    expect(sortAssets(files, info, "imported", "desc")[0]).toBe("assets/b.mp4");
    expect(sortAssets(files, info, "imported", "desc").at(-1)).toBe("assets/inconnu.mp3");
  });

  it("sorts by creation time, name, type and duration", () => {
    expect(sortAssets(files, info, "created", "asc")[0]).toBe("assets/b.mp4");
    expect(sortAssets(files, info, "name", "asc")).toEqual([
      "assets/a.wav",
      "assets/b.mp4",
      "assets/c.png",
      "assets/inconnu.mp3",
    ]);
    expect(sortAssets(files, info, "type", "asc")[0]).toBe("assets/b.mp4");
    expect(sortAssets(files, info, "duration", "desc").slice(0, 2)).toEqual([
      "assets/b.mp4",
      "assets/a.wav",
    ]);
  });

  it("does not mutate its input", () => {
    const copy = [...files];
    sortAssets(files, info, "name", "desc");
    expect(files).toEqual(copy);
  });
});
