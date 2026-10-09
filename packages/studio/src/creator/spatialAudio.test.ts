import { describe, it, expect } from "vitest";
import { encodeStereoWav, validateSpatial, DEFAULT_SPATIAL } from "./spatialAudio";
describe("audio binaural", () => {
  it("écrit un WAV PCM stéréo intercalé compatible FFmpeg", () => {
    const data = encodeStereoWav([new Float32Array([-1, 0.5]), new Float32Array([1, -0.5])], 48000);
    const view = new DataView(data);
    expect(new TextDecoder().decode(data.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(16384);
    expect(view.getInt16(50, true)).toBe(-16384);
  });
  it("refuse une trajectoire hors durée, sans origine, ou contenant NaN", () => {
    expect(validateSpatial(DEFAULT_SPATIAL, 2)).toHaveLength(1);
    expect(() =>
      validateSpatial({ ...DEFAULT_SPATIAL, points: [{ time: 1, x: 0, y: 0, z: 0 }] }, 2),
    ).toThrow();
    expect(() =>
      validateSpatial(
        { ...DEFAULT_SPATIAL, points: [...DEFAULT_SPATIAL.points, { time: 3, x: 0, y: 0, z: 0 }] },
        2,
      ),
    ).toThrow();
    expect(() =>
      validateSpatial({ ...DEFAULT_SPATIAL, listener: { x: NaN, y: 0, z: 0 } }, 2),
    ).toThrow();
  });
});
