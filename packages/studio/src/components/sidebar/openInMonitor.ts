// A click on a media of the library opens it in the source monitor (and brings
// the monitor to the front) — the editor's way to preview before the timeline.
import { openInSourceMonitor } from "../../creator/sourceMonitorRequest";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { useDockLayoutStore } from "../dock/dockLayoutStore";

export function openAssetInSourceMonitor(asset: string): void {
  // The old floating preview is replaced by the monitor: never leave both open.
  useAssetPreviewStore.getState().clearPreviewAsset();
  openInSourceMonitor(asset);
  useDockLayoutStore.getState().activatePanel("source");
}
