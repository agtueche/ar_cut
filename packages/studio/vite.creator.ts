// Hyperframes Creator's dev-server plugin: mounts /api/creator/* ahead of the
// Studio API. Projects live in the Creator workspace (HYPERFRAMES_CREATOR_HOME),
// which the Studio dev server also uses as its data directory.

import type { Plugin } from "vite";
import { resolve } from "node:path";
import { readNodeRequestBody } from "./vite.request-body.js";
import { findSystemChrome } from "./vite.browser";
import { handleCreatorRequest, type CreatorContext } from "./creator-server/router";
import { checkEnvironment } from "./creator-server/environment";
import { serveLibraryFile } from "./creator-server/sessionLibrary";
import {
  isRecordingKind,
  receiveRecording,
  serveRecordingFile,
} from "./creator-server/sessionRecordings";
import { fetchStockItem, isStockKind, streamStockFile } from "./creator-server/sessionStock";
import {
  CREATOR_HOME_ENV,
  createWorkspace,
  defaultCreatorHome,
  type CreatorWorkspace,
} from "./creator-server/workspace";

const PREFIX = "/api/creator";
const MAX_BODY_BYTES = 256 * 1024;

export function resolveCreatorWorkspace(env: NodeJS.ProcessEnv = process.env): CreatorWorkspace {
  return createWorkspace(env[CREATOR_HOME_ENV] || defaultCreatorHome());
}

function parseJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** No Origin header (same-origin GET-like tools, curl) or one naming this very host. */
function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function creatorApi(workspace: CreatorWorkspace): Plugin {
  const ctx: CreatorContext = {
    workspace,
    templatesDir: resolve(__dirname, "creator-templates"),
    findSystemChrome: () => findSystemChrome(),
  };
  return {
    name: "hyperframes-creator-api",
    configureServer(server): void {
      // Two routes the CLI host serves and Studio's UI probes; the dev server had neither.
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (req.method === "POST" && path === `${PREFIX}/recordings/upload`) {
          // « Enregistrements »: a take straight from MediaRecorder (raw audio/video body).
          if (!isSameOrigin(req.headers.origin, req.headers.host)) {
            sendJson(res, 403, { error: "Requête refusée." });
            return;
          }
          const kind = new URL(req.url ?? "", "http://localhost").searchParams.get("kind");
          void (async () => {
            if (!isRecordingKind(kind)) throw new Error("Type d'enregistrement invalide.");
            sendJson(res, 201, { path: await receiveRecording(ctx.workspace, kind, req) });
          })().catch((error: unknown) => {
            if (!res.headersSent)
              sendJson(res, 409, {
                error: error instanceof Error ? error.message : "Enregistrement impossible.",
              });
          });
          return;
        }
        if (req.method !== "GET") return next();
        if (path?.startsWith(`${PREFIX}/recordings/file/`)) {
          serveRecordingFile(
            ctx.workspace,
            decodeURIComponent(path.slice(`${PREFIX}/recordings/file/`.length)),
            req,
            res,
          );
          return;
        }
        if (path === "/api/open-in-desktop") {
          // The HeyGen desktop app hand-off is not part of Creator: hide its button.
          sendJson(res, 200, { available: false, handoff: false, downloadUrl: null });
          return;
        }
        const stockFile = path
          ? /^\/api\/creator\/stock\/file\/([a-z]+)\/([a-z]+)\/([A-Za-z0-9-]{1,64})$/.exec(path)
          : null;
        if (stockFile) {
          // « Banque libre de droits »: the file, re-fetched from its provider by id.
          const [, kind, provider, id] = stockFile;
          void (async () => {
            if (!isStockKind(kind)) throw new Error("Catégorie invalide.");
            const item = await fetchStockItem(kind, provider, id);
            await streamStockFile(item, res);
          })().catch((error: unknown) => {
            if (!res.headersSent)
              sendJson(res, 409, {
                error: error instanceof Error ? error.message : "Téléchargement impossible.",
              });
            else res.destroy();
          });
          return;
        }
        if (path?.startsWith(`${PREFIX}/library/file/`)) {
          // "Ma bibliothèque" media: streamed with byte ranges (audio/video seeking).
          const rel = decodeURIComponent(path.slice(`${PREFIX}/library/file/`.length));
          serveLibraryFile(ctx.workspace, rel, req, res);
          return;
        }
        if (path !== "/api/environment/ffmpeg") return next();
        void checkEnvironment(ctx.findSystemChrome)
          .then((checks) => {
            const failed = checks.find(
              (check) =>
                (check.id === "ffmpeg" || check.id === "ffprobe") && check.status === "missing",
            );
            sendJson(
              res,
              200,
              failed
                ? {
                    ok: false,
                    title: `${failed.id} introuvable`,
                    detail: failed.detail,
                    command: "brew install ffmpeg",
                  }
                : { ok: true },
            );
          })
          .catch(() => sendJson(res, 500, { error: "Vérification de FFmpeg impossible." }));
      });

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) return next();
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname.slice(PREFIX.length) || "/";
        const method = req.method ?? "GET";
        void (async () => {
          let body: unknown = null;
          if (method !== "GET" && method !== "HEAD") {
            // Only this app may change projects: a page on another site cannot
            // send JSON here without a CORS preflight this server never answers.
            const isJson = (req.headers["content-type"] ?? "").startsWith("application/json");
            if (
              !isSameOrigin(req.headers.origin, req.headers.host) ||
              (method === "POST" && !isJson)
            ) {
              sendJson(res, 403, { error: "Requête refusée." });
              return;
            }
            const bytes = await readNodeRequestBody(req);
            if (bytes.byteLength > MAX_BODY_BYTES) {
              res.writeHead(413, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Requête trop volumineuse." }));
              return;
            }
            body = parseJson(bytes);
            if (body === undefined) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Corps JSON invalide." }));
              return;
            }
          }
          const result = await handleCreatorRequest(ctx, method, path, body);
          res.writeHead(result.status, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(result.body));
        })().catch((error: unknown) => {
          console.error("[Creator API]", error);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Erreur interne du serveur Creator." }));
          }
        });
      });
    },
  };
}
