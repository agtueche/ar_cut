const RENDER_SETTINGS_KEY = "hf-studio-render-settings";

/** Frame rates the export offers; 25 and 50 are the PAL/broadcast rates. */
export const RENDER_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;
export type RenderFps = (typeof RENDER_FPS_OPTIONS)[number];

export function isRenderFps(value: unknown): value is RenderFps {
  return (RENDER_FPS_OPTIONS as readonly unknown[]).includes(value);
}

export interface PersistedRenderSettings {
  format: "mp4" | "webm" | "mov";
  quality: "draft" | "standard" | "high";
  fps: RenderFps;
}

export function getPersistedRenderSettings(): PersistedRenderSettings {
  try {
    const raw = localStorage.getItem(RENDER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        format: ["mp4", "webm", "mov"].includes(parsed.format) ? parsed.format : "mp4",
        quality: ["draft", "standard", "high"].includes(parsed.quality)
          ? parsed.quality
          : "standard",
        fps: isRenderFps(parsed.fps) ? parsed.fps : 30,
      };
    }
  } catch {
    /* ignore */
  }
  return { format: "mp4", quality: "standard", fps: 30 };
}

export function persistRenderSettings(
  format: PersistedRenderSettings["format"],
  quality: PersistedRenderSettings["quality"],
  fps: PersistedRenderSettings["fps"],
): void {
  try {
    localStorage.setItem(RENDER_SETTINGS_KEY, JSON.stringify({ format, quality, fps }));
  } catch {
    /* ignore */
  }
}
