// A section dragged from the source monitor to the timeline. The drag itself only
// carries the media path (the timeline's usual asset drop); the drop handler asks
// here whether that path came from the monitor, and with which range.
import type { SourceStreams } from "./sourceSectionCommit";

export interface DraggedSection {
  path: string;
  mediaStart: number;
  duration: number;
  streams: SourceStreams;
}

let pending: (DraggedSection & { at: number }) | null = null;
const MAX_AGE_MS = 60_000;

export function setDraggedSection(section: DraggedSection | null): void {
  pending = section ? { ...section, at: Date.now() } : null;
}

/** The monitor's range for a drop of `path`, once; null for an ordinary asset drop. */
export function takeDraggedSection(path: string): DraggedSection | null {
  const found = pending;
  if (!found || found.path !== path || Date.now() - found.at > MAX_AGE_MS) return null;
  pending = null;
  return {
    path: found.path,
    mediaStart: found.mediaStart,
    duration: found.duration,
    streams: found.streams,
  };
}
