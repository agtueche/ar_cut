import type { SerializedDockview } from "dockview-react";
import { parseDockLayout } from "./dockLayoutSchema";

export interface WorkspacePreset {
  name: string;
  layout: SerializedDockview;
}
const KEY = "hf-studio-workspaces-v1";

export function readWorkspacePresets(storage: Pick<Storage, "getItem">): WorkspacePreset[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || !("name" in item) || !("layout" in item)) return [];
      const layout = parseDockLayout(item.layout);
      return typeof item.name === "string" && item.name.trim() && layout
        ? [{ name: item.name.trim().slice(0, 80), layout }]
        : [];
    });
  } catch {
    return [];
  }
}

/** Only called by an explicit save, rename or delete action. Propagate quota failures to the UI. */
export function writeWorkspacePresets(
  storage: Pick<Storage, "setItem">,
  presets: WorkspacePreset[],
) {
  storage.setItem(KEY, JSON.stringify(presets));
}
