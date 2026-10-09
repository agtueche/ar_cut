// "Paramètres du projet": canvas size and duration of the root composition.
// The SDK's setCompositionMetadata updates the root's data-* and inline size;
// a standalone index.html also pins the viewport <meta> and the html/body size
// in its stylesheet, which the SDK leaves alone — left stale, a 16:9 → 9:16
// switch would clip the frame at the old height. Both are rewritten here, only
// where they still hold the old canvas size.

import { openComposition } from "@hyperframes/sdk";
import type { StudioBridge } from "./studioBridge";

export interface CompositionSettings {
  width: number;
  height: number;
  duration: number;
}

export function readCompositionSettings(html: string): CompositionSettings | null {
  const root = /<[a-z][a-z0-9-]*\b[^>]*\bdata-composition-id\s*=\s*["'][^"']*["'][^>]*>/i.exec(
    html,
  )?.[0];
  if (!root) return null;
  const num = (name: string) =>
    Number(new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)["']`, "i").exec(root)?.[1]);
  const width = num("data-width");
  const height = num("data-height");
  const duration = num("data-duration");
  if (!width || !height) return null;
  return { width, height, duration: Number.isFinite(duration) ? duration : 0 };
}

export function isValidSettings({ width, height, duration }: CompositionSettings): boolean {
  const side = (value: number) =>
    Number.isInteger(value) && value >= 64 && value <= 7680 && value % 2 === 0;
  return side(width) && side(height) && duration >= 0.5 && duration <= 3600;
}

/** Rewrites `width: <old>px` / `height: <old>px` inside the `html, body` rule only. */
function resizeDocumentRule(
  html: string,
  from: CompositionSettings,
  to: CompositionSettings,
): string {
  return html.replace(
    /((?:html\s*,\s*body|body\s*,\s*html)\s*\{)([^}]*)(\})/gi,
    (_match, open: string, body: string, close: string) => {
      const next = body
        .replace(new RegExp(`(\\bwidth\\s*:\\s*)${from.width}px`), `$1${to.width}px`)
        .replace(new RegExp(`(\\bheight\\s*:\\s*)${from.height}px`), `$1${to.height}px`);
      return `${open}${next}${close}`;
    },
  );
}

export async function applyCompositionSettings(
  html: string,
  next: CompositionSettings,
): Promise<string> {
  const previous = readCompositionSettings(html);
  if (!previous) throw new Error("Aucune composition racine dans ce fichier.");
  const comp = await openComposition(html, { history: false });
  comp.dispatch({
    type: "setCompositionMetadata",
    width: next.width,
    height: next.height,
    duration: next.duration,
  });
  let out = comp.serialize();
  out = out.replace(
    /(<meta\s+name=["']viewport["']\s+content=["']width=)\d+(,\s*height=)\d+/i,
    `$1${next.width}$2${next.height}`,
  );
  return resizeDocumentRule(out, previous, next);
}

/** Through Studio's writer and history, like every other edit: undoable, version-checked. */
export async function saveCompositionSettings(
  bridge: StudioBridge,
  next: CompositionSettings,
): Promise<void> {
  if (bridge.writeBlockedReason) throw new Error(bridge.writeBlockedReason);
  const path = "index.html";
  await bridge.waitForPendingSaves();
  const before = await bridge.readProjectFile(path);
  const after = await applyCompositionSettings(before, next);
  if (after === before) return;
  await bridge.writeProjectFile(path, after, before);
  await bridge.recordEdit({ label: "Paramètres du projet", files: { [path]: { before, after } } });
  bridge.reloadSdkSession();
  bridge.reloadPreview();
}
