// Ready-made elements and animations for the "Ajouter" panel. Pure functions:
// they produce the HTML fragment and the GSAP tween specs that
// insertElement.ts hands to the SDK (addElement + addGsapTween), so the
// composition file stays the single source of truth and every animation is a
// seekable tween on the composition's own paused timeline.

import type { GsapTweenSpec } from "@hyperframes/sdk";

export type ElementKind =
  | "title"
  | "paragraph"
  | "caption"
  | "rectangle"
  | "circle"
  | "image"
  | "solid"
  | "gradient";

/** Full-frame backgrounds: inserted first in the root and painted behind everything. */
export function isBackgroundKind(kind: ElementKind): boolean {
  return kind === "solid" || kind === "gradient";
}

export type AnimationPreset =
  | "none"
  | "fade"
  | "slide"
  | "scale"
  | "reveal"
  | "typewriter"
  | "highlight"
  | "float";

export const ANIMATION_PRESETS: AnimationPreset[] = [
  "none",
  "fade",
  "slide",
  "scale",
  "reveal",
  "typewriter",
  "highlight",
  "float",
];

export const EASES = [
  "power2.out",
  "power3.out",
  "expo.out",
  "back.out(1.6)",
  "sine.inOut",
  "none",
];

export interface ElementSpec {
  kind: ElementKind;
  id: string;
  text: string;
  imageSrc: string | null;
  start: number;
  duration: number;
  trackIndex: number;
  /** Stacking order: above every layer already in the file (tracks are time lanes, not layers). */
  zIndex: number;
  canvas: { width: number; height: number };
  color: string;
  background: string;
  /** Second gradient stop (gradient backgrounds only). */
  background2?: string;
}

export interface AnimationSpec {
  preset: AnimationPreset;
  /** Seconds the entrance takes. */
  duration: number;
  /** Seconds after the clip starts. */
  delay: number;
  ease: string;
}

const TEXT_KINDS = new Set<ElementKind>(["title", "paragraph", "caption"]);

export function isTextKind(kind: ElementKind): boolean {
  return TEXT_KINDS.has(kind);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Box and type sizes scale with the canvas so a 9:16 title fits as well as a 16:9 one. */
function layout(kind: ElementKind, canvas: { width: number; height: number }) {
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h) / 1080;
  const margin = Math.round(w * 0.08);
  switch (kind) {
    case "title":
      return {
        left: margin,
        top: Math.round(h * 0.38),
        width: w - margin * 2,
        height: null,
        fontSize: Math.round(110 * unit),
      };
    case "paragraph":
      return {
        left: margin,
        top: Math.round(h * 0.55),
        width: Math.round((w - margin * 2) * 0.8),
        height: null,
        fontSize: Math.round(40 * unit),
      };
    case "caption":
      return {
        left: margin,
        top: Math.round(h * 0.82),
        width: w - margin * 2,
        height: null,
        fontSize: Math.round(48 * unit),
      };
    case "rectangle":
      return {
        left: Math.round(w * 0.3),
        top: Math.round(h * 0.3),
        width: Math.round(w * 0.4),
        height: Math.round(h * 0.4),
        fontSize: 0,
      };
    case "circle": {
      const size = Math.round(Math.min(w, h) * 0.4);
      return {
        left: Math.round((w - size) / 2),
        top: Math.round((h - size) / 2),
        width: size,
        height: size,
        fontSize: 0,
      };
    }
    case "image":
      return {
        left: Math.round(w * 0.35),
        top: Math.round(h * 0.3),
        width: Math.round(w * 0.3),
        height: Math.round(h * 0.4),
        fontSize: 0,
      };
    case "solid":
    case "gradient":
      return { left: 0, top: 0, width: w, height: h, fontSize: 0 };
  }
}

const TAGS: Record<ElementKind, string> = {
  title: "h1",
  paragraph: "p",
  caption: "div",
  rectangle: "div",
  circle: "div",
  image: "img",
  solid: "div",
  gradient: "div",
};

