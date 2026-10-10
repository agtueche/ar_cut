import { FilmStrip, Image as ImageIcon, MusicNotes, Waveform } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { stockApi, stockFileUrl, type StockItem, type StockKind } from "../../creator/creatorApi";
import { studioApiFetch } from "../../utils/studioApiFetch";

const KIND_KEY = "arcut-stock-kind";
const DEBOUNCE_MS = 500;

interface KindInfo {
  id: StockKind;
  en: string;
  fr: string;
  icon: ReactNode;
  /** Shown when the search box is empty, so the tab is never blank. */
  defaultQuery: string;
  ideas: Array<[string, string]>;
}

const KINDS: KindInfo[] = [
  {
    id: "videos",
    en: "Videos",
    fr: "Vidéos",
    icon: <FilmStrip size={14} />,
    defaultQuery: "nature",
    ideas: [
      ["nature", "Nature"],
      ["city", "Ville"],
      ["ocean", "Mer"],
      ["sky", "Ciel"],
      ["timelapse", "Timelapse"],
      ["drone", "Vue aérienne"],
    ],
  },
  {
    id: "images",
    en: "Images",
    fr: "Images",
    icon: <ImageIcon size={14} />,
    defaultQuery: "landscape",
    ideas: [
      ["landscape", "Paysage"],
      ["texture", "Texture"],
      ["sunset", "Coucher de soleil"],
      ["abstract", "Abstrait"],
      ["people", "Personnes"],
      ["office", "Bureau"],
    ],
  },
  {
    id: "music",
    en: "Music",
    fr: "Musiques",
    icon: <MusicNotes size={14} />,
    defaultQuery: "ambient",
    ideas: [
      ["ambient", "Ambiance"],
      ["piano", "Piano"],
      ["cinematic", "Cinématique"],
      ["electronic", "Électro"],
      ["acoustic", "Acoustique"],
      ["epic", "Épique"],
    ],
  },
  {
    id: "sfx",
    en: "Sound effects",
    fr: "Bruitages",
    icon: <Waveform size={14} />,
    defaultQuery: "whoosh",
    ideas: [
      ["whoosh", "Whoosh"],
      ["impact", "Impact"],
      ["rain", "Pluie"],
      ["crowd", "Foule"],
      ["door", "Porte"],
      ["wind", "Vent"],
    ],
  },
];

function readKind(): StockKind {
  try {
    const saved = localStorage.getItem(KIND_KEY);
    return KINDS.some((k) => k.id === saved) ? (saved as StockKind) : "videos";
  } catch {
    return "videos";
  }
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function LicenseBadge({ item }: { item: StockItem }) {
  const label = useStudioLabel();
  const free = !item.license.attributionRequired;
  return (
    <span
      title={
        free
          ? label("Free to use, no credit required", "Utilisation libre, sans crédit obligatoire")
          : label("Free to use — credit the author", "Utilisation libre — créditer l'auteur")
      }
      className={`shrink-0 rounded-sm px-1 py-px text-[9px] font-semibold leading-tight ${
        free ? "bg-panel-accent/15 text-accent-ink" : "bg-panel-input text-panel-text-2"
      }`}
    >
      {item.license.label}
      {free ? "" : ` · ${label("credit", "crédit")}`}
    </span>
  );
}

type ActionState = "idle" | "busy" | "done" | "failed";

function useAction(): [ActionState, (task: () => Promise<unknown>) => void] {
  const [state, setState] = useState<ActionState>("idle");
  const run = (task: () => Promise<unknown>) => {
    setState("busy");
    task().then(
      () => setState("done"),
      () => setState("failed"),
    );
  };
  return [state, run];
}

/** Downloads through the server (which re-checks the licence), then imports like a dropped file. */
async function importToProject(
  item: StockItem,
  projectId: string,
  onImport: (files: FileList) => void | Promise<void>,
): Promise<void> {
  const response = await studioApiFetch(stockFileUrl(item));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const name =
    decodeURIComponent(response.headers.get("X-Stock-File-Name") ?? "") ||
    `media.${item.extension}`;
  const blob = await response.blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], name, { type: blob.type }));
  await onImport(transfer.files);
  await stockApi.credit(projectId, name, item);
}

