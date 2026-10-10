// Moniteur source: preview a rush before it goes on the timeline, mark the section
// to keep (I / O) and send only that section at the playhead (Insérer « , » /
// Écraser « . ») or drag it onto the timeline. Shortcuts follow video editors.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DotsSixVertical, FilmSlate } from "@phosphor-icons/react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { usePlayerStore } from "../../player/store/playerStore";
import { loadPeakMap } from "../../player/components/clipPeakMap";
import type { PeakMap } from "../../player/components/clipPeakRuns";
import { encodePreviewPath, resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { timelineTrackOrder } from "../../player/components/timelineTrackDisplay";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT } from "../../utils/mediaTypes";
import { TIMELINE_ASSET_MIME } from "../../utils/timelineAssetDrop";
import { cn } from "../../components/ui";
import { assetActionsApi, type AssetDetails } from "../creatorApi";
import { useStudioBridge } from "../studioBridge";
import { useCreatorEditorControls } from "../CreatorEditorContext";
import { useSourceMonitorRequest } from "../sourceMonitorRequest";
import { inputClass } from "../components/common";
import { SourceScrubBar } from "./SourceScrubBar";
import { SoundControls, ToolButton, TransportBar } from "./SourceControls";
import { useSourcePlayer } from "./useSourcePlayer";
import { commitSourceSection, type SourceStreams } from "./sourceSectionCommit";
import { setDraggedSection } from "./draggedSection";
import {
  effectiveRange,
  formatTimecode,
  markPoint,
  snapToFrame,
  type SourceRange,
} from "./sourceTimecode";
import type { SectionEditMode } from "./sourceSectionEdit";

/** In/out points are remembered per media for the session, as on an editor's source monitor. */
const rangeMemory = new Map<string, SourceRange>();
const IMAGE_SECONDS = 3;

