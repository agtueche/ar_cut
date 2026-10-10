// Transport and section controls of the source monitor (buttons mirror the shortcuts).
import type { ReactNode } from "react";
import {
  ArrowLineLeft,
  ArrowLineRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  BracketsAngle,
  BookmarkSimple,
} from "@phosphor-icons/react";
import { cn } from "../../components/ui";
import type { SourcePlayer } from "./useSourcePlayer";

export function ToolButton({
  label,
  shortcut,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-accent/20 text-accent-ink"
          : "text-panel-text-2 hover:bg-neutral-800 hover:text-panel-text-1",
      )}
    >
      {children}
    </button>
  );
}

export function TransportBar({
  player,
  timed,
  hasIn,
  hasOut,
  onGoIn,
  onGoOut,
  onMarkIn,
  onMarkOut,
  onMarker,
  onPlaySection,
}: {
  player: SourcePlayer;
  timed: boolean;
  hasIn: boolean;
  hasOut: boolean;
  onGoIn: () => void;
  onGoOut: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onMarker: () => void;
  onPlaySection: () => void;
}) {
  const playing = player.rate > 0;
  const speed =
    player.rate !== 0 && Math.abs(player.rate) !== 1
      ? `${player.rate > 0 ? "" : "−"}${Math.abs(player.rate)}×`
      : null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5">
      <ToolButton
        label="Marquer l'entrée"
        shortcut="I"
        onClick={onMarkIn}
        disabled={!timed}
        active={hasIn}
      >
        <span className="font-mono text-[12px] font-bold">{"{"}</span>
      </ToolButton>
      <ToolButton label="Aller à l'entrée" shortcut="Maj+I" onClick={onGoIn} disabled={!hasIn}>
        <ArrowLineLeft size={14} />
      </ToolButton>
      <ToolButton
        label="Lecture arrière, plus vite à chaque appui"
        shortcut="J"
        onClick={() => player.shuttle("j")}
        disabled={!timed}
        active={player.rate < 0}
      >
        <CaretDoubleLeft size={14} />
      </ToolButton>
      <ToolButton
        label="Image précédente"
        shortcut="←"
        onClick={() => player.step(-1)}
        disabled={!timed}
      >
        <CaretLeft size={14} />
      </ToolButton>
      <ToolButton
        label={playing ? "Pause" : "Lecture"}
        shortcut="Espace / K"
        onClick={player.togglePlay}
        disabled={!timed}
        active={playing}
      >
        {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
      </ToolButton>
      <ToolButton
        label="Image suivante"
        shortcut="→"
        onClick={() => player.step(1)}
        disabled={!timed}
      >
        <CaretRight size={14} />
      </ToolButton>
      <ToolButton
        label="Lecture avant, plus vite à chaque appui"
        shortcut="L"
        onClick={() => player.shuttle("l")}
        disabled={!timed}
        active={player.rate > 1}
      >
        <CaretDoubleRight size={14} />
      </ToolButton>
      <ToolButton label="Aller à la sortie" shortcut="Maj+O" onClick={onGoOut} disabled={!hasOut}>
        <ArrowLineRight size={14} />
      </ToolButton>
      <ToolButton
        label="Marquer la sortie"
        shortcut="O"
        onClick={onMarkOut}
        disabled={!timed}
        active={hasOut}
      >
        <span className="font-mono text-[12px] font-bold">{"}"}</span>
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-neutral-700" aria-hidden="true" />
      <ToolButton
        label="Lire la section marquée"
        shortcut="/"
        onClick={onPlaySection}
        disabled={!timed}
      >
        <BracketsAngle size={14} />
      </ToolButton>
      <ToolButton label="Ajouter un marqueur" shortcut="M" onClick={onMarker} disabled={!timed}>
        <BookmarkSimple size={14} />
      </ToolButton>
      {speed && (
        <span className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-panel-text-2">
          {speed}
        </span>
      )}
    </div>
  );
}

export function SoundControls({ player, hasAudio }: { player: SourcePlayer; hasAudio: boolean }) {
  const pct = Math.round(Math.min(1, player.level * 1.4) * 100);
  return (
    <div className="flex items-center gap-2" aria-label="Son du moniteur">
      <ToolButton
        label={player.muted ? "Rétablir le son" : "Couper le son"}
        onClick={player.toggleMute}
        disabled={!hasAudio}
      >
        {player.muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
      </ToolButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={player.volume}
        disabled={!hasAudio}
        aria-label="Volume du moniteur"
        onChange={(e) => player.setVolume(Number(e.target.value))}
        className="h-1 w-16 accent-accent"
      />
      <div
        className="relative h-1.5 w-20 overflow-hidden rounded bg-neutral-800"
        title="Niveau sonore"
        aria-hidden="true"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-75",
            pct > 90 ? "bg-danger" : pct > 70 ? "bg-cta" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
