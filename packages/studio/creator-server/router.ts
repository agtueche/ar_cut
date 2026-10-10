// /api/creator/* — a small router kept free of HTTP plumbing so it can be
// tested directly. The Vite plugin (vite.creator.ts) adapts Node requests to it.

import { randomUUID } from "node:crypto";
import { assetDetails, extractAssetAudio, revealAsset } from "./sessionAssetActions";
import { type AssistantSelection, buildAssistantPrompt } from "./assistantPrompt";
import { checkEnvironment } from "./environment";
import {
  addFolderItem,
  createFolder,
  deleteFolder,
  readFolders,
  removeFolderItem,
  updateFolder,
} from "./folders";
import { readManifest, writeManifest } from "./projectMeta";
import {
  CreatorError,
  createProject,
  duplicateProject,
  listExports,
  listProjects,
  listTrash,
  markOpened,
  purgeTrashEntry,
  updateProject,
  restoreProject,
  summarizeProject,
  trashProject,
  validateCreateInput,
} from "./projectOps";
import { addToLibrary, listLibrary, removeFromLibrary } from "./sessionLibrary";
import { readMediaInfo } from "./sessionMediaInfo";
import {
  enhanceRecording,
  listRecordings,
  recordingToLibrary,
  removeRecording,
} from "./sessionRecordings";
import {
  downloadToLibrary,
  fetchStockItem,
  isStockKind,
  readCredits,
  recordProjectCredit,
  searchStock,
} from "./sessionStock";
import { listTemplates, publicTemplate } from "./templates";
import { type CreatorWorkspace, projectDirFor } from "./workspace";

export interface CreatorContext {
  workspace: CreatorWorkspace;
  templatesDir: string;
  findSystemChrome: () => string | undefined;
}

export interface CreatorResponse {
  status: number;
  body: unknown;
}

const MAX_ASSISTANT_HISTORY = 50;

function ok(body: unknown, status = 200): CreatorResponse {
  return { status, body };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function parseSelection(value: unknown): AssistantSelection | null {
  const raw = record(value);
  if (typeof raw.label !== "string") return null;
  const dataAttributes: Record<string, string> = {};
  for (const [key, attr] of Object.entries(record(raw.dataAttributes))) {
    if (typeof attr === "string") dataAttributes[key] = attr;
  }
  return {
    label: raw.label,
    tagName: typeof raw.tagName === "string" ? raw.tagName : undefined,
    id: typeof raw.id === "string" ? raw.id : null,
    hfId: typeof raw.hfId === "string" ? raw.hfId : undefined,
    textContent: typeof raw.textContent === "string" ? raw.textContent : null,
    dataAttributes,
  };
}

function prepareAssistantPrompt(ctx: CreatorContext, id: string, raw: unknown): CreatorResponse {
  const body = record(raw);
  const request = typeof body.request === "string" ? body.request.trim().slice(0, 4000) : "";
  if (!request) throw new CreatorError("Décrivez ce que vous voulez modifier.");
  const project = summarizeProject(ctx.workspace, id);
  const dir = projectDirFor(ctx.workspace, id);
  if (!project || !dir) throw new CreatorError("Projet introuvable.", 404);
  const compositionPath =
    typeof body.compositionPath === "string" && body.compositionPath
      ? body.compositionPath
      : "index.html";
  const currentTime = typeof body.currentTime === "number" ? body.currentTime : null;
  const selection = parseSelection(body.selection);
  const prompt = buildAssistantPrompt({
    project,
    projectDir: dir,
    compositionPath,
    request,
    currentTime,
    selection,
  });
  const manifest = readManifest(dir, id);
  const entry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    compositionPath,
    selectionLabel: selection?.label ?? null,
  };
  writeManifest(dir, {
    ...manifest,
    assistant: [entry, ...manifest.assistant].slice(0, MAX_ASSISTANT_HISTORY),
  });
  return ok({ prompt, entry });
}

function assistantHistory(ctx: CreatorContext, id: string): CreatorResponse {
  const dir = projectDirFor(ctx.workspace, id);
  if (!dir || !summarizeProject(ctx.workspace, id)) {
    throw new CreatorError("Projet introuvable.", 404);
  }
  return ok({ entries: readManifest(dir, id).assistant });
}

