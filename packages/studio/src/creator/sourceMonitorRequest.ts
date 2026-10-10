// Lets any panel ask the source monitor to show a media (e.g. the media panel's
// right-click « Ouvrir dans le moniteur source »). A tiny external store: the
// request carries a counter so asking twice for the same file still reaches it.
import { useSyncExternalStore } from "react";

export interface SourceMonitorRequest {
  path: string;
  seq: number;
}

let current: SourceMonitorRequest | null = null;
const listeners = new Set<() => void>();

export function openInSourceMonitor(path: string): void {
  current = { path, seq: (current?.seq ?? 0) + 1 };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The last request (tests and non-React callers). */
export function readSourceMonitorRequest(): SourceMonitorRequest | null {
  return current;
}

export function useSourceMonitorRequest(): SourceMonitorRequest | null {
  return useSyncExternalStore(subscribe, () => current);
}
