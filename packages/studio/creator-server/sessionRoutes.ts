import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { beginMemory, discardMemory, memoryFor, memoryStatus, saveMemory } from "./sessionMemory";
import { isSafeId, projectDirFor, type CreatorWorkspace } from "./workspace";

function answer(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export async function sessionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  workspace: CreatorWorkspace,
  closeHistory: (root: string) => Promise<void>,
): Promise<boolean> {
  const match = /^\/api\/studio-session\/([^/?]+)\/(status|save|discard|metadata)$/.exec(
    req.url ?? "",
  );
  if (!match) return false;
  const id = match[1];
  if (!isSafeId(id)) {
    answer(res, 400, { error: "Projet invalide." });
    return true;
  }
  try {
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    ) {
      answer(res, 403, { error: "Origine refusée." });
      return true;
    }
    if (
      req.method !== "GET" &&
      !(req.headers["content-type"] ?? "").startsWith("application/json")
    ) {
      answer(res, 415, { error: "Corps JSON requis." });
      return true;
    }
    const dir = projectDirFor(workspace, id);
    if (!dir) throw new Error("Projet introuvable.");
    const session = memoryFor(dir) ?? beginMemory(dir);
    if (match[2] === "status" && req.method === "GET") answer(res, 200, memoryStatus(session));
    else if (match[2] === "save" && req.method === "POST") answer(res, 200, saveMemory(session));
    else if (match[2] === "discard" && req.method === "POST") {
      await closeHistory(session.root);
      discardMemory(session);
      answer(res, 200, { ok: true });
    } else if (match[2] === "metadata" && req.method === "PATCH") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 4096) throw new Error("Requête trop volumineuse.");
        chunks.push(buffer);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
      if (!body || typeof body !== "object") throw new Error("Paramètres invalides.");
      const path = join(session.root, ".creator.json");
      const manifest = JSON.parse(session.fs.readFileSync(path, "utf8").toString());
      if ("title" in body) {
        if (typeof body.title !== "string" || !body.title.trim())
          throw new Error("Nom obligatoire.");
        manifest.title = body.title.trim().slice(0, 120);
      }
      if ("fps" in body) {
        if (typeof body.fps !== "number" || ![24, 25, 30, 50, 60].includes(body.fps))
          throw new Error("Cadence invalide.");
        manifest.fps = body.fps;
      }
      session.fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
      session.revision++;
      answer(res, 200, { title: manifest.title, fps: manifest.fps });
    } else answer(res, 405, { error: "Méthode refusée." });
  } catch (error) {
    answer(res, 409, { error: error instanceof Error ? error.message : "Opération impossible." });
  }
  return true;
}
