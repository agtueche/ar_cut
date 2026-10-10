// Sends the marked section of the source monitor to the timeline, at the playhead,
// through Studio's writer and history (one undo step), like every other edit.
import { usePlayerStore } from "../../player/store/playerStore";
import { generateId } from "../../utils/generateId";
import { collectHtmlIds, resolveDroppedAssetHasAudio } from "../../utils/studioHelpers";
import {
  buildTimelineAssetId,
  buildTimelineAssetInsertHtml,
  fitTimelineAssetGeometry,
  getTimelineAssetKind,
  insertTimelineAssetIntoSource,
  resolveTimelineAssetCompositionSize,
  resolveTimelineAssetSrc,
} from "../../utils/timelineAssetDrop";
import { extendRootDurationInSource } from "../../utils/rootDuration";
import { deriveTimelineStoreKeyForDomId } from "../../player/lib/timelineElementHelpers";
import { selectAndRevealTimelineElement } from "../../player/components/timelineDropReveal";
import type { StudioBridge } from "../studioBridge";
import { makeRoomForSection, withMediaStart, type SectionEditMode } from "./sourceSectionEdit";

/** What the monitor sends: picture and sound, picture only, or sound only. */
export type SourceStreams = "both" | "video" | "audio";

export interface SourceSectionRequest {
  path: string;
  start: number;
  end: number;
  streams: SourceStreams;
  mode: SectionEditMode;
  track: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export async function commitSourceSection(
  bridge: StudioBridge,
  request: SourceSectionRequest,
): Promise<{ id: string; keptInPlace: string[] }> {
  if (bridge.writeBlockedReason) throw new Error(bridge.writeBlockedReason);
  const rawKind = getTimelineAssetKind(request.path);
  if (!rawKind) throw new Error("Seuls les images, vidéos et sons peuvent aller dans la timeline.");
  const kind = request.streams === "audio" && rawKind === "video" ? "audio" : rawKind;
  const duration = round(request.end - request.start);
  if (!(duration > 0)) throw new Error("La section est vide : placez une entrée avant la sortie.");

  await bridge.waitForPendingSaves();
  const target = bridge.activeCompPath || "index.html";
  const before = await bridge.readProjectFile(target);
  const playhead = round(usePlayerStore.getState().currentTime);
  const taken = new Set(collectHtmlIds(before));
  const room = makeRoomForSection(before, {
    start: playhead,
    duration,
    track: request.track,
    mode: request.mode,
    takenIds: taken,
  });
  const id = buildTimelineAssetId(request.path, taken);
  const hasAudio =
    rawKind === "video" && request.streams === "both"
      ? await resolveDroppedAssetHasAudio(bridge.projectId, request.path, "video")
      : false;
  const zIndex = (before.match(/\bdata-start=/g)?.length ?? 0) + 1;
  const clip = withMediaStart(
    buildTimelineAssetInsertHtml({
      id,
      hfId: `hf-${generateId()}`,
      assetPath: resolveTimelineAssetSrc(target, request.path),
      kind,
      start: playhead,
      duration,
      track: request.track,
      zIndex,
      hasAudio,
      geometry: fitTimelineAssetGeometry(null, resolveTimelineAssetCompositionSize(before)),
    }),
    kind === "image" ? 0 : request.start,
  );
  const after = extendRootDurationInSource(
    insertTimelineAssetIntoSource(room.source, clip),
    playhead + duration,
  );
  await bridge.writeProjectFile(target, after, before);
  await bridge.recordEdit({
    label:
      request.mode === "insert"
        ? "Insérer depuis le moniteur source"
        : "Écraser depuis le moniteur source",
    files: { [target]: { before, after } },
  });
  bridge.reloadSdkSession();
  bridge.reloadPreview();
  selectAndRevealTimelineElement(deriveTimelineStoreKeyForDomId(id, target));
  return { id, keptInPlace: room.keptInPlace };
}
