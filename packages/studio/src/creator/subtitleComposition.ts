import { openComposition } from "@hyperframes/sdk";
import { buildElementHtml, nextTrackIndex, nextZIndex } from "./elementPresets";
import { validateCues, type SubtitleCue } from "./subtitleFormat";
export interface SubtitleStyle {
  color: string;
  background: string;
  size: number;
}
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  color: "#ffffff",
  background: "#101318",
  size: 48,
};
export function readSubtitleCues(html: string): SubtitleCue[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll('[data-creator-caption="true"]')]
    .map((el) => ({
      start: Number(el.getAttribute("data-start")),
      end: Number(el.getAttribute("data-start")) + Number(el.getAttribute("data-duration")),
      text: el.textContent ?? "",
    }))
    .sort((a, b) => a.start - b.start);
}
/** Replaces only this panel's captions, in one undoable source edit. */
export async function applySubtitles(html: string, cues: SubtitleCue[], style: SubtitleStyle) {
  validateCues(cues);
  if (
    !/^#[\da-f]{6}$/i.test(style.color) ||
    !/^#[\da-f]{6}$/i.test(style.background) ||
    !Number.isFinite(style.size) ||
    style.size < 12 ||
    style.size > 200
  )
    throw new Error("Style de légende invalide.");
  const comp = await openComposition(html, { history: false });
  const elements = comp.getElements();
  const root = elements.find((el) => el.attributes["data-composition-id"] !== undefined);
  if (!root) throw new Error("Composition racine introuvable.");
  const existing = elements.filter((el) => el.attributes["data-creator-caption"] === "true");
  const track = existing.length
    ? Number(existing[0]!.attributes["data-track-index"])
    : nextTrackIndex(html);
  const duration = Number(root.attributes["data-duration"]);
  if (cues.some((cue) => cue.end > duration))
    throw new Error(
      `Un segment dépasse la composition (${duration} s). Ajustez sa durée dans les paramètres du projet.`,
    );
  for (const el of existing) comp.dispatch({ type: "removeElement", target: el.id });
  cues.forEach((cue, index) => {
    const fragment = buildElementHtml({
      kind: "caption",
      id: `creator-subtitle-${index + 1}`,
      text: cue.text,
      imageSrc: null,
      start: cue.start,
      duration: cue.end - cue.start,
      trackIndex: track,
      zIndex: nextZIndex(html),
      canvas: {
        width: Number(root.attributes["data-width"]) || 1920,
        height: Number(root.attributes["data-height"]) || 1080,
      },
      color: style.color,
      background: style.background,
    });
    const id = comp.addElement(root.id, root.children.length + index, fragment);
    comp.setAttribute(id, "data-creator-caption", "true");
    comp.setAttribute(id, "data-track-name", "Légendes");
    comp.dispatch({ type: "setStyle", target: id, styles: { "font-size": `${style.size}px` } });
    comp.dispatch({ type: "setStyle", target: id, styles: { "white-space": "pre-wrap" } });
  });
  return comp.serialize();
}