function ItemActions({
  item,
  projectId,
  onImport,
}: {
  item: StockItem;
  projectId: string;
  onImport?: (files: FileList) => void | Promise<void>;
}) {
  const label = useStudioLabel();
  const [project, runProject] = useAction();
  const [library, runLibrary] = useAction();
  const text = (state: ActionState, idle: string) =>
    state === "busy"
      ? "…"
      : state === "done"
        ? "✓"
        : state === "failed"
          ? label("Retry", "Réessayer")
          : idle;
  const btn =
    "rounded-md bg-panel-input px-1.5 py-0.5 text-[10px] font-medium text-panel-text-3 enabled:hover:text-panel-text-1 disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {onImport && (
        <button
          type="button"
          className={btn}
          disabled={project === "busy" || project === "done"}
          title={label(
            "Download into this project (credit recorded)",
            "Télécharger dans ce projet (crédit enregistré)",
          )}
          onClick={() => runProject(() => importToProject(item, projectId, onImport))}
        >
          {text(project, label("+ Project", "+ Projet"))}
        </button>
      )}
      <button
        type="button"
        className={btn}
        disabled={library === "busy" || library === "done"}
        title={label("Save to my library", "Enregistrer dans ma bibliothèque")}
        onClick={() => runLibrary(() => stockApi.toLibrary(item))}
      >
        {text(library, label("+ Library", "+ Biblio"))}
      </button>
      {item.landingUrl && (
        <a
          href={item.landingUrl}
          target="_blank"
          rel="noreferrer"
          title={label("Open the source page", "Ouvrir la page source")}
          className="px-0.5 text-[10px] text-panel-text-5 hover:text-panel-text-1"
        >
          ↗
        </a>
      )}
    </div>
  );
}

function AudioPlay({ src }: { src: string }) {
  const label = useStudioLabel();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        aria-label={playing ? label("Pause", "Pause") : label("Listen", "Écouter")}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused)
            void el.play().then(
              () => setPlaying(true),
              () => setPlaying(false),
            );
          else el.pause();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-input text-[10px] text-panel-text-2 hover:text-panel-text-1"
      >
        {playing ? "❚❚" : "▶"}
      </button>
    </>
  );
}

