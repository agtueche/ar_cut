// Inserts a Creator element into the active composition through the SDK:
// addElement under the composition root, then one addGsapTween per animation
// step on the composition's own timeline. The result is written with Studio's
// version-checked writer, recorded in Studio's history (so Cmd+Z removes it)
// and the preview + SDK session reload.

import { openComposition, type EditOp } from "@hyperframes/sdk";
import {
  buildAnimationTweens,
  buildElementHtml,
  nextElementId,
  nextTrackIndex,
  nextZIndex,
  type AnimationSpec,
  isBackgroundKind,
  type ElementKind,
} from "./elementPresets";
import type { StudioBridge } from "./studioBridge";

export interface InsertRequest {
  kind: ElementKind;
  text: string;
  imageSrc: string | null;
  start: number;
  duration: number;
  color: string;
  background: string;
  background2?: string;
  animation: AnimationSpec;
  label: string;
}

export class InsertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsertError";
  }
}

/** Pure part, testable without Studio: the file's new contents and the new element id. */
export async function applyInsert(
  html: string,
  request: InsertRequest,
): Promise<{ html: string; elementId: string; skippedTweens: number }> {
  const comp = await openComposition(html, { history: false });
  const root = comp
    .getElements()
    .find((element) => element.attributes["data-composition-id"] !== undefined);
  if (!root)
    throw new InsertError("Aucune composition racine (data-composition-id) dans ce fichier.");
  const width = Number(root.attributes["data-width"]) || 1920;
  const height = Number(root.attributes["data-height"]) || 1080;

  const elementId = nextElementId(request.kind, html);
  const fragment = buildElementHtml({
    kind: request.kind,
    id: elementId,
    text: request.text,
    imageSrc: request.imageSrc,
    start: request.start,
    duration: request.duration,
    trackIndex: nextTrackIndex(html),
    // A background sits under every layer; anything else lands on top.
    zIndex: isBackgroundKind(request.kind) ? 0 : nextZIndex(html),
    canvas: { width, height },
    color: request.color,
    background: request.background,
    background2: request.background2,
  });
  const index = isBackgroundKind(request.kind) ? 0 : root.children.length;
  const hfId = comp.addElement(root.id, index, fragment);

  let skippedTweens = 0;
  const tweens = buildAnimationTweens(request.animation, {
    start: request.start,
    duration: request.duration,
    textLength: request.text.length,
  });
  for (const tween of tweens) {
    const op: EditOp = { type: "addGsapTween", target: hfId, tween };
    const check = comp.can(op);
    if (!check.ok) {
      skippedTweens += 1;
      continue;
    }
    comp.dispatch(op);
  }
  return { html: comp.serialize(), elementId, skippedTweens };
}

/** `assets/logo.png` seen from `compositions/scene.html` is `../assets/logo.png`. */
export function relativeToComposition(compositionPath: string, projectPath: string): string {
  const from = compositionPath.split("/").slice(0, -1);
  const to = projectPath.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

export async function insertElement(
  bridge: StudioBridge,
  request: InsertRequest,
): Promise<{ elementId: string; skippedTweens: number }> {
  if (bridge.writeBlockedReason) throw new InsertError(bridge.writeBlockedReason);
  const path = bridge.activeCompPath ?? "index.html";
  await bridge.waitForPendingSaves();
  const before = await bridge.readProjectFile(path);
  const imageSrc = request.imageSrc ? relativeToComposition(path, request.imageSrc) : null;
  const {
    html: after,
    elementId,
    skippedTweens,
  } = await applyInsert(before, { ...request, imageSrc });
  await bridge.writeProjectFile(path, after, before);
  await bridge.recordEdit({ label: request.label, files: { [path]: { before, after } } });
  bridge.reloadSdkSession();
  bridge.reloadPreview();
  return { elementId, skippedTweens };
}
