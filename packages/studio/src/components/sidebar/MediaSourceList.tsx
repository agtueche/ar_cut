import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useStudioLabel } from "../../creator/useStudioLabel";

/** Where the media panel lists files from. Sources with view: null are not built yet. */
export type MediaSourceView = "local" | "global" | "library" | "stock" | "recordings";

interface MediaSource {
  id: string;
  en: string;
  fr: string;
  /** The view this source opens, or null while the source is not built yet. */
  view: MediaSourceView | null;
  hintEn?: string;
  hintFr?: string;
}

// Order is the reading order of the rail: the current project first, then the
// user's reusable media, then everything else. The "soon" entries reserve their
// place so the layout does not move when they are switched on.
const SOURCES: readonly MediaSource[] = [
  { id: "project", en: "This project", fr: "Ce projet", view: "local" },
  {
    id: "library",
    en: "My library",
    fr: "Ma bibliothèque",
    view: "library",
    hintEn: "Media reused from one project to another",
    hintFr: "Médias réutilisables d'un projet à l'autre",
  },
  {
    id: "shared",
    en: "Shared",
    fr: "Partagé",
    view: null,
    hintEn: "Folders shared with the whole team",
    hintFr: "Dossiers communs à toute l'équipe",
  },
  { id: "all-projects", en: "All projects", fr: "Tous les projets", view: "global" },
  {
    id: "stock",
    en: "Royalty-free library",
    fr: "Banque libre de droits",
    view: "stock",
    hintEn: "Free videos, images and music",
    hintFr: "Vidéos, images et musiques gratuites",
  },
  {
    id: "recordings",
    en: "Recordings",
    fr: "Enregistrements",
    view: "recordings",
    hintEn: "Voice-over, webcam and screen capture",
    hintFr: "Voix off, webcam et capture d'écran",
  },
];

const OPEN_KEY = "ar-cut-media-sources-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function MediaSourceList({
  active,
  onSelect,
}: {
  active: MediaSourceView | null;
  onSelect: (view: MediaSourceView) => void;
}) {
  const label = useStudioLabel();
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* préférence non mémorisée : le repli marche quand même */
    }
  };
  // Replié, le menu garde la source active visible : on sait toujours d'où viennent les médias.
  const shown = open ? SOURCES : SOURCES.filter((s) => s.view !== null && s.view === active);
  return (
    <nav
      className="creator-media-scope flex flex-col gap-0.5 mb-2.5"
      aria-label={label("Media sources", "Sources des médias")}
    >
      <h3 className="pb-1">
        <button
          type="button"
          aria-expanded={open}
          title={
            open
              ? label("Collapse sources", "Replier les sources")
              : label("Expand sources", "Déplier les sources")
          }
          onClick={toggle}
          className="flex w-full items-center gap-1 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide text-panel-text-5 hover:text-panel-text-2"
        >
          <CaretDown
            size={9}
            weight="bold"
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          {label("Sources", "Sources")}
        </button>
      </h3>
      {shown.map((source) => {
        const name = label(source.en, source.fr);
        const soon = source.view === null;
        const hint = source.hintEn
          ? label(source.hintEn, source.hintFr ?? source.hintEn)
          : undefined;
        const selected = !soon && source.view === active;
        return (
          <button
            key={source.id}
            type="button"
            disabled={soon}
            aria-pressed={soon ? undefined : selected}
            title={soon ? `${hint} — ${label("coming soon", "bientôt disponible")}` : hint}
            onClick={() => source.view && onSelect(source.view)}
            className={`flex items-center justify-between gap-1 px-2 py-1 text-left text-[11px] font-medium rounded transition-colors ${
              selected
                ? "bg-panel-accent/15 text-accent-ink"
                : soon
                  ? "text-panel-text-5 cursor-not-allowed"
                  : "text-panel-text-3 hover:text-panel-text-1"
            }`}
          >
            <span className="min-w-0">{name}</span>
            {soon && (
              <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium bg-panel-input text-panel-text-5">
                {label("Soon", "Bientôt")}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