function VisualCard({ item, children }: { item: StockItem; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md p-1 hover:bg-neutral-800/40">
      <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-neutral-900">
        {item.thumbnail && (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        )}
        {formatDuration(item.duration) && (
          <span className="absolute right-1 top-1 rounded-sm bg-neutral-950/80 px-1.5 py-[3px] text-[9px] font-medium leading-none text-panel-text-2">
            {formatDuration(item.duration)}
          </span>
        )}
        <span className="absolute bottom-1 left-1">
          <LicenseBadge item={item} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] text-panel-text-2" title={item.title}>
          {item.title}
        </div>
        {item.creator && (
          <div className="truncate text-[9px] text-panel-text-5" title={item.creator}>
            {item.creator}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function StockView({
  projectId,
  searchQuery,
  layout,
  onImport,
}: {
  projectId: string;
  searchQuery: string;
  layout: string;
  onImport?: (files: FileList) => void | Promise<void>;
}) {
  const label = useStudioLabel();
  const [kind, setKindState] = useState<StockKind>(readKind);
  const [idea, setIdea] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const info = KINDS.find((k) => k.id === kind) ?? KINDS[0]!;

  const setKind = (next: StockKind) => {
    setKindState(next);
    setIdea(null);
    try {
      localStorage.setItem(KIND_KEY, next);
    } catch {
      /* remembered for this page only */
    }
  };

  // Search box first, then a chosen idea, then the tab's default topic.
  useEffect(() => {
    const typed = searchQuery.trim();
    const timer = setTimeout(
      () => setQuery(typed || idea || info.defaultQuery),
      typed ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [searchQuery, idea, info.defaultQuery]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    stockApi
      .search(kind, query, 1)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setPage(1);
        setHasMore(r.hasMore);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, query, attempt]);

  const loadMore = () => {
    const next = page + 1;
    setStatus("loading");
    stockApi.search(kind, query, next).then(
      (r) => {
        setItems((list) => [...list, ...r.items.filter((i) => !list.some((x) => x.id === i.id))]);
        setPage(next);
        setHasMore(r.hasMore);
        setStatus("ready");
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : null);
        setStatus("error");
      },
    );
  };

  const isAudio = kind === "music" || kind === "sfx";
  return (
    <div className="flex flex-col">
      {/* Sub-tabs */}
      <div
        role="tablist"
        aria-label={label("Media type", "Type de média")}
        className="creator-stock-tabs mx-3 mb-2 mt-1 grid grid-cols-4 gap-0.5 rounded-md bg-panel-input p-0.5"
      >
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            title={label(k.en, k.fr)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-medium transition-colors ${
              kind === k.id
                ? "bg-panel-accent/15 text-accent-ink"
                : "text-panel-text-3 hover:text-panel-text-1"
            }`}
          >
            {k.icon}
            <span className="creator-stock-tab-label truncate">{label(k.en, k.fr)}</span>
          </button>
        ))}
      </div>

      {/* Ideas, while the search box is empty */}
      {!searchQuery.trim() && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {info.ideas.map(([q, name]) => {
            const active = (idea ?? info.defaultQuery) === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => setIdea(q)}
                aria-pressed={active}
                className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                  active
                    ? "bg-panel-accent/15 text-accent-ink"
                    : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {status === "error" && (
        <div className="mx-3 mb-2 rounded-md bg-danger/10 px-3 py-2 text-[11px] text-danger-ink">
          {error ??
            label(
              "The library could not be reached.",
              "La banque est injoignable pour le moment.",
            )}{" "}
          <button type="button" className="underline" onClick={() => setAttempt((a) => a + 1)}>
            {label("Retry", "Réessayer")}
          </button>
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <p className="px-4 py-3 text-[11px] text-panel-text-5">
          {label("No free media found for", "Aucun média libre trouvé pour")} « {query} ».
        </p>
      )}

      {isAudio ? (
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 border-t border-panel-border px-3 py-2"
            >
              {item.preview && <AudioPlay src={item.preview} />}
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[11px] font-medium text-panel-text-2"
                  title={item.title}
                >
                  {item.title}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-panel-text-5">
                  {formatDuration(item.duration)}
                  {item.creator && <span className="truncate">{item.creator}</span>}
                  <LicenseBadge item={item} />
                </div>
                <div className="mt-1">
                  <ItemActions item={item} projectId={projectId} onImport={onImport} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="creator-media-grid grid grid-cols-2 gap-1 px-2 pb-1" data-layout={layout}>
          {items.map((item) => (
            <VisualCard key={item.id} item={item}>
              <ItemActions item={item} projectId={projectId} onImport={onImport} />
            </VisualCard>
          ))}
        </div>
      )}

      {status === "loading" && (
        <p className="px-4 py-3 text-[11px] text-panel-text-5">
          {label("Searching…", "Recherche en cours…")}
        </p>
      )}
      {status === "ready" && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="mx-3 my-2 rounded-md bg-panel-input py-1.5 text-[11px] font-medium text-panel-text-3 hover:text-panel-text-1"
        >
          {label("Show more", "Afficher plus")}
        </button>
      )}

      <p className="px-4 pb-3 pt-2 text-[9px] leading-snug text-panel-text-5">
        {label(
          "Sources: Wikimedia Commons (videos) and Openverse (images, music, sound effects). Only licences allowing commercial use are shown: CC0, public domain, CC BY, CC BY-SA. Every import records its credit in Credits and licences.",
          "Sources : Wikimedia Commons (vidéos) et Openverse (images, musiques, bruitages). Seules les licences autorisant l'usage commercial sont affichées : CC0, domaine public, CC BY, CC BY-SA. Chaque import enregistre son crédit dans « Crédits et licences ».",
        )}
      </p>
    </div>
  );
}
