import { describe, expect, it } from "vitest";
import { clipsOnTrack, makeRoomForSection, setAttr, withMediaStart } from "./sourceSectionEdit";
import {
  effectiveRange,
  formatTimecode,
  markPoint,
  nextShuttleRate,
  snapToFrame,
} from "./sourceTimecode";

const page = (clips: string) =>
  `<div id="root" data-composition-id="main" data-start="0" data-duration="20" data-width="720" data-height="1280">\n${clips}\n</div>`;

const vid = (id: string, start: number, duration: number, extra = "") =>
  `<video id="${id}" class="clip" src="a.mp4" data-start="${start}" data-duration="${duration}" data-track-index="0" muted${extra}></video>`;

const attrOf = (src: string, id: string, name: string) =>
  new RegExp(`id="${id}"[^>]*\\s${name}="([^"]*)"`).exec(src)?.[1];

describe("timecode du moniteur source", () => {
  it("formats HH:MM:SS:FF", () => {
    expect(formatTimecode(0, 25)).toBe("00:00:00:00");
    expect(formatTimecode(61.52, 25)).toBe("00:01:01:13");
    expect(formatTimecode(3600 + 0.04, 24)).toBe("01:00:00:01");
  });

  it("snaps to frames", () => {
    expect(snapToFrame(1.031, 25)).toBe(1.04);
  });

  it("uses the whole media without points and drops a crossing point", () => {
    expect(effectiveRange({ in: null, out: null }, 10)).toEqual({ start: 0, end: 10 });
    expect(effectiveRange({ in: 2, out: 5 }, 10)).toEqual({ start: 2, end: 5 });
    expect(markPoint({ in: 2, out: 5 }, "in", 6)).toEqual({ in: 6, out: null });
    expect(markPoint({ in: 4, out: null }, "out", 3)).toEqual({ in: null, out: 3 });
  });

  it("shuttles with J K L", () => {
    expect(nextShuttleRate(0, "l")).toBe(1);
    expect(nextShuttleRate(1, "l")).toBe(2);
    expect(nextShuttleRate(8, "l")).toBe(8);
    expect(nextShuttleRate(2, "j")).toBe(-1);
    expect(nextShuttleRate(-1, "j")).toBe(-2);
    expect(nextShuttleRate(4, "k")).toBe(0);
  });
});

describe("insertion et écrasement depuis le moniteur source", () => {
  it("lists media clips of a track and skips the root composition", () => {
    const src = page(`${vid("a", 0, 4)}\n${vid("b", 4, 4)}`);
    expect(clipsOnTrack(src, 0).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("insert pushes later clips and cuts the clip under the playhead", () => {
    const src = page(`${vid("a", 0, 4, ' data-media-start="1"')}\n${vid("b", 4, 4)}`);
    const { source, touched } = makeRoomForSection(src, {
      start: 2,
      duration: 3,
      track: 0,
      mode: "insert",
      takenIds: new Set(["a", "b"]),
    });
    expect(touched).toBe(2);
    expect(attrOf(source, "a", "data-duration")).toBe("2");
    expect(attrOf(source, "a-2", "data-start")).toBe("5");
    expect(attrOf(source, "a-2", "data-duration")).toBe("2");
    expect(attrOf(source, "a-2", "data-media-start")).toBe("3");
    expect(attrOf(source, "b", "data-start")).toBe("7");
  });

  it("insert keeps every track in sync and leaves an uncuttable text of another track in place", () => {
    const voice = (id: string, start: number, duration: number) =>
      `<audio id="${id}" class="clip" src="v.wav" data-start="${start}" data-duration="${duration}" data-track-index="2"></audio>`;
    const sub =
      '<div id="st" class="clip" data-start="1" data-duration="3" data-track-index="1">Bonjour</div>';
    const src = page(`${vid("a", 0, 4)}\n${voice("p1", 1, 2)}\n${voice("p2", 5, 2)}\n${sub}`);
    const { source, keptInPlace } = makeRoomForSection(src, {
      start: 2,
      duration: 3,
      track: 0,
      mode: "insert",
      takenIds: new Set(["a", "p1", "p2", "st"]),
    });
    expect(attrOf(source, "p1", "data-duration")).toBe("1");
    expect(attrOf(source, "p1-2", "data-start")).toBe("5");
    expect(attrOf(source, "p2", "data-start")).toBe("8");
    expect(attrOf(source, "st", "data-start")).toBe("1");
    expect(keptInPlace).toEqual(["st"]);
  });

  it("overwrite removes, trims and cuts what the section covers", () => {
    const src = page(
      `${vid("a", 0, 3)}\n${vid("b", 3, 2)}\n${vid("c", 5, 4)}\n${vid("long", 0, 0.001)}`,
    );
    const { source } = makeRoomForSection(src, {
      start: 2,
      duration: 4,
      track: 0,
      mode: "overwrite",
      takenIds: new Set(["a", "b", "c"]),
    });
    expect(attrOf(source, "a", "data-duration")).toBe("2");
    expect(source).not.toContain('id="b"');
    expect(attrOf(source, "c", "data-start")).toBe("6");
    expect(attrOf(source, "c", "data-duration")).toBe("3");
    expect(attrOf(source, "c", "data-media-start")).toBe("1");
  });

  it("overwrite cuts a clip spanning the whole section in two", () => {
    const src = page(vid("a", 0, 10, ' data-playback-rate="2"'));
    const { source } = makeRoomForSection(src, {
      start: 2,
      duration: 3,
      track: 0,
      mode: "overwrite",
      takenIds: new Set(["a"]),
    });
    expect(attrOf(source, "a", "data-duration")).toBe("2");
    expect(attrOf(source, "a-2", "data-start")).toBe("5");
    expect(attrOf(source, "a-2", "data-duration")).toBe("5");
    expect(attrOf(source, "a-2", "data-media-start")).toBe("10");
  });

  it("refuses to cut a text in the way instead of damaging it", () => {
    const src = page(
      '<div id="titre" class="clip" data-start="0" data-duration="6" data-track-index="0">Titre</div>',
    );
    expect(() =>
      makeRoomForSection(src, {
        start: 2,
        duration: 1,
        track: 0,
        mode: "insert",
        takenIds: new Set(),
      }),
    ).toThrow("titre");
  });

  it("adds attributes to a tag", () => {
    expect(setAttr('<img id="x" src="a.png" />', "data-media-start", "2")).toBe(
      '<img id="x" src="a.png" data-media-start="2"/>',
    );
    expect(withMediaStart(vid("v", 0, 1), 1.5)).toContain('data-media-start="1.5"');
    expect(withMediaStart(vid("v", 0, 1), 0)).not.toContain("data-media-start");
  });
});

describe("section glissée depuis le moniteur", () => {
  it("is handed once to the drop of the same media, never to another one", async () => {
    const { setDraggedSection, takeDraggedSection } = await import("./draggedSection");
    setDraggedSection({ path: "assets/a.mp4", mediaStart: 1, duration: 2, streams: "video" });
    expect(takeDraggedSection("assets/b.mp4")).toBeNull();
    expect(takeDraggedSection("assets/a.mp4")).toEqual({
      path: "assets/a.mp4",
      mediaStart: 1,
      duration: 2,
      streams: "video",
    });
    expect(takeDraggedSection("assets/a.mp4")).toBeNull();
  });
});
