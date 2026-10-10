// Media panel view settings: layout (thumbnails / list), sort, and the media
// dates and durations the sort needs. Pure helpers are unit-tested.

import { useEffect, useState } from "react";
import { mediaInfoApi, type MediaInfo } from "../../creator/creatorApi";
import { basename, getCategory, type MediaCategory } from "./assetHelpers";

export type MediaLayout = "large" | "small" | "list";
export type MediaSortKey = "imported" | "created" | "name" | "type" | "duration";
export type MediaSortOrder = "asc" | "desc";

export interface MediaViewSettings {
  layout: MediaLayout;
  sortKey: MediaSortKey;
  sortOrder: MediaSortOrder;
}

export const DEFAULT_VIEW: MediaViewSettings = {
  layout: "large",
  sortKey: "imported",
  sortOrder: "asc",
};

const TYPE_RANK: Record<MediaCategory, number> = { video: 0, images: 1, audio: 2, fonts: 3 };
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * Orders asset paths by the chosen key. Missing dates or durations sort last in
 * either order; ties fall back to the name so the order is stable. Pure.
 */
export function sortAssets(
  assets: readonly string[],
  info: ReadonlyMap<string, MediaInfo>,
  key: MediaSortKey,
  order: MediaSortOrder,
): string[] {
  const value = (path: string): number | string | null => {
    const meta = info.get(path);
    switch (key) {
      case "imported":
        return meta?.importedAt ?? null;
      case "created":
        return meta?.createdAt ?? null;
      case "duration":
        return meta?.duration ?? null;
      case "type": {
        const cat = getCategory(path);
        return cat ? TYPE_RANK[cat] : 9;
      }
      case "name":
        return basename(path);
    }
  };
  const sign = order === "asc" ? 1 : -1;
  return [...assets].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    let diff = 0;
    if (typeof va === "string" && typeof vb === "string") diff = collator.compare(va, vb);
    else if (typeof va === "number" && typeof vb === "number") diff = va - vb;
    return diff !== 0 ? diff * sign : collator.compare(basename(a), basename(b));
  });
}

const STORAGE_KEY = "arcut-media-view";

function isSettings(value: unknown): value is MediaViewSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ["large", "small", "list"].includes(String(v.layout)) &&
    ["imported", "created", "name", "type", "duration"].includes(String(v.sortKey)) &&
    ["asc", "desc"].includes(String(v.sortOrder))
  );
}

/** Layout and sort, remembered per browser (a convenience: falls back to defaults). */
export function useMediaViewSettings(): [
  MediaViewSettings,
  (patch: Partial<MediaViewSettings>) => void,
] {
  const [settings, setSettings] = useState<MediaViewSettings>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      return isSettings(saved) ? saved : DEFAULT_VIEW;
    } catch {
      return DEFAULT_VIEW;
    }
  });
  const update = (patch: Partial<MediaViewSettings>) =>
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice lasts for this page only */
      }
      return next;
    });
  return [settings, update];
}

/** Dates and durations of the project's media, refetched when the asset list changes. */
export function useMediaInfo(projectId: string, assetsKey: string): ReadonlyMap<string, MediaInfo> {
  const [info, setInfo] = useState<ReadonlyMap<string, MediaInfo>>(new Map());
  useEffect(() => {
    let cancelled = false;
    mediaInfoApi
      .list(projectId)
      .then((r) => {
        if (!cancelled) setInfo(new Map(r.media.map((m) => [m.path, m])));
      })
      .catch(() => {
        /* Sorting by date or duration then falls back to the name. */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, assetsKey]);
  return info;
}
