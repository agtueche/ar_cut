// Starter templates: each is a complete HyperFrames project folder under
// packages/studio/creator-templates/<id>/, described by its template.json.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSafeId } from "./workspace";

export interface CreatorTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  dir: string;
}

export type PublicTemplate = Omit<CreatorTemplate, "dir">;

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readTemplate(templatesDir: string, id: string): CreatorTemplate | null {
  const dir = join(templatesDir, id);
  const metaPath = join(dir, "template.json");
  if (!existsSync(metaPath) || !existsSync(join(dir, "index.html"))) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(metaPath, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return {
    id,
    title: text(raw.title, id),
    description: text(raw.description, ""),
    category: text(raw.category, "general"),
    width: positive(raw.width, 1920),
    height: positive(raw.height, 1080),
    fps: positive(raw.fps, 30),
    duration: positive(raw.duration, 10),
    dir,
  };
}

export function listTemplates(templatesDir: string): CreatorTemplate[] {
  if (!existsSync(templatesDir)) return [];
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSafeId(entry.name))
    .map((entry) => readTemplate(templatesDir, entry.name))
    .filter((template): template is CreatorTemplate => template !== null)
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

export function findTemplate(templatesDir: string, id: string): CreatorTemplate | null {
  return isSafeId(id) ? readTemplate(templatesDir, id) : null;
}

export function publicTemplate({ dir: _dir, ...template }: CreatorTemplate): PublicTemplate {
  return template;
}
