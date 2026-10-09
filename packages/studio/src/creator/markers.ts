// Project markers: named, coloured points on the timeline, stored as JSON in
// the root composition's data-markers attribute (the HTML stays the source of
// truth, so markers survive save, reopen, duplicate and export of the project).

import { isTrackColor, type TrackColor } from "./trackMeta";

export const MARKERS_ATTR = "data-markers";

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: TrackColor;
}

const MAX_MARKERS = 500;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function parseMarkers(raw: string | null | undefined): Marker[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const markers: Marker[] = [];
  for (const item of data.slice(0, MAX_MARKERS)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const time = Number(record.time);
    if (typeof record.id !== "string" || !Number.isFinite(time) || time < 0) continue;
    markers.push({
      id: record.id,
      time: round(time),
      name: typeof record.name === "string" ? record.name.slice(0, 80) : "",
      color: isTrackColor(record.color) ? record.color : "orange",
    });
  }
  return sortMarkers(markers);
}

export function sortMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function serializeMarkers(markers: Marker[]): string | null {
  return markers.length ? JSON.stringify(sortMarkers(markers)) : null;
}

/** `m1`, `m2`… the first id not already taken. */
export function nextMarkerId(markers: Marker[]): string {
  const used = new Set(markers.map((marker) => marker.id));
  for (let n = 1; ; n++) if (!used.has(`m${n}`)) return `m${n}`;
}

export function addMarker(markers: Marker[], time: number, name: string, color: TrackColor = "orange"): Marker[] {
  const existing = markers.find((marker) => Math.abs(marker.time - time) < 0.001);
  if (existing) return markers;
  const id = nextMarkerId(markers);
  return sortMarkers([...markers, { id, time: round(Math.max(0, time)), name: name.slice(0, 80), color }]);
}

export function updateMarker(markers: Marker[], id: string, patch: Partial<Omit<Marker, "id">>): Marker[] {
  return sortMarkers(
    markers.map((marker) =>
      marker.id === id
        ? {
            ...marker,
            ...patch,
            time: patch.time === undefined ? marker.time : round(Math.max(0, patch.time)),
            name: patch.name === undefined ? marker.name : patch.name.slice(0, 80),
          }
        : marker,
    ),
  );
}

export function removeMarker(markers: Marker[], id: string): Marker[] {
  return markers.filter((marker) => marker.id !== id);
}

/** The markers' times, for timeline snapping. */
export function markerSnapTimes(markers: Marker[]): number[] {
  return markers.map((marker) => marker.time);
}