type Handler = (ctx: CreatorContext, params: string[], body: unknown) => Promise<CreatorResponse>;

const ROUTES: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  {
    method: "GET",
    pattern: /^\/workspace$/,
    handler: async (ctx) =>
      ok({ home: ctx.workspace.home, projectsDir: ctx.workspace.projectsDir }),
  },
  {
    method: "GET",
    pattern: /^\/projects$/,
    handler: async (ctx) => ok({ projects: listProjects(ctx.workspace) }),
  },
  {
    method: "POST",
    pattern: /^\/projects$/,
    handler: async (ctx, _p, body) =>
      ok(
        { project: createProject(ctx.workspace, ctx.templatesDir, validateCreateInput(body)) },
        201,
      ),
  },
  {
    method: "PATCH",
    pattern: /^\/projects\/([^/]+)$/,
    handler: async (ctx, [id], body) =>
      ok({ project: updateProject(ctx.workspace, id, record(body)) }),
  },
  {
    method: "DELETE",
    pattern: /^\/projects\/([^/]+)$/,
    handler: async (ctx, [id]) => ok({ trashed: trashProject(ctx.workspace, id) }),
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/duplicate$/,
    handler: async (ctx, [id]) => ok({ project: duplicateProject(ctx.workspace, id) }, 201),
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/opened$/,
    handler: async (ctx, [id]) => {
      markOpened(ctx.workspace, id);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/projects\/([^/]+)\/assistant$/,
    handler: async (ctx, [id]) => assistantHistory(ctx, id ?? ""),
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/assistant\/prompt$/,
    handler: async (ctx, [id], body) => prepareAssistantPrompt(ctx, id ?? "", body),
  },
  {
    method: "GET",
    pattern: /^\/trash$/,
    handler: async (ctx) => ok({ entries: listTrash(ctx.workspace) }),
  },
  {
    method: "POST",
    pattern: /^\/trash\/([^/]+)\/restore$/,
    handler: async (ctx, [trashId]) => ok({ project: restoreProject(ctx.workspace, trashId) }),
  },
  {
    method: "DELETE",
    pattern: /^\/trash\/([^/]+)$/,
    handler: async (ctx, [trashId]) => {
      purgeTrashEntry(ctx.workspace, trashId);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/templates$/,
    handler: async (ctx) => ok({ templates: listTemplates(ctx.templatesDir).map(publicTemplate) }),
  },
  {
    method: "GET",
    pattern: /^\/exports$/,
    handler: async (ctx) => ok({ exports: listExports(ctx.workspace) }),
  },
  {
    method: "GET",
    pattern: /^\/projects\/([^/]+)\/media-info$/,
    handler: async (ctx, [id]) => {
      const dir = projectDirFor(ctx.workspace, id ?? "");
      if (!dir || !summarizeProject(ctx.workspace, id ?? "")) {
        throw new CreatorError("Projet introuvable.", 404);
      }
      return ok({ media: await readMediaInfo(dir) });
    },
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/media\/reveal$/,
    handler: async (ctx, [id], body) => {
      revealAsset(ctx.workspace, id ?? "", record(body).path);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/media\/details$/,
    handler: async (ctx, [id], body) =>
      ok({ details: await assetDetails(ctx.workspace, id ?? "", record(body).path) }),
  },
  {
    method: "POST",
    pattern: /^\/projects\/([^/]+)\/media\/extract-audio$/,
    handler: async (ctx, [id], body) =>
      ok({ path: await extractAssetAudio(ctx.workspace, id ?? "", record(body).path) }, 201),
  },
  {
    method: "GET",
    pattern: /^\/library$/,
    handler: async (ctx) => ok({ items: await listLibrary(ctx.workspace) }),
  },
  {
    method: "POST",
    pattern: /^\/library\/items$/,
    handler: async (ctx, _p, body) => ok({ path: addToLibrary(ctx.workspace, body) }, 201),
  },
  {
    method: "POST",
    pattern: /^\/library\/remove$/,
    handler: async (ctx, _p, body) => {
      removeFromLibrary(ctx.workspace, body);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: /^\/stock\/search$/,
    handler: async (_ctx, _p, body) => {
      const b = record(body);
      if (!isStockKind(b.kind)) throw new CreatorError("Catégorie invalide.");
      return ok(await searchStock(b.kind, b.query, b.page));
    },
  },
  {
    method: "POST",
    pattern: /^\/stock\/library$/,
    handler: async (ctx, _p, body) => {
      const b = record(body);
      if (!isStockKind(b.kind)) throw new CreatorError("Catégorie invalide.");
      const item = await fetchStockItem(b.kind, b.provider, b.id);
      return ok({ path: await downloadToLibrary(ctx.workspace, item) }, 201);
    },
  },
  {
    method: "POST",
    pattern: /^\/stock\/credit$/,
    handler: async (ctx, _p, body) => {
      const b = record(body);
      if (!isStockKind(b.kind)) throw new CreatorError("Catégorie invalide.");
      const item = await fetchStockItem(b.kind, b.provider, b.id);
      recordProjectCredit(ctx.workspace, b.projectId, b.file, item);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/projects\/([^/]+)\/credits$/,
    handler: async (ctx, [id]) => {
      const dir = projectDirFor(ctx.workspace, id ?? "");
      if (!dir) throw new CreatorError("Projet introuvable.", 404);
      return ok({ credits: readCredits(dir) });
    },
  },
  {
    method: "GET",
    pattern: /^\/recordings$/,
    handler: async (ctx) => ok({ items: await listRecordings(ctx.workspace) }),
  },
  {
    method: "POST",
    pattern: /^\/recordings\/enhance$/,
    handler: async (ctx, _p, body) => {
      const b = record(body);
      return ok({ path: await enhanceRecording(ctx.workspace, b.path, b.options) }, 201);
    },
  },
  {
    method: "POST",
    pattern: /^\/recordings\/to-library$/,
    handler: async (ctx, _p, body) =>
      ok({ path: recordingToLibrary(ctx.workspace, record(body).path) }, 201),
  },
  {
    method: "POST",
    pattern: /^\/recordings\/remove$/,
    handler: async (ctx, _p, body) => {
      removeRecording(ctx.workspace, record(body).path);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/folders$/,
    handler: async (ctx) => ok({ folders: readFolders(ctx.workspace) }),
  },
  {
    method: "POST",
    pattern: /^\/folders$/,
    handler: async (ctx, _p, body) => ok({ folder: createFolder(ctx.workspace, body) }, 201),
  },
  {
    method: "PATCH",
    pattern: /^\/folders\/([^/]+)$/,
    handler: async (ctx, [id], body) => ok({ folder: updateFolder(ctx.workspace, id ?? "", body) }),
  },
  {
    method: "DELETE",
    pattern: /^\/folders\/([^/]+)$/,
    handler: async (ctx, [id]) => ok({ deleted: deleteFolder(ctx.workspace, id ?? "") }),
  },
  {
    method: "POST",
    pattern: /^\/folders\/([^/]+)\/items$/,
    handler: async (ctx, [id], body) =>
      ok({ folder: addFolderItem(ctx.workspace, id ?? "", body) }),
  },
  {
    method: "POST",
    pattern: /^\/folders\/([^/]+)\/items\/remove$/,
    handler: async (ctx, [id], body) =>
      ok({ folder: removeFolderItem(ctx.workspace, id ?? "", body) }),
  },
  {
    method: "GET",
    pattern: /^\/environment$/,
    handler: async (ctx) => ok({ checks: await checkEnvironment(ctx.findSystemChrome) }),
  },
];

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/** `path` is relative to /api/creator (e.g. "/projects/abc/duplicate"). */
export async function handleCreatorRequest(
  ctx: CreatorContext,
  method: string,
  path: string,
  body: unknown,
): Promise<CreatorResponse> {
  const route = ROUTES.find(
    (candidate) => candidate.method === method && candidate.pattern.test(path),
  );
  if (!route) return { status: 404, body: { error: "Route inconnue." } };
  const params = (route.pattern.exec(path) ?? []).slice(1).map(decode);
  try {
    return await route.handler(ctx, params, body);
  } catch (error) {
    if (error instanceof CreatorError)
      return { status: error.status, body: { error: error.message } };
    console.error("[Creator API]", error);
    return { status: 500, body: { error: "Erreur interne du serveur Creator." } };
  }
}
