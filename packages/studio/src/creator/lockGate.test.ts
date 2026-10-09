import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player/store/timelineElement";
import { allowingLockedTrackEdit, lockedClipGate } from "./lockGate";

const clip = (locked: boolean) =>
  ({
    id: "a",
    track: 0,
    start: 0,
    duration: 1,
    tag: "div",
    timelineLocked: locked,
  }) as TimelineElement;

describe("lockedClipGate", () => {
  it("lets unlocked clips through", () => {
    expect(lockedClipGate(clip(false))).toBe(true);
  });

  it("blocks locked clips with a reason", () => {
    const verdict = lockedClipGate(clip(true));
    expect(verdict).not.toBe(true);
    expect(verdict !== true && verdict.reason.length > 0).toBe(true);
  });

  it("lets track settings write on locked clips, only during the call", async () => {
    let seen: unknown = null;
    await allowingLockedTrackEdit(async () => {
      seen = lockedClipGate(clip(true));
    });
    expect(seen).toBe(true);
    expect(lockedClipGate(clip(true))).not.toBe(true);
  });

  it("restores the gate when the write throws synchronously", async () => {
    await expect(
      allowingLockedTrackEdit(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(lockedClipGate(clip(true))).not.toBe(true);
  });
});
