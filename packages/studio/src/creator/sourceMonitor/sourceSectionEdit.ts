// Three-point editing from the source monitor, on the composition HTML.
//
// « Insérer » (,) puts the section at the playhead on the target track and pushes
// everything after it to the right (a clip under the playhead is cut in two).
// « Écraser » (.) puts it over whatever is there: covered clips are removed,
// partly covered ones are trimmed, a clip spanning the whole section is cut.
//
// Only media clips (img / video / audio) are cut or trimmed: a text, shape or
// scene in the way stops the edit with a message rather than being damaged.

export type SectionEditMode = "insert" | "overwrite";

export interface TrackClip {
  id: string;
  tag: string;
  start: number;
  duration: number;
  /** The element's full markup (opening tag, and closing tag for video/audio). */
  markup: string;
  index: number;
  track: number;
}

const ROUND = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  return m ? m[2] : null;
}

/** Sets (or adds) an attribute on the element's opening tag. */
export function setAttr(markup: string, name: string, value: string): string {
  const open = /^<[^>]*>/.exec(markup)?.[0] ?? markup;
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  const next = re.test(open)
    ? open.replace(re, `$1$2${value}$2`)
    : open.replace(/\s*(\/?)>$/, ` ${name}="${value}"$1>`);
  return next + markup.slice(open.length);
}

/** Media clips of one track, in time order. Other timed elements are reported as blockers. */
/** Media and other timed clips of one track (or of every track with `null`), in time order. */
export function clipsOnTrack(source: string, track: number | null): TrackClip[] {
  const clips: TrackClip[] = [];
  const re = /<(img|video|audio|div|section|span|p|h[1-6]|svg|canvas)\b[^>]*>/gi;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const open = m[0];
    const id = attr(open, "id");
    const start = Number(attr(open, "data-start"));
    const duration = Number(attr(open, "data-duration"));
    const t = Number(attr(open, "data-track-index") ?? "0");
    if (!id || !Number.isFinite(start) || !Number.isFinite(duration)) continue;
    if (track !== null && t !== track) continue;
    if (attr(open, "data-composition-id") && attr(open, "data-composition-src") == null) continue;
    const tag = m[1].toLowerCase();
    let markup = open;
    if (tag === "video" || tag === "audio") {
      const close = source.indexOf(`</${tag}>`, m.index + open.length);
      if (close !== -1) markup = source.slice(m.index, close + tag.length + 3);
    }
    clips.push({ id, tag, start, duration, markup, index: m.index, track: t });
  }
  return clips.sort((a, b) => a.start - b.start);
}

function isMedia(clip: TrackClip): boolean {
  return clip.tag === "img" || clip.tag === "video" || clip.tag === "audio";
}

function rateOf(markup: string): number {
  const r = Number(attr(markup, "data-playback-rate"));
  return Number.isFinite(r) && r > 0 ? r : 1;
}

function mediaStartOf(markup: string): number {
  const v = Number(attr(markup, "data-media-start"));
  return Number.isFinite(v) ? v : 0;
}

/** The clip with its first `cut` seconds removed (start moves, source advances). */
function trimHead(markup: string, clip: TrackClip, cut: number): string {
  let next = setAttr(markup, "data-start", String(ROUND(clip.start + cut)));
  next = setAttr(next, "data-duration", String(ROUND(clip.duration - cut)));
  if (clip.tag !== "img") {
    next = setAttr(
      next,
      "data-media-start",
      String(ROUND(mediaStartOf(markup) + cut * rateOf(markup))),
    );
  }
  return next;
}