function markersKey(projectId: string, path: string) {
  return `ar-cut-source-markers:${projectId}:${path}`;
}
function readMarkers(projectId: string, path: string): number[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(markersKey(projectId, path)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function SourceMonitorPanel({ onAdd }: { onAdd?: (path: string) => void }) {
  const { assets } = useFileManagerContext();
  const { projectId } = useStudioShellContext();
  const bridge = useStudioBridge();
  const projectFps = useCreatorEditorControls()?.project?.fps ?? 25;
  const request = useSourceMonitorRequest();
  const rootRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  const [path, setPath] = useState(() => request?.path ?? "");
  const [details, setDetails] = useState<AssetDetails | null>(null);
  const [peaks, setPeaks] = useState<PeakMap | null>(null);
  const [range, setRange] = useState<SourceRange>({ in: null, out: null });
  const [markers, setMarkers] = useState<number[]>([]);
  const [streams, setStreams] = useState<SourceStreams>("both");
  const [track, setTrack] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const isVideo = VIDEO_EXT.test(path);
  const isAudio = AUDIO_EXT.test(path);
  const isImage = IMAGE_EXT.test(path);
  const timed = isVideo || isAudio;
  const fps = details?.video?.fps ?? projectFps;
  const hasAudio = isAudio || !!details?.audio;
  const url = path ? resolveMediaPreviewUrl(path, projectId) : "";
  const player = useSourcePlayer(mediaRef, fps, path);
  const duration = timed ? player.duration || details?.duration || 0 : IMAGE_SECONDS;

  // A media sent from the library (click on a thumbnail) replaces the current one and takes the keys.
  useEffect(() => {
    if (!request) return;
    setPath(request.path);
    // After the click that sent it has finished (the card would take the focus back).
    const id = window.setTimeout(() => rootRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, [request]);

  useEffect(() => {
    setMessage(null);
    setDetails(null);
    setPeaks(null);
    if (!path) return;
    setRange(rangeMemory.get(path) ?? { in: null, out: null });
    setMarkers(readMarkers(projectId, path));
    setStreams(AUDIO_EXT.test(path) ? "audio" : "both");
    let live = true;
    assetActionsApi
      .details(projectId, path)
      .then((r) => live && setDetails(r.details))
      .catch(() => {});
    if (VIDEO_EXT.test(path) || AUDIO_EXT.test(path)) {
      void loadPeakMap(buildProjectApiPath(projectId, `/peaks/${encodePreviewPath(path)}`)).then(
        (p) => live && setPeaks(p),
      );
    }
    return () => {
      live = false;
    };
  }, [path, projectId]);

  const updateRange = (next: SourceRange) => {
    setRange(next);
    rangeMemory.set(path, next);
  };
  const saveMarkers = (next: number[]) => {
    setMarkers(next);
    try {
      localStorage.setItem(markersKey(projectId, path), JSON.stringify(next));
    } catch {
      /* markers stay for this session only */
    }
  };

  // Target tracks: the timeline's rows, plus a new one on top.
  const elements = usePlayerStore((s) => s.elements);
  const trackOptions = useMemo(() => {
    const order = timelineTrackOrder(elements);
    const names = new Map(elements.map((e) => [e.track, e.trackName]));
    const rows = order.map((t, i) => ({
      value: t,
      label: `Piste ${i + 1}${names.get(t) ? ` — ${names.get(t)}` : ""}`,
    }));
    const next = order.length ? Math.max(...order) + 1 : 0;
    return [...rows, { value: next, label: "Nouvelle piste" }];
  }, [elements]);

  const now = snapToFrame(player.time, fps);
  const section = timed ? effectiveRange(range, duration) : { start: 0, end: IMAGE_SECONDS };
  const sectionStreams: SourceStreams = isAudio ? "audio" : isImage ? "both" : streams;

  const send = async (mode: SectionEditMode) => {
    if (!path || busy) return;
    if (!bridge) {
      setMessage({
        tone: "error",
        text: "Ouvrez un projet pour envoyer ce média dans la timeline.",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await commitSourceSection(bridge, {
        path,
        start: section.start,
        end: section.end,
        streams: sectionStreams,
        mode,
        track,
      });
      const verb = mode === "insert" ? "insérée" : "posée en écrasant";
      const kept = result.keptInPlace.length
        ? ` Laissés en place (non découpables) : ${result.keptInPlace.join(", ")}.`
        : "";
      setMessage({
        tone: "info",
        text: `Section de ${formatTimecode(section.end - section.start, fps)} ${verb} à la tête de lecture.${kept}`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const toggleMarker = () => {
    const near = markers.find((m) => Math.abs(m - now) < 1 / fps);
    saveMarkers(
      near != null ? markers.filter((m) => m !== near) : [...markers, now].sort((a, b) => a - b),
    );
  };

  /** One shortcut → one action; false when the key is not the monitor's. */
  // fallow-ignore-next-line complexity
  const runShortcut = (e: KeyboardEvent): boolean => {
    const key = e.key.toLowerCase();
    const letter = (name: string) => e.code === `Key${name.toUpperCase()}` || key === name;
    if (key === " ") {
      if (timed) player.togglePlay();
      return true;
    }
    if (!e.altKey && (key === "j" || key === "k" || key === "l")) {
      if (timed) player.shuttle(key);
      return true;
    }
    if (key === "arrowleft" || key === "arrowright") {
      if (timed) player.step((key === "arrowleft" ? -1 : 1) * (e.shiftKey ? Math.round(fps) : 1));
      return true;
    }
    if (key === "home" || key === "end") {
      player.seek(key === "home" ? 0 : duration);
      return true;
    }
    if (e.altKey && letter("x")) {
      updateRange({ in: null, out: null });
      return true;
    }
    for (const which of ["in", "out"] as const) {
      if (!letter(which === "in" ? "i" : "o")) continue;
      const point = range[which];
      if (e.altKey) updateRange({ ...range, [which]: null });
      else if (e.shiftKey) {
        if (point != null) player.seek(point);
      } else if (timed) updateRange(markPoint(range, which, now));
      return true;
    }
    if (letter("x")) {
      updateRange({ in: 0, out: duration });
      return true;
    }
    if (key === "m" && timed) {
      toggleMarker();
      return true;
    }
    if (key === "/" && timed) {
      player.playRange(section.start, section.end);
      return true;
    }
    if (key === "," || key === ".") {
      void send(key === "," ? "insert" : "overwrite");
      return true;
    }
    return false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || !path) return;
    // Fields keep their own keys (the media list, the track list, the volume).
    if ((e.target as HTMLElement).closest("select,input")) return;
    if (runShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <section
      ref={rootRef}
      tabIndex={0}
      data-owns-plain-keys=""
      aria-label="Moniteur source"
      onKeyDown={onKeyDown}
      className="flex h-full min-h-0 flex-col gap-2 p-2 outline-hidden focus-visible:ring-1 focus-visible:ring-accent/50"
    >
      <header className="flex items-center gap-2">
        <select
          aria-label="Média source"
          className={cn(inputClass, "min-w-0 flex-1")}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        >
          <option value="">Choisir un média…</option>
          {assets
            .filter((a) => VIDEO_EXT.test(a) || AUDIO_EXT.test(a) || IMAGE_EXT.test(a))
            .map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
        </select>
      </header>
      {details && (
        <p className="truncate text-[10px] text-panel-text-4">
          {[
            details.video && `${details.video.width} × ${details.video.height}`,
            details.video?.fps && `${details.video.fps} i/s`,
            details.video?.codec,
            details.audio
              ? `son ${details.audio.channels === 1 ? "mono" : "stéréo"}`
              : details.video && "sans son",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Viewer: the media in its own format (letterboxed, never stretched) */}
      <div className="relative flex min-h-24 flex-1 items-center justify-center overflow-hidden rounded bg-neutral-950">
        {!path && (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-[11px] text-panel-text-4">
            <FilmSlate size={28} />
            Cliquez sur un rush de la bibliothèque pour le prévisualiser ici, marquez la section
            voulue avec I et O, puis envoyez-la dans la timeline.
          </div>
        )}
        {isVideo && (
          <video
            key={url}
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={url}
            playsInline
            preload="auto"
            className="max-h-full max-w-full object-contain"
          />
        )}
        {isAudio && (
          <>
            <audio
              key={url}
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={url}
              preload="auto"
            />
            <div className="absolute inset-3">
              <SourceScrubBar
                duration={duration}
                time={player.time}
                range={range}
                markers={markers}
                peaks={peaks}
                tall
                onSeek={player.seek}
                label="Forme d'onde"
              />
            </div>
          </>
        )}
        {isImage && <img src={url} alt={path} className="max-h-full max-w-full object-contain" />}
        {timed && (
          <span className="absolute left-2 top-2 rounded bg-neutral-950/80 px-1.5 py-0.5 font-mono text-[12px] text-panel-text-1">
            {formatTimecode(player.time, fps)}
          </span>
        )}
      </div>

      {timed && !isAudio && (
        <SourceScrubBar
          duration={duration}
          time={player.time}
          range={range}
          markers={markers}
          peaks={peaks}
          onSeek={player.seek}
          label="Position dans le rush"
        />
      )}

      <TransportBar
        player={player}
        timed={timed}
        hasIn={range.in != null}
        hasOut={range.out != null}
        onGoIn={() => range.in != null && player.seek(range.in)}
        onGoOut={() => range.out != null && player.seek(range.out)}
        onMarkIn={() => updateRange(markPoint(range, "in", now))}
        onMarkOut={() => updateRange(markPoint(range, "out", now))}
        onMarker={toggleMarker}
        onPlaySection={() => player.playRange(section.start, section.end)}
      />

      {/* The section that will be sent */}
      <div className="grid grid-cols-3 gap-1 rounded bg-neutral-900 px-2 py-1.5 text-center font-mono text-[10px]">
        <div>
          <div className="font-sans text-panel-text-5">Entrée</div>
          <div className="text-panel-text-1">{formatTimecode(section.start, fps)}</div>
        </div>
        <div>
          <div className="font-sans text-panel-text-5">Sortie</div>
          <div className="text-panel-text-1">{formatTimecode(section.end, fps)}</div>
        </div>
        <div>
          <div className="font-sans text-panel-text-5">Durée</div>
          <div className="text-accent-ink">{formatTimecode(section.end - section.start, fps)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SoundControls player={player} hasAudio={hasAudio && timed} />
        {(range.in != null || range.out != null) && (
          <ToolButton
            label="Effacer l'entrée et la sortie"
            shortcut="Alt+X"
            onClick={() => updateRange({ in: null, out: null })}
          >
            Effacer les points
          </ToolButton>
        )}
      </div>

      {/* Sending to the timeline */}
      <div className="flex flex-col gap-1.5 border-t border-neutral-800 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isVideo && hasAudio && (
            <div
              role="radiogroup"
              aria-label="Envoyer"
              className="flex overflow-hidden rounded border border-neutral-700"
            >
              {(
                [
                  ["both", "Image + son"],
                  ["video", "Image"],
                  ["audio", "Son"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={streams === value}
                  onClick={() => setStreams(value)}
                  className={cn(
                    "px-2 py-1 text-[10px]",
                    streams === value
                      ? "bg-accent/20 text-accent-ink"
                      : "text-panel-text-3 hover:bg-neutral-800",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          <select
            aria-label="Piste cible"
            className={cn(inputClass, "h-7 min-w-0 flex-1 py-0 text-[11px]")}
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
          >
            {trackOptions.map((o) => (
              <option key={`${o.value}-${o.label}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            draggable={!!path}
            title="Glisser la section vers la timeline"
            aria-label="Glisser la section vers la timeline"
            onDragStart={(e) => {
              e.dataTransfer.setData(TIMELINE_ASSET_MIME, JSON.stringify({ path }));
              e.dataTransfer.effectAllowed = "copy";
              setDraggedSection({
                path,
                mediaStart: isImage ? 0 : section.start,
                duration: section.end - section.start,
                streams: sectionStreams,
              });
            }}
            onDragEnd={() => window.setTimeout(() => setDraggedSection(null), 500)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-700 text-panel-text-3",
              path ? "cursor-grab hover:text-panel-text-1" : "opacity-40",
            )}
          >
            <DotsSixVertical size={16} />
          </div>
          <button
            type="button"
            disabled={!path || busy}
            onClick={() => void send("insert")}
            title="Insère la section à la tête de lecture et décale la suite de la piste ( , )"
            className="h-8 flex-1 rounded bg-accent px-2 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Insérer <span className="font-mono opacity-70">,</span>
          </button>
          <button
            type="button"
            disabled={!path || busy}
            onClick={() => void send("overwrite")}
            title="Pose la section à la tête de lecture par-dessus ce qui s'y trouve ( . )"
            className="h-8 flex-1 rounded border border-accent px-2 text-[11px] font-semibold text-accent-ink hover:bg-accent/10 disabled:opacity-40"
          >
            Écraser <span className="font-mono opacity-70">.</span>
          </button>
          {onAdd && path && (
            <ToolButton label="Ajouter le média entier sans décaler" onClick={() => onAdd(path)}>
              Entier
            </ToolButton>
          )}
        </div>
        {message && (
          <p
            role="status"
            className={cn(
              "text-[10px]",
              message.tone === "error" ? "text-danger-ink" : "text-accent-ink",
            )}
          >
            {message.text}
          </p>
        )}
        <p className="text-[9px] leading-snug text-panel-text-5">
          Espace lecture · J K L reculer / pause / avancer · ← → image par image (Maj : 1 s) · I / O
          entrée / sortie · Alt+I / Alt+O / Alt+X effacer · Maj+I / Maj+O y aller · X tout le rush ·
          / lire la section · M marqueur · , insérer · . écraser
        </p>
      </div>
    </section>
  );
}
