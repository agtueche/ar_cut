// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ContextMenu } from "./AssetContextMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

describe("menu contextuel d'un média", () => {
  it("s'affiche au premier plan, hors du panneau qui l'ouvre", () => {
    // A clipping panel, like the media library inside the dock.
    const panel = document.createElement("div");
    panel.id = "panneau";
    panel.style.overflow = "hidden";
    document.body.appendChild(panel);
    root = createRoot(panel);
    act(() => {
      root?.render(
        <ContextMenu x={40} y={40} asset="assets/plan.mp4" onClose={() => {}} onCopy={() => {}} />,
      );
    });
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(panel.contains(menu)).toBe(false);
    expect(menu?.closest(".fixed")?.parentElement).toBe(document.body);
  });
});
