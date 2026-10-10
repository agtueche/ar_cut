import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { libraryApi, libraryFileUrl, type LibraryItem } from "../../creator/creatorApi";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { VideoFrameThumbnail } from "../ui/VideoFrameThumbnail";
import { basename, filename, getCategory, type MediaCategory } from "./assetHelpers";
import { sortAssets, type MediaViewSettings } from "./mediaBrowse";
import type { MediaTypeFilter } from "./MediaViewMenus";

const SECTIONS: MediaCategory[] = ["video", "images", "audio"];

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Copies a library media into the open project through the normal import path. */
async function importIntoProject(
  item: LibraryItem,
  onImport: (files: FileList) => void | Promise<void>,
): Promise<void> {
  const response = await studioApiFetch(libraryFileUrl(item.path));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], filename(item.path), { type: blob.type }));
  await onImport(transfer.files);
}

/** Library counts per type, for the filter menu. */
export function libraryTypeCounts(items: LibraryItem[]): Partial<Record<MediaTypeFilter, number>> {
  const counts: Partial<Record<MediaTypeFilter, number>> = { all: items.length };
  for (const item of items) {
    const cat = getCategory(item.path);
    if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return counts;
}

/** Library list, refreshed on demand (after an add or a removal). */
export function useLibraryItems(): {
  items: LibraryItem[] | null;
  error: boolean;
  refresh: () => void;
} {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    libraryApi
      .list()
      .then((r) => {
        if (!cancelled) {
          setItems(r.items);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, error, refresh };
}

function LibraryItemActions({
  item,
  onImport,
  onRemoved,
}: {
  item: LibraryItem;
  onImport?: (files: FileList) => void | Promise<void>;
  onRemoved: () => void;
}) {
  const label = useStudioLabel();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onImport && (
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() => {
            setState("busy");
            importIntoProject(item, onImport)
              .then(() => setState("done"))
              .catch(() => setState("failed"));
          }}
          title={label("Import into this project", "Importer dans ce projet")}
          className="rounded-md bg-panel-input px-1.5 py-0.5 text-[10px] font-medium text-panel-text-3 enabled:hover:text-panel-text-1 disabled:opacity-60"
        >
          {state === "busy"
            ? label("Importing…", "Import…")
            : state === "done"
              ? label("Imported ✓", "Importé ✓")
              : state === "failed"
                ? label("Failed — retry", "Échec — réessayer")
                : label("+ Project", "+ Projet")}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          void libraryApi.remove(item.path).then(onRemoved, () => setConfirm(false));
        }}
        onBlur={() => setConfirm(false)}
        title={label("Remove from my library", "Retirer de ma bibliothèque")}
        aria-label={label("Remove from my library", "Retirer de ma bibliothèque")}
        className={`rounded px-1 text-[11px] ${confirm ? "bg-danger/15 text-danger-ink" : "text-panel-text-5 hover:text-panel-text-1"}`}
      >
        {confirm ? label("Remove?", "Retirer ?") : "×"}
      </button>
    </div>
  );
}

function AudioPreview({ src }: { src: string }) {
  const label = useStudioLabel();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        aria-label={playing ? label("Pause", "Pause") : label("Play", "Écouter")}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            void el.play().then(
              () => setPlaying(true),
              () => setPlaying(false),
            );
          } else el.pause();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-input text-[10px] text-panel-text-2 hover:text-panel-text-1"
      >
        {playing ? "❚❚" : "▶"}
      </button>
    </>
  );
}

function ExampleBadge() {
  const label = useStudioLabel();
  return (
    <span className="rounded-sm bg-panel-input px-1 py-px text-[9px] font-medium text-panel-text-5">
      {label("Example", "Exemple")}
    </span>
  );
}

