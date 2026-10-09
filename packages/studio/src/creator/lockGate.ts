// Track lock enforcement. Studio's engine already refuses to move, trim or
// split a clip carrying data-timeline-locked; this gate is the host
// `canEdit` that also refuses deleting, cutting, pasting over, freezing or
// any other guarded timeline edit on a locked clip, with a reason to show.
// The track settings themselves (unlock, rename, colour) must still be able
// to write on locked clips: they run inside `allowingLockedTrackEdit`.

import type { TimelineEditPermission } from "../hooks/timelineEditPermission";
import type { TimelineElement } from "../player/store/timelineElement";
import { getLocale, translate } from "./i18n";

let bypassDepth = 0;

export function lockedClipGate(element: TimelineElement): TimelineEditPermission {
  if (bypassDepth > 0 || element.timelineLocked !== true) return true;
  return { blocked: true, reason: translate(getLocale(), "track.lockedRefusal") };
}

/**
 * Runs a track-settings write that is allowed on locked clips. The guard reads
 * the gate synchronously when the edit starts, so the bypass only needs to
 * cover that first call.
 */
export async function allowingLockedTrackEdit<T>(write: () => Promise<T>): Promise<T> {
  bypassDepth += 1;
  let pending: Promise<T>;
  try {
    pending = write();
  } finally {
    bypassDepth -= 1;
  }
  return pending;
}
