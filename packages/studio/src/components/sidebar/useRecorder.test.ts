import { describe, expect, it } from "vitest";
import { levelVerdict } from "./useRecorder";

describe("levelVerdict", () => {
  it("tells the speaker what to do with their level", () => {
    expect(levelVerdict({ rms: -100, peak: -100, clips: 0 })).toBe("silent");
    expect(levelVerdict({ rms: -40, peak: -25, clips: 0 })).toBe("low");
    expect(levelVerdict({ rms: -18, peak: -6, clips: 0 })).toBe("good");
    expect(levelVerdict({ rms: -10, peak: -0.2, clips: 3 })).toBe("loud");
  });
});
