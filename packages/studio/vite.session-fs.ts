import type { Plugin } from "vite";
import { resolve } from "node:path";

/** Confine the in-memory filesystem to Studio's SSR graph. No source files in the engine are changed. */
export function studioSessionFs(): Plugin {
  const facade = resolve(__dirname, "creator-server/sessionFs");
  return {
    name: "studio-session-filesystem",
    enforce: "pre",
    transform(code, id, options) {
      if (
        !options?.ssr ||
        !id.includes("/packages/") ||
        id.includes("/node_modules/") ||
        id.includes("/creator-server/session")
      )
        return null;
      const next = code.replace(
        /(from\s*["'])(?:node:)?fs(\/promises)?(["'])/g,
        (_match, before: string, promises: string | undefined, after: string) =>
          `${before}${facade}${promises ? "Promises" : ""}.ts${after}`,
      );
      return next === code ? null : { code: next, map: null };
    },
  };
}