/** One top-level clip, absolutely positioned, with the data-* timing contract. */
export function buildElementHtml(spec: ElementSpec): string {
  const box = layout(spec.kind, spec.canvas);
  const style: string[] = [
    "position: absolute",
    `z-index: ${spec.zIndex}`,
    `left: ${box.left}px`,
    `top: ${box.top}px`,
    `width: ${box.width}px`,
  ];
  if (box.height !== null) style.push(`height: ${box.height}px`);
  if (spec.kind === "title") {
    style.push(
      `font-size: ${box.fontSize}px`,
      "font-weight: 800",
      "line-height: 1.05",
      `color: ${spec.color}`,
    );
  } else if (spec.kind === "paragraph") {
    style.push(`font-size: ${box.fontSize}px`, "line-height: 1.4", `color: ${spec.color}`);
  } else if (spec.kind === "caption") {
    style.push(
      `font-size: ${box.fontSize}px`,
      "font-weight: 700",
      "text-align: center",
      "padding: 12px 24px",
      "border-radius: 12px",
      `color: ${spec.color}`,
      `background: ${spec.background}`,
    );
  } else if (spec.kind === "rectangle") {
    style.push("border-radius: 24px", `background: ${spec.background}`);
  } else if (spec.kind === "circle") {
    style.push("border-radius: 50%", `background: ${spec.background}`);
  } else if (spec.kind === "solid") {
    style.push(`background: ${spec.background}`);
  } else if (spec.kind === "gradient") {
    style.push(
      `background: linear-gradient(135deg, ${spec.background}, ${spec.background2 ?? spec.background})`,
    );
  } else {
    style.push("object-fit: contain");
  }
  if (isTextKind(spec.kind)) style.push("font-family: ui-sans-serif, system-ui, sans-serif");

  const tag = TAGS[spec.kind];
  const attrs = [
    `id="${spec.id}"`,
    'class="clip"',
    `data-start="${round(spec.start)}"`,
    `data-duration="${round(spec.duration)}"`,
    `data-track-index="${spec.trackIndex}"`,
    `style="${style.join("; ")}"`,
  ];
  if (spec.kind === "image") {
    return `<img ${attrs.join(" ")} src="${escapeHtml(spec.imageSrc ?? "")}" alt="" />`;
  }
  const content = isTextKind(spec.kind) ? escapeHtml(spec.text) : "";
  return `<${tag} ${attrs.join(" ")}>${content}</${tag}>`;
}

/**
 * The tweens for a preset, at absolute timeline positions. Every tween is a
 * fromTo (or a finite repeat), so seeking to any frame lands on the same pixels.
 */
export function buildAnimationTweens(
  animation: AnimationSpec,
  clip: { start: number; duration: number; textLength: number },
): GsapTweenSpec[] {
  const at = round(clip.start + Math.max(0, animation.delay));
  const duration = round(Math.max(0.05, Math.min(animation.duration, clip.duration)));
  const ease = animation.ease;
  switch (animation.preset) {
    case "none":
      return [];
    case "fade":
      return [
        {
          method: "fromTo",
          position: at,
          duration,
          ease,
          fromProperties: { opacity: 0 },
          toProperties: { opacity: 1 },
        },
      ];
    case "slide":
      return [
        {
          method: "fromTo",
          position: at,
          duration,
          ease,
          fromProperties: { opacity: 0, y: 60 },
          toProperties: { opacity: 1, y: 0 },
        },
      ];
    case "scale":
      return [
        {
          method: "fromTo",
          position: at,
          duration,
          ease,
          fromProperties: { opacity: 0, scale: 0.6 },
          toProperties: { opacity: 1, scale: 1 },
        },
      ];
    case "reveal":
      return [
        {
          method: "fromTo",
          position: at,
          duration,
          ease,
          fromProperties: { clipPath: "inset(0 100% 0 0)" },
          toProperties: { clipPath: "inset(0 0% 0 0)" },
        },
      ];
    case "typewriter":
      return [
        {
          method: "fromTo",
          position: at,
          duration,
          ease: `steps(${Math.max(1, Math.min(120, clip.textLength))})`,
          fromProperties: { clipPath: "inset(0 100% 0 0)" },
          toProperties: { clipPath: "inset(0 0% 0 0)" },
        },
      ];
    case "highlight":
      return [
        {
          method: "fromTo",
          position: at,
          duration: round(duration / 2),
          ease: "sine.inOut",
          fromProperties: { scale: 1 },
          toProperties: { scale: 1.08 },
          repeat: 1,
          yoyo: true,
        },
      ];
    case "float":
      return [
        {
          method: "fromTo",
          position: round(clip.start),
          duration: round(clip.duration),
          ease: "sine.inOut",
          fromProperties: { y: 12 },
          toProperties: { y: -12 },
        },
      ];
  }
}

/** `title-1`, `title-2`… — the first id not already used in the file. */
export function nextElementId(kind: ElementKind, html: string): string {
  for (let n = 1; ; n++) {
    const candidate = `${kind}-${n}`;
    if (!new RegExp(`\\bid\\s*=\\s*["']${candidate}["']`).test(html)) return candidate;
  }
}

/** One lane above the highest `data-track-index` in the file. */
export function nextTrackIndex(html: string): number {
  let max = -1;
  for (const match of html.matchAll(/data-track-index\s*=\s*["'](\d+)["']/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** One above the highest inline or stylesheet `z-index` in the file, so a new element is on top. */
export function nextZIndex(html: string): number {
  let max = 0;
  for (const match of html.matchAll(/z-index\s*:\s*(-?\d+)/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
