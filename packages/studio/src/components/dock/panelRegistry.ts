import type { Direction } from "dockview-react";

export const PANEL_IDS = [
  "library",
  "source",
  "preview",
  "timeline",
  "compositions",
  "assets",
  "text",
  "markers",
  "subtitles",
  "sound",
  "credits",
  "code",
  "catalog",
  "design",
  "layers",
  "renders",
  "variables",
  "slideshow",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];
export type PanelZone = "left" | "center" | "right";

export interface PanelDefinition {
  title: string;
  zone: PanelZone;
  /** Where Window > <panel> puts it when it has no saved place: next to `near`. */
  reopen: { near: PanelId; direction: Direction };
  /** Content stays mounted while its tab is hidden (the preview iframe must not reload). */
  keepMounted?: true;
}

export const PANEL_DEFINITIONS = {
  source: {
    title: "Source",
    zone: "center",
    reopen: { near: "preview", direction: "left" },
    keepMounted: true,
  },
  library: {
    title: "Bibliothèque",
    zone: "left",
    reopen: { near: "preview", direction: "left" },
    keepMounted: true,
  },
  preview: {
    title: "Aperçu",
    zone: "center",
    reopen: { near: "timeline", direction: "above" },
    keepMounted: true,
  },
  timeline: {
    title: "Timeline",
    zone: "center",
    reopen: { near: "preview", direction: "below" },
    keepMounted: true,
  },
  compositions: {
    title: "Compositions",
    zone: "left",
    reopen: { near: "preview", direction: "left" },
  },
  assets: {
    title: "Multimédia",
    zone: "left",
    reopen: { near: "compositions", direction: "within" },
  },
  text: { title: "Texte", zone: "left", reopen: { near: "assets", direction: "within" } },
  markers: { title: "Marqueurs", zone: "left", reopen: { near: "assets", direction: "within" } },
  subtitles: { title: "Légendes", zone: "left", reopen: { near: "text", direction: "within" } },
  sound: { title: "Son", zone: "left", reopen: { near: "assets", direction: "within" } },
  credits: {
    title: "Crédits et licences",
    zone: "left",
    reopen: { near: "assets", direction: "within" },
  },
  code: { title: "Code", zone: "left", reopen: { near: "compositions", direction: "within" } },
  catalog: {
    title: "Catalogue",
    zone: "left",
    reopen: { near: "compositions", direction: "within" },
  },
  design: { title: "Propriétés", zone: "right", reopen: { near: "preview", direction: "right" } },
  layers: { title: "Calques", zone: "right", reopen: { near: "design", direction: "within" } },
  renders: { title: "Exports", zone: "right", reopen: { near: "design", direction: "within" } },
  variables: { title: "Variables", zone: "right", reopen: { near: "design", direction: "within" } },
  slideshow: { title: "Slideshow", zone: "right", reopen: { near: "design", direction: "within" } },
} as const satisfies Record<PanelId, PanelDefinition>;

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && (PANEL_IDS as readonly string[]).includes(value);
}

export function panelsInZone(zone: PanelZone): PanelId[] {
  return PANEL_IDS.filter((id) => PANEL_DEFINITIONS[id].zone === zone);
}

export const LEGACY_PANEL_IDS = PANEL_IDS.filter(
  (id) => !["source", "library", "markers", "subtitles", "sound", "credits"].includes(id),
);
