// The source monitor's time bar: waveform of the media, marked section (in → out),
// markers and playhead. Click or drag anywhere to move the playhead.
import { useEffect, useRef } from "react";
import type { PeakMap } from "../../player/components/clipPeakRuns";
import type { SourceRange } from "./sourceTimecode";

export function SourceScrubBar({
  duration,
  time,
  range,
  markers,
  peaks,
  tall,
  onSeek,
  label,
}: {
  duration: number;
  time: number;
  range: SourceRange;
  markers: number[];
  peaks: PeakMap | null;
  /** Audio-only media: the waveform is the picture, so it gets more room. */
  tall?: boolean;
  onSeek: (seconds: number) => void;
  label: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pct = (t: number) =>
    duration > 0 ? `${Math.max(0, Math.min(100, (t / duration) * 100))}%` : "0%";

  // Waveform: one bar per pixel column, drawn in the bar's text colour (theme token).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!peaks || peaks.bins.length === 0) return;
    ctx.fillStyle = getComputedStyle(canvas).color;
    const max = Math.max(0.0001, ...peaks.bins);
    const per = peaks.bins.length / width;
    for (let x = 0; x < width; x++) {
      let peak = 0;
      const from = Math.floor(x * per);
      const to = Math.max(from + 1, Math.floor((x + 1) * per));
      for (let i = from; i < to && i < peaks.bins.length; i++)
        peak = Math.max(peak, peaks.bins[i] ?? 0);
      const h = Math.max(1, (peak / max) * (height - 2));
      ctx.fillRect(x, (height - h) / 2, 1, h);
    }
  }, [peaks, tall]);

  const seekFrom = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;
    onSeek(((clientX - rect.left) / rect.width) * duration);
  };

  const inPct = range.in != null ? pct(range.in) : null;
  const outPct = range.out != null ? pct(range.out) : null;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={-1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(time * 100) / 100}
      className={`relative w-full cursor-pointer select-none overflow-hidden rounded bg-neutral-950 ${tall ? "h-full min-h-24" : "h-12"}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFrom(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e.clientX);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full text-panel-text-4" />
      {/* Marked section */}
      {(inPct != null || outPct != null) && (
        <div
          className="absolute inset-y-0 border-x-2 border-accent bg-accent/20"
          style={{ left: inPct ?? "0%", right: outPct != null ? `calc(100% - ${outPct})` : "0%" }}
        />
      )}
      {markers.map((m) => (
        <div
          key={m}
          className="absolute top-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-cta"
          style={{ left: pct(m) }}
          title="Marqueur"
        />
      ))}
      {/* Playhead */}
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-text-0"
        style={{ left: pct(time) }}
      >
        <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-text-0" />
      </div>
    </div>
  );
}
