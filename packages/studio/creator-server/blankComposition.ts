// The "Composition vide" starting point. Same structure as the CLI's bundled
// `blank` template (packages/cli/src/templates/blank): a root with the
// data-* timing contract and one paused GSAP timeline on window.__timelines.

import { COMPOSITION_PALETTE } from "./palette";

export interface BlankCompositionOptions {
  title: string;
  width: number;
  height: number;
  duration: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function blankCompositionHtml({
  title,
  width,
  height,
  duration,
}: BlankCompositionOptions): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeHtml(title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: ${COMPOSITION_PALETTE.background};
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${width}"
      data-height="${height}"
    ></div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