export function LibraryView({
  library,
  searchQuery,
  typeFilter,
  view,
  onImport,
}: {
  library: ReturnType<typeof useLibraryItems>;
  searchQuery: string;
  typeFilter: MediaTypeFilter;
  view: MediaViewSettings;
  onImport?: (files: FileList) => void | Promise<void>;
}) {
  const label = useStudioLabel();
  const { items, error, refresh } = library;
  const info = useMemo(() => new Map((items ?? []).map((i) => [i.path, i])), [items]);
  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const visible = (items ?? []).filter((i) => !q || basename(i.path).toLowerCase().includes(q));
    const out: Record<MediaCategory, string[]> = { video: [], images: [], audio: [], fonts: [] };
    for (const i of visible) {
      const cat = getCategory(i.path);
      if (cat && (typeFilter === "all" || typeFilter === cat)) out[cat].push(i.path);
    }
    for (const cat of SECTIONS) out[cat] = sortAssets(out[cat], info, view.sortKey, view.sortOrder);
    return out;
  }, [items, info, searchQuery, typeFilter, view.sortKey, view.sortOrder]);

  if (error) {
    return (
      <p className="px-4 py-3 text-[11px] text-danger-ink">
        {label("The library could not be read.", "La bibliothèque est illisible pour le moment.")}{" "}
        <button type="button" onClick={refresh} className="underline">
          {label("Retry", "Réessayer")}
        </button>
      </p>
    );
  }
  if (!items) {
    return (
      <p className="px-4 py-3 text-[11px] text-panel-text-5">{label("Loading…", "Chargement…")}</p>
    );
  }
  const sectionName: Record<MediaCategory, string> = {
    video: label("Video", "Vidéo"),
    images: label("Images", "Images"),
    audio: label("Sound", "Son"),
    fonts: label("Fonts", "Polices"),
  };
  const total = SECTIONS.reduce((n, cat) => n + groups[cat].length, 0);
  return (
    <div>
      <p className="px-4 pb-2 pt-1 text-[10px] leading-snug text-panel-text-5">
        {label(
          "Your media, reusable in every project. Add one from a project: right-click › Add to my library.",
          "Vos médias, réutilisables dans tous les projets. Pour en ajouter un : clic droit sur un média du projet › Ajouter à ma bibliothèque.",
        )}
      </p>
      {total === 0 && (
        <p className="px-4 py-3 text-[11px] text-panel-text-5">
          {label("Nothing matches.", "Aucun média ne correspond.")}
        </p>
      )}
      {SECTIONS.filter((cat) => groups[cat].length > 0).map((cat) => (
        <div key={cat} className="mb-1">
          <div className="flex items-center gap-2 border-t border-panel-border px-4 py-2">
            <h3 className="text-[12px] font-semibold text-panel-text-1">{sectionName[cat]}</h3>
            <span className="text-[11px] text-panel-text-5">{groups[cat].length}</span>
          </div>
          {cat === "audio" ? (
            groups.audio.map((path) => {
              const item = info.get(path)!;
              return (
                <div key={path} className="flex items-center gap-2 px-4 py-1.5">
                  <AudioPreview src={libraryFileUrl(path)} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[11px] font-medium text-panel-text-2"
                      title={path}
                    >
                      {basename(path).replace(/^Exemple - /, "")}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-panel-text-5">
                      {formatDuration(item.duration)}
                      {item.example && <ExampleBadge />}
                    </div>
                  </div>
                  <LibraryItemActions item={item} onImport={onImport} onRemoved={refresh} />
                </div>
              );
            })
          ) : (
            <div
              className="creator-media-grid grid grid-cols-2 gap-1 px-2 pb-1"
              data-layout={view.layout}
            >
              {groups[cat].map((path) => {
                const item = info.get(path)!;
                const src = libraryFileUrl(path);
                return (
                  <div
                    key={path}
                    className="flex flex-col gap-1 rounded-md p-1 hover:bg-neutral-800/40"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-neutral-900">
                      {cat === "images" ? (
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <VideoFrameThumbnail src={src} />
                      )}
                      {item.example && (
                        <span className="absolute left-1 top-1">
                          <ExampleBadge />
                        </span>
                      )}
                      {formatDuration(item.duration) && (
                        <span className="absolute right-1 top-1 rounded-sm bg-neutral-950/80 px-1.5 py-[3px] text-[9px] font-medium leading-none text-panel-text-2">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-[10px] text-panel-text-3" title={path}>
                        {basename(path).replace(/^Exemple - /, "")}
                      </span>
                      <LibraryItemActions item={item} onImport={onImport} onRemoved={refresh} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
