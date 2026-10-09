// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCompositionSettings,
  isValidSettings,
  readCompositionSettings,
} from "./projectSettings";

const TEMPLATE = readFileSync(
  resolve(__dirname, "../../creator-templates/publicite-produit/index.html"),
  "utf-8",
);

describe("paramètres du projet", () => {
  it("lit le format et la durée de la composition racine", () => {
    expect(readCompositionSettings(TEMPLATE)).toEqual({ width: 1920, height: 1080, duration: 15 });
  });

  it("passe en 9:16 sans laisser l'ancien cadre dans le viewport ni dans html, body", async () => {
    const out = await applyCompositionSettings(TEMPLATE, {
      width: 1080,
      height: 1920,
      duration: 20,
    });
    expect(readCompositionSettings(out)).toEqual({ width: 1080, height: 1920, duration: 20 });
    expect(out).toMatch(/<meta name="viewport" content="width=1080, height=1920"/);
    const rule = /html\s*,\s*body\s*\{([^}]*)\}/.exec(out)?.[1] ?? "";
    expect(rule).toContain("width: 1080px");
    expect(rule).toContain("height: 1920px");
    // The elements and animations stay untouched.
    expect(out).toContain('id="cta-button"');
    expect(out).toContain('tl.fromTo("#cta-title"');
  });

  it("refuse des valeurs hors limites", () => {
    expect(isValidSettings({ width: 1081, height: 1920, duration: 10 })).toBe(false);
    expect(isValidSettings({ width: 1080, height: 1920, duration: 0 })).toBe(false);
    expect(isValidSettings({ width: 1280, height: 720, duration: 30 })).toBe(true);
  });
});
