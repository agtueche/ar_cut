// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";
import {
  DEFAULT_ENHANCE,
  cleanEnhanceOptions,
  enhanceFilterChain,
  enhanceRecording,
  preGainFor,
  listRecordings,
  receiveRecording,
  RECORDINGS_DIR,
  removeRecording,
} from "./sessionRecordings";
import { createWorkspace, type CreatorWorkspace } from "./workspace";

const ffmpeg = findFfBinary("ffmpeg") ?? "ffmpeg";
let home: string;
let workspace: CreatorWorkspace;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "creator-rec-"));
  workspace = createWorkspace(home);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A 2 s "voice" (tone + noise) encoded like the browser does (WebM/Opus). */
function fakeTake(): Buffer {
  const out = join(home, "take.webm");
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=f=220:d=2",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=d=2:c=pink:a=0.04",
    "-filter_complex",
    "[0][1]amix=inputs=2",
    "-c:a",
    "libopus",
    out,
  ]);
  return readFileSync(out);
}

function asRequest(body: Buffer, type: string): IncomingMessage {
  const stream = Readable.from([body]) as unknown as IncomingMessage;
  (stream as { headers: Record<string, string> }).headers = { "content-type": type };
  return stream;
}

describe("Enregistrements", () => {
  it("builds the voice chain in a sensible order, honouring each option", () => {
    const full = enhanceFilterChain(DEFAULT_ENHANCE, "/m/model.rnnn");
    const order = ["highpass", "arnndn", "deesser", "equalizer", "acompressor", "loudnorm"].map(
      (f) => full.indexOf(f),
    );
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    expect(full).toContain("arnndn=m='/m/model.rnnn'");
    expect(full).toContain("loudnorm=I=-16:TP=-1.5");
    const bare = enhanceFilterChain({
      denoise: "off",
      deEss: false,
      voiceEq: false,
      compress: false,
      normalize: false,
      trimSilence: false,
    });
    expect(bare).toBe("highpass=f=80");
    expect(enhanceFilterChain({ ...DEFAULT_ENHANCE, denoise: "light" })).toContain("afftdn");
  });

  it("levels the input before the gate, within safe limits", () => {
    expect(preGainFor(-35)).toBe(15);
    expect(preGainFor(-60)).toBe(30);
    expect(preGainFor(-2)).toBe(-12);
    expect(preGainFor(null)).toBe(0);
    const chain = enhanceFilterChain(DEFAULT_ENHANCE, "/m.rnnn", 12);
    expect(chain.startsWith("volume=12.0dB,highpass")).toBe(true);
    expect(chain.indexOf("agate")).toBeGreaterThan(chain.indexOf("arnndn"));
  });

  it("escapes a model path containing quotes or spaces", () => {
    expect(enhanceFilterChain(DEFAULT_ENHANCE, "/Mon Dossier/l'app/m.rnnn")).toContain(
      "m='/Mon Dossier/l\\'app/m.rnnn'",
    );
  });

  it("falls back to defaults for unknown options", () => {
    expect(cleanEnhanceOptions({ denoise: "max", deEss: "oui" })).toEqual(DEFAULT_ENHANCE);
    expect(cleanEnhanceOptions({ denoise: "strong", compress: false })).toMatchObject({
      denoise: "strong",
      compress: false,
    });
  });

  it("stores a voice take as 48 kHz WAV, enhances it, lists and removes both", async () => {
    const name = await receiveRecording(workspace, "voice", asRequest(fakeTake(), "audio/webm"));
    expect(name).toMatch(/^Voix off .*\.wav$/);
    const enhanced = await enhanceRecording(workspace, name, DEFAULT_ENHANCE);
    expect(enhanced).toMatch(/ \(améliorée\)\.wav$/);
    const probe = execFileSync(findFfBinary("ffprobe") ?? "ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=sample_rate,channels",
      "-of",
      "csv=p=0",
      join(home, RECORDINGS_DIR, enhanced),
    ])
      .toString()
      .trim();
    expect(probe).toBe("48000,1");
    const list = await listRecordings(workspace);
    expect(list.map((i) => [i.enhanced, i.kind]).sort()).toEqual([
      [false, "audio"],
      [true, "audio"],
    ]);
    removeRecording(workspace, enhanced);
    expect(existsSync(join(home, RECORDINGS_DIR, enhanced))).toBe(false);
  }, 60000);

  it("refuses non-media uploads and unsafe paths", async () => {
    await expect(
      receiveRecording(workspace, "voice", asRequest(Buffer.from("x"), "text/plain")),
    ).rejects.toThrow("non pris en charge");
    await expect(enhanceRecording(workspace, "../secret.wav", DEFAULT_ENHANCE)).rejects.toThrow(
      "introuvable",
    );
    expect(() => removeRecording(workspace, "a/b.wav")).toThrow("introuvable");
  });
});
