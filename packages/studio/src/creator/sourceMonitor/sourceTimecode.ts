// Timecode and point helpers of the source monitor (pure, unit-tested).

/** HH:MM:SS:FF at `fps` images per second, as on a video editor's monitor. */
export function formatTimecode(seconds: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(seconds * rate));
  const ff = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(ff)}`;
}

/** Snaps a time to the nearest frame. */
export function snapToFrame(seconds: number, fps: number): number {
  const rate = Math.max(1, Math.round(fps));
  return Math.round(seconds * rate) / rate;
}

export interface SourceRange {
  in: number | null;
  out: number | null;
}

/** The section to send: the marked points, or the whole media when a point is missing. */
export function effectiveRange(
  range: SourceRange,
  duration: number,
): { start: number; end: number } {
  const start = Math.max(0, Math.min(range.in ?? 0, duration));
  const end = Math.max(0, Math.min(range.out ?? duration, duration));
  return end > start ? { start, end } : { start: 0, end: duration };
}

/** Marking an in-point after the out-point (or the reverse) drops the other point, as editors do. */
export function markPoint(range: SourceRange, which: "in" | "out", at: number): SourceRange {
  if (which === "in")
    return { in: at, out: range.out != null && range.out <= at ? null : range.out };
  return { in: range.in != null && range.in >= at ? null : range.in, out: at };
}

/** J / K / L shuttle: each press of the same direction doubles the speed (1, 2, 4, 8). */
export function nextShuttleRate(current: number, key: "j" | "k" | "l"): number {
  if (key === "k") return 0;
  const direction = key === "l" ? 1 : -1;
  if (Math.sign(current) !== direction) return direction;
  return Math.max(-8, Math.min(8, current * 2));
}
