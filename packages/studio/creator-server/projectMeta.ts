// Project metadata. The composition HTML is the source of truth for format and
// duration; `.creator.json` only holds what HTML cannot carry (title, fps,
// template, assistant history).

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultOwnership, readOwnership, type Owner, type Visibility } from "./ownership";

/**
 * Hidden on purpose: Studio's history ignores dot-files, so Creator's bookkeeping
 * (last opened, assistant requests) never becomes an undo step.
 */
export const MANIFEST_FILE = ".creator.json";
/** The name used before 2026-10-06; read once and renamed. */
const LEGACY_MANIFEST_FILE = "creator.json";

export interface AssistantRequest {
  id: string;
  createdAt: string;
  request: string;
  compositionPath: string;
  selectionLabel: string | null;
}

export interface CreatorManifest {
  schemaVersion: 1;
  title: string;
  fps: number;
  createdAt: string;
  template: string | null;
  lastOpenedAt: string | null;
  assistant: AssistantRequest[];
  /** Who owns the project and who may see it (see ownership.ts). */
  owner: Owner;
  visibility: Visibility;
}

export interface CompositionInfo {
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  fps: number;
  template: string | null;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string | null;
  renderCount: number;
  owner: Owner;
  visibility: Visibility;
}

const ROOT_TAG = /<[a-z][a-z0-9-]*\b[^>]*\bdata-composition-id\s*=\s*["'][^"']*["'][^>]*>/i;

function numberAttr(tag: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Reads the root composition element's size and duration (the first `data-composition-id`). */
export function readCompositionInfo(html: string): CompositionInfo {
  const tag = ROOT_TAG.exec(html)?.[0];
  if (!tag) return { width: null, height: null, duration: null };
  return {
    width: numberAttr(tag, "data-width"),
    height: numberAttr(tag, "data-height"),
    duration: numberAttr(tag, "data-duration"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssistantRequest(value: unknown): value is AssistantRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.request === "string" &&
    typeof value.compositionPath === "string"
  );
}

export function defaultManifest(title: string, now = new Date()): CreatorManifest {
  return {
    schemaVersion: 1,
    title,
    fps: 30,
    createdAt: now.toISOString(),
    template: null,
    lastOpenedAt: null,
    assistant: [],
    ...defaultOwnership(),
  };
}

/** The manifest, repaired field by field; a missing or broken file falls back to defaults. */
export function readManifest(projectDir: string, fallbackTitle: string): CreatorManifest {
  const fallback = defaultManifest(fallbackTitle, statTime(projectDir));
  const file = join(projectDir, MANIFEST_FILE);
  const legacy = join(projectDir, LEGACY_MANIFEST_FILE);
  if (!existsSync(file) && existsSync(legacy)) {
    try {
      renameSync(legacy, file);
    } catch {
      return fallback;
    }
  }
  if (!existsSync(file)) return fallback;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
  if (!isRecord(raw)) return fallback;
  return {
    schemaVersion: 1,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallback.title,
    fps: typeof raw.fps === "number" && raw.fps > 0 ? raw.fps : fallback.fps,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallback.createdAt,
    template: typeof raw.template === "string" ? raw.template : null,
    lastOpenedAt: typeof raw.lastOpenedAt === "string" ? raw.lastOpenedAt : null,
    assistant: Array.isArray(raw.assistant) ? raw.assistant.filter(isAssistantRequest) : [],
    ...readOwnership(raw),
  };
}

/** Write-then-rename, so a crash never leaves a half-written file behind. */
export function writeFileAtomic(file: string, content: string): void {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, content, "utf-8");
  renameSync(temp, file);
}

export function writeManifest(projectDir: string, manifest: CreatorManifest): void {
  writeFileAtomic(join(projectDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

function statTime(path: string): Date {
  try {
    return statSync(path).birthtime;
  } catch {
    return new Date(0);
  }
}

export function modifiedAt(projectDir: string): string {
  const index = join(projectDir, "index.html");
  try {
    return statSync(existsSync(index) ? index : projectDir).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
