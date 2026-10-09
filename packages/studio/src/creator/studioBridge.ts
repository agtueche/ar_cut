// The handful of Studio internals Creator's editor panels need, published by
// StudioApp while a project is open. Creator writes compositions through the
// same writer, history and reload paths as Studio's own edits, so an insert is
// saved atomically, version-checked, labelled in the history and undoable.

import { useEffect, useSyncExternalStore } from "react";
import type { RecordEditInput } from "../utils/studioFileHistory";

export interface StudioBridge {
  projectId: string;
  activeCompPath: string | null;
  /** Project-relative image paths, for the logo/image insert. */
  imageAssets: string[];
  writeBlockedReason: string | null;
  /** Resolves once Studio's own in-flight canvas saves are on disk, so an insert reads their result. */
  waitForPendingSaves: () => Promise<void>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  reloadSdkSession: () => void;
  showToast: (message: string, tone?: "error" | "info") => void;
}

let current: StudioBridge | null = null;
const listeners = new Set<() => void>();

function publish(next: StudioBridge | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStudioBridge(): StudioBridge | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

interface StudioBridgeSources {
  ctx: {
    projectId: string;
    activeCompPath: string | null;
    writeBlockedReason: string | null;
    showToast: StudioBridge["showToast"];
    waitForPendingDomEditSaves: () => Promise<void>;
  };
  files: {
    assets: readonly string[];
    readProjectFile: StudioBridge["readProjectFile"];
    writeProjectFile: StudioBridge["writeProjectFile"];
  };
  history: { recordEdit: StudioBridge["recordEdit"] };
  sdk: { forceReload: () => void };
}

/**
 * Called by StudioApp on every render with its own objects; republishes only
 * when the data a panel reads changed (the functions are stable handlers).
 */
export function usePublishStudioBridge(
  ctx: StudioBridgeSources["ctx"],
  files: StudioBridgeSources["files"],
  history: StudioBridgeSources["history"],
  sdk: StudioBridgeSources["sdk"],
  reloadPreview: () => void,
): void {
  const imageKey = files.assets.filter((path) => IMAGE_FILE.test(path)).join("\n");
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    publish({
      projectId: ctx.projectId,
      activeCompPath: ctx.activeCompPath,
      writeBlockedReason: ctx.writeBlockedReason,
      waitForPendingSaves: ctx.waitForPendingDomEditSaves,
      imageAssets: imageKey ? imageKey.split("\n") : [],
      readProjectFile: files.readProjectFile,
      writeProjectFile: files.writeProjectFile,
      recordEdit: history.recordEdit,
      reloadPreview,
      reloadSdkSession: sdk.forceReload,
      showToast: ctx.showToast,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.projectId, ctx.activeCompPath, ctx.writeBlockedReason, imageKey]);
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => () => publish(null), []);
}

export { lockedClipGate } from "./lockGate";