function uniqueId(base: string, taken: Set<string>): string {
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Second half of a clip cut at `at`, as new markup with its own id. */
function splitTail(clip: TrackClip, at: number, taken: Set<string>): string {
  let tail = setAttr(clip.markup, "id", uniqueId(clip.id, taken));
  tail = tail.replace(/\sdata-hf-id\s*=\s*(["']).*?\1/i, "");
  return trimHead(tail, clip, at - clip.start);
}

function replaceAll(source: string, edits: Array<{ from: string; to: string }>): string {
  let out = source;
  for (const { from, to } of edits) {
    const at = out.indexOf(from);
    if (at === -1) throw new Error("Le montage a changé pendant l'opération : réessayez.");
    out = out.slice(0, at) + to + out.slice(at + from.length);
  }
  return out;
}

export interface SectionEditResult {
  source: string;
  /** Clips moved, trimmed, cut or removed, for the confirmation message. */
  touched: number;
  /** Texts or scenes of other tracks left in place because they cannot be cut. */
  keptInPlace: string[];
}

/**
 * Makes room for a section of `duration` seconds at `start` on `track`
 * (the new clip itself is added by the caller).
 */
export function makeRoomForSection(
  source: string,
  options: {
    start: number;
    duration: number;
    track: number;
    mode: SectionEditMode;
    takenIds: Set<string>;
  },
): SectionEditResult {
  const { start, duration, track, mode, takenIds } = options;
  const end = start + duration;
  const clips = clipsOnTrack(source, track);
  const edits: Array<{ from: string; to: string }> = [];
  let touched = 0;

  const blocker = (clip: TrackClip) =>
    new Error(
      `« ${clip.id} » (${clip.tag}) occupe cet endroit de la piste et ne peut pas être coupé : choisissez une autre piste ou déplacez la tête de lecture.`,
    );

  if (mode === "insert") {
    // Every track moves together (« sync lock » of video editors): a voice or a
    // subtitle stays in front of its picture. What spans the playhead is cut;
    // a text or a scene on another track cannot be cut and stays where it is.
    const keptInPlace: string[] = [];
    for (const clip of clipsOnTrack(source, null)) {
      const clipEnd = clip.start + clip.duration;
      if (clip.start < start - EPS && clipEnd > start + EPS) {
        if (!isMedia(clip)) {
          if (clip.track === track) throw blocker(clip);
          keptInPlace.push(clip.id);
          continue;
        }
        const head = setAttr(clip.markup, "data-duration", String(ROUND(start - clip.start)));
        const second = setAttr(splitTail(clip, start, takenIds), "data-start", String(ROUND(end)));
        edits.push({ from: clip.markup, to: `${head}\n${second}` });
        touched++;
      } else if (clip.start >= start - EPS) {
        edits.push({
          from: clip.markup,
          to: setAttr(clip.markup, "data-start", String(ROUND(clip.start + duration))),
        });
        touched++;
      }
    }
    return { source: replaceAll(source, edits), touched, keptInPlace };
  }

  for (const clip of clips) {
    const clipEnd = clip.start + clip.duration;
    if (clipEnd <= start + EPS || clip.start >= end - EPS) continue;
    if (!isMedia(clip)) throw blocker(clip);
    touched++;
    if (clip.start >= start - EPS && clipEnd <= end + EPS) {
      edits.push({ from: clip.markup, to: "" });
    } else if (clip.start < start - EPS && clipEnd > end + EPS) {
      const head = setAttr(clip.markup, "data-duration", String(ROUND(start - clip.start)));
      edits.push({ from: clip.markup, to: `${head}\n${splitTail(clip, end, takenIds)}` });
    } else if (clip.start < start - EPS) {
      edits.push({
        from: clip.markup,
        to: setAttr(clip.markup, "data-duration", String(ROUND(start - clip.start))),
      });
    } else {
      edits.push({ from: clip.markup, to: trimHead(clip.markup, clip, end - clip.start) });
    }
  }
  return { source: replaceAll(source, edits), touched, keptInPlace: [] };
}

/** Adds the source range to a freshly built clip tag (`buildTimelineAssetInsertHtml`). */
export function withMediaStart(markup: string, mediaStart: number): string {
  return mediaStart > 0 ? setAttr(markup, "data-media-start", String(ROUND(mediaStart))) : markup;
}
