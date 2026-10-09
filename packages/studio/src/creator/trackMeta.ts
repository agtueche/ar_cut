// Track settings (name, colour) for the timeline. Studio has no track object:
// a track is every element sharing a data-track-index, and those indices are
// renumbered when layers are reordered. So the settings live on the clips
// themselves, like Studio's own track hide (data-hidden on every member) and
// lock (data-timeline-locked, which the engine already honours): they follow
// renumbering for free, survive save and reopen, and travel with copied clips.

export const TRACK_NAME_ATTR = "data-track-name";
export const TRACK_COLOR_ATTR = "data-track-color";
export const TRACK_LOCK_ATTR = "data-timeline-locked";

/** Colour keys, rendered with theme tokens (no colour literal in the UI). */
export const TRACK_COLORS = ["teal", "orange", "blue", "amber", "red", "gray"] as const;
export type TrackColor = (typeof TRACK_COLORS)[number];

export const TRACK_COLOR_CLASS: Record<TrackColor, string> = {
  teal: "bg-accent",
  orange: "bg-cta",
  blue: "bg-selection",
  amber: "bg-container",
  red: "bg-danger",
  gray: "bg-text-off",
};

export function isTrackColor(value: unknown): value is TrackColor {
  return typeof value === "string" && (TRACK_COLORS as readonly string[]).includes(value);
}

export interface TrackMemberAttributes {
  name?: string | null;
  color?: string | null;
  locked?: boolean;
}

export interface TrackMeta {
  name: string | null;
  color: TrackColor | null;
  /** Locked only when every clip is locked: a half-locked track reads as unlocked. */
  locked: boolean;
}

function mostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const value of values) {
    if (!value) continue;
    const next = (counts.get(value) ?? 0) + 1;
    counts.set(value, next);
    // Ties keep the earliest value, so a clip dragged in never renames the track.
    if (next > bestCount) {
      best = value;
      bestCount = next;
    }
  }
  return best;
}

/** The track's settings, read from its clips. */
export function resolveTrackMeta(members: TrackMemberAttributes[]): TrackMeta {
  const color = mostCommon(members.map((member) => member.color));
  return {
    name: mostCommon(members.map((member) => member.name?.trim() || null)),
    color: isTrackColor(color) ? color : null,
    locked: members.length > 0 && members.every((member) => member.locked === true),
  };
}

/** Names longer than this are cut: the header has room for about 30 characters. */
export const TRACK_NAME_MAX = 60;

export function normalizeTrackName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, TRACK_NAME_MAX);
  return name || null;
}
