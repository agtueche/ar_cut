// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyInsert, relativeToComposition, type InsertRequest } from "./insertElement";
import { buildAnimationTweens, nextElementId, nextTrackIndex, nextZIndex } from "./elementPresets";

const TEMPLATE = readFileSync(
  resolve(__dirname, "../../creator-templates/publicite-produit/index.html"),
  "utf-8",
);

const titleRequest: InsertRequest = {
  kind: "title",
  text: "Bonjour <monde>",
  imageSrc: null,
  start: 1,
  duration: 4,
  color: "#F4F7F6",
  background: "#00A896",
  animation: { preset: "slide", duration: 0.8, delay: 0.2, ease: "power3.out" },
  label: "Ajouter un titre",
};

describe("insertion d'un élément via le SDK", () => {
  it("ajoute un clip au premier niveau avec le contrat data-* et un tween seekable", async () => {
    const { html, elementId, skippedTweens } = await applyInsert(TEMPLATE, titleRequest);
    expect(elementId).toBe("title-1");
    expect(skippedTweens).toBe(0);
    expect(html).toMatch(
      /<h1[^>]*id="title-1"[^>]*class="clip"[^>]*data-start="1"[^>]*data-duration="4"/,
    );
    expect(html).toContain("Bonjour &lt;monde&gt;");
    expect(html).toContain('data-track-index="12"');
    expect(html).toMatch(
      /tl\.fromTo\([^)]*\{ opacity: 0, y: 60 \}, \{ opacity: 1, y: 0, duration: 0\.8, ease: "power3\.out" \}, 1\.2\)/,
    );
    // The tween lands before the timeline is registered, on the same timeline.
    expect(html.indexOf("opacity: 0, y: 60")).toBeLessThan(
      html.indexOf('window.__timelines["main"] = tl'),
    );
  });

  it("préserve les éléments et animations existants", async () => {
    const { html } = await applyInsert(TEMPLATE, titleRequest);
    for (const id of ["headline", "cta-button", "feature-3"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('tl.fromTo("#cta-title"');
    expect(html.match(/gsap\.timeline\(/g)).toHaveLength(1);
  });

  it("insère une forme sans texte et compte les ids existants", async () => {
    const first = await applyInsert(TEMPLATE, {
      ...titleRequest,
      kind: "circle",
      animation: { ...titleRequest.animation, preset: "scale" },
    });
    const second = await applyInsert(first.html, {
      ...titleRequest,
      kind: "circle",
      animation: { ...titleRequest.animation, preset: "none" },
    });
    expect(first.elementId).toBe("circle-1");
    expect(second.elementId).toBe("circle-2");
    expect(second.html).toMatch(/id="circle-2"[^>]*border-radius: 50%/);
  });

  it("refuse un fichier sans composition racine", async () => {
    await expect(
      applyInsert("<html><body><p>rien</p></body></html>", titleRequest),
    ).rejects.toThrow("composition racine");
  });
});

describe("préréglages d'animation", () => {
  it("machine à écrire : un palier par caractère", () => {
    const [tween] = buildAnimationTweens(
      { preset: "typewriter", duration: 2, delay: 0, ease: "none" },
      { start: 3, duration: 5, textLength: 14 },
    );
    expect(tween).toMatchObject({ ease: "steps(14)", position: 3, duration: 2 });
  });

  it("la durée d'entrée ne dépasse jamais celle du clip", () => {
    const [tween] = buildAnimationTweens(
      { preset: "fade", duration: 10, delay: 0, ease: "none" },
      { start: 0, duration: 1.5, textLength: 0 },
    );
    expect(tween?.duration).toBe(1.5);
  });

  it("place un nouvel élément au-dessus des calques existants", async () => {
    const withLayers = TEMPLATE.replace('id="headline"', 'id="headline" style="z-index: 7"');
    const { html } = await applyInsert(withLayers, titleRequest);
    expect(html).toMatch(/id="title-1"[^>]*z-index: 8/);
    expect(nextZIndex("<div></div>")).toBe(1);
  });

  it("calcule le prochain id et la prochaine piste", () => {
    expect(nextElementId("title", '<h1 id="title-1"></h1><h1 id="title-2"></h1>')).toBe("title-3");
    expect(nextTrackIndex('<i data-track-index="3"></i><i data-track-index="7"></i>')).toBe(8);
    expect(nextTrackIndex("<div></div>")).toBe(0);
  });
});

describe("fonds", () => {
  it("insère un dégradé plein cadre en premier, derrière tous les calques", async () => {
    const { html, elementId } = await applyInsert(TEMPLATE, {
      ...titleRequest,
      kind: "gradient",
      background: "#00A896",
      background2: "#FF6B35",
      animation: { preset: "none", duration: 0.5, delay: 0, ease: "none" },
    });
    expect(elementId).toBe("gradient-1");
    expect(html).toMatch(
      /id="gradient-1"[^>]*z-index: 0[^>]*width: 1920px; height: 1080px[^>]*linear-gradient\(135deg, #00A896, #FF6B35\)/,
    );
    expect(html.indexOf('id="gradient-1"')).toBeLessThan(html.indexOf('id="bg-glow"'));
  });
});

describe("chemins d'image", () => {
  it("rend le chemin relatif à la composition qui reçoit l'image", () => {
    expect(relativeToComposition("index.html", "logo.png")).toBe("logo.png");
    expect(relativeToComposition("index.html", "assets/logo.png")).toBe("assets/logo.png");
    expect(relativeToComposition("compositions/scene.html", "logo.png")).toBe("../logo.png");
    expect(relativeToComposition("compositions/scene.html", "compositions/assets/a.png")).toBe(
      "assets/a.png",
    );
  });
});
