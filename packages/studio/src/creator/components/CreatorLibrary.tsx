import { useId, useState, type ReactNode } from "react";
import {
  FilmSlate,
  MusicNote,
  TextT,
  Shapes,
  Sparkle,
  ArrowsLeftRight,
  Subtitles,
  SquaresFour,
  Flag,
  FolderOpen,
  Code,
  Info,
  type Icon,
} from "@phosphor-icons/react";
import { useDockLayoutStore } from "../../components/dock/dockLayoutStore";
import type { PanelId } from "../../components/dock/panelRegistry";
import "../studioWorkspace.css";

type Category =
  | "media"
  | "sound"
  | "text"
  | "elements"
  | "effects"
  | "transitions"
  | "subtitles"
  | "catalog"
  | "adjustment";
const CATEGORIES: { id: Category; label: string; icon: Icon; hint: string }[] = [
  {
    id: "media",
    label: "Multimédia",
    icon: FilmSlate,
    hint: "Vidéos, images et fichiers du projet",
  },
  { id: "sound", label: "Son", icon: MusicNote, hint: "Audio, microphone et spatialisation" },
  { id: "text", label: "Texte", icon: TextT, hint: "Titres et animations de texte" },
  { id: "elements", label: "Éléments", icon: Shapes, hint: "Formes, images et fonds" },
  { id: "effects", label: "Effets", icon: Sparkle, hint: "Catalogue des effets visuels" },
  {
    id: "transitions",
    label: "Transitions",
    icon: ArrowsLeftRight,
    hint: "Catalogue des transitions",
  },
  { id: "subtitles", label: "Légendes", icon: Subtitles, hint: "Segments, SRT et VTT" },
  { id: "catalog", label: "Modèles", icon: SquaresFour, hint: "Catalogue complet et compositions" },
  {
    id: "adjustment",
    label: "Ajustement",
    icon: Sparkle,
    hint: "Filtres, couleur, courbes et LUT",
  },
];
const TOOLS: { id: PanelId; label: string; icon: Icon }[] = [
  { id: "source", label: "Moniteur source", icon: FilmSlate },
  { id: "compositions", label: "Compositions", icon: FolderOpen },
  { id: "markers", label: "Marqueurs", icon: Flag },
  { id: "code", label: "Code source", icon: Code },
  { id: "credits", label: "Crédits et licences", icon: Info },
];

/** One library, persistent category contents; original dock panels remain available. */
export function CreatorLibrary({ content }: { content: Record<Category, ReactNode> }) {
  const [active, setActive] = useState<Category>("media");
  const [visited, setVisited] = useState<Set<Category>>(() => new Set(["media"]));
  const prefix = useId();
  const choose = (category: Category) => {
    setVisited((old) => new Set([...old, category]));
    setActive(category);
  };
  return (
    <div className="creator-library">
      <div
        className="creator-library-tabs"
        role="tablist"
        aria-label="Catégories de la bibliothèque"
        onKeyDown={(event) => {
          const index = CATEGORIES.findIndex((category) => category.id === active);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % CATEGORIES.length
              : event.key === "ArrowLeft"
                ? (index + CATEGORIES.length - 1) % CATEGORIES.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? CATEGORIES.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          const category = CATEGORIES[next]!;
          choose(category.id);
          document.getElementById(`${prefix}-${category.id}`)?.focus();
        }}
      >
        {CATEGORIES.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            id={`${prefix}-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`${prefix}-${id}-panel`}
            tabIndex={active === id ? 0 : -1}
            title={hint}
            onClick={() => choose(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="creator-library-body">
        {CATEGORIES.filter((category) => visited.has(category.id)).map((category) => (
          <div
            key={category.id}
            id={`${prefix}-${category.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${prefix}-${category.id}`}
            hidden={active !== category.id}
            className="creator-library-page"
          >
            {content[category.id]}
          </div>
        ))}
      </div>
      <nav className="creator-library-tools" aria-label="Outils du projet">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            title={label}
            onClick={() => useDockLayoutStore.getState().activatePanel(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
