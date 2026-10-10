// « Banque libre de droits »: free media searched online, imported with its licence.
//
//   videos     Wikimedia Commons (no key)
//   images     Openverse — photos and illustrations, Creative Commons (no key)
//   music      Openverse — audio, category music
//   sfx        Openverse — audio, category sound_effect (mostly Freesound)
//
// Only licences that allow COMMERCIAL use and modification are kept: CC0, public
// domain, CC BY, CC BY-SA. A download never trusts a URL sent by the page: the
// item is fetched again from its provider by id, so the file and its licence
// come from the source (no request forgery, no forged licence).
//
// Lives under the `session` prefix (see sessionMediaInfo.ts): it writes real
// files into the library and records credits next to real project files.

import { createWriteStream, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { writeFileAtomic } from "./projectMeta";
import { CreatorError } from "./projectOps";
import { libraryDirFor } from "./sessionLibrary";
import { type CreatorWorkspace, projectDirFor } from "./workspace";

export const STOCK_KINDS = ["videos", "images", "music", "sfx"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export type StockProvider = "openverse" | "commons";

export interface StockLicense {
  /** "cc0" | "pdm" | "by" | "by-sa" */
  code: string;
  label: string;
  url: string | null;
  /** True when the author must be credited (CC BY, CC BY-SA). */
  attributionRequired: boolean;
}

export interface StockItem {
  id: string;
  provider: StockProvider;
  kind: StockKind;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  landingUrl: string | null;
  thumbnail: string | null;
  /** Playable URL for audio previews (direct file). */
  preview: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  size: number | null;
  extension: string;
  license: StockLicense;
  attribution: string;
}

export interface StockPage {
  items: StockItem[];
  page: number;
  hasMore: boolean;
}

const USER_AGENT = "ArCut/0.1 (local video editor; contact via the app owner)";
const OPENVERSE = "https://api.openverse.org/v1";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const PAGE_SIZE = 20;
const MAX_DOWNLOAD_BYTES = 400 * 1024 * 1024;
const CACHE_MS = 10 * 60 * 1000;
const ALLOWED_DOWNLOAD_HOSTS = [
  "upload.wikimedia.org",
  "live.staticflickr.com",
  "cdn.freesound.org",
  "freesound.org",
  "api.openverse.org",
];

export function isStockKind(value: unknown): value is StockKind {
  return typeof value === "string" && (STOCK_KINDS as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ licences
const LICENSE_LABEL: Record<string, string> = {
  cc0: "CC0 (domaine public)",
  pdm: "Domaine public",
  by: "CC BY",
  "by-sa": "CC BY-SA",
};

function openverseLicense(code: unknown, version: unknown, url: unknown): StockLicense | null {
  const c = String(code ?? "").toLowerCase();
  if (!LICENSE_LABEL[c]) return null;
  const v =
    typeof version === "string" && version && c !== "cc0" && c !== "pdm" ? ` ${version}` : "";
  return {
    code: c,
    label: `${LICENSE_LABEL[c]}${v}`,
    url: typeof url === "string" ? url : null,
    attributionRequired: c === "by" || c === "by-sa",
  };
}

/** Commons gives a short name such as "CC BY-SA 4.0", "CC0", "Public domain". */
export function commonsLicense(shortName: string, url: string | null): StockLicense | null {
  const name = shortName.trim();
  if (/\b(NC|ND)\b/i.test(name)) return null;
  if (/^CC0/i.test(name))
    return { code: "cc0", label: LICENSE_LABEL.cc0!, url, attributionRequired: false };
  if (/public domain|^PD\b|^PD-/i.test(name))
    return { code: "pdm", label: LICENSE_LABEL.pdm!, url, attributionRequired: false };
  const by = /^CC BY(-SA)?(?:\s+([\d.]+))?/i.exec(name);
  if (by) {
    const code = by[1] ? "by-sa" : "by";
    return {
      code,
      label: `${LICENSE_LABEL[code]}${by[2] ? ` ${by[2]}` : ""}`,
      url,
      attributionRequired: true,
    };
  }
  return null;
}

function stripHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function attributionText(
  title: string,
  creator: string | null,
  license: StockLicense,
  source: string,
): string {
  const by = creator ? ` par ${creator}` : "";
  return `« ${title} »${by} — ${license.label}${license.url ? ` (${license.url})` : ""} — via ${source}`;
}

// ------------------------------------------------------------------ http
const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(url: string): Promise<unknown> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    throw new CreatorError(
      "La banque libre de droits ne répond pas. Vérifiez la connexion Internet.",
      409,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429)
    throw new CreatorError("Trop de recherches d'un coup : réessayez dans une minute.", 409);
  if (!response.ok)
    throw new CreatorError(`La banque a répondu par une erreur (${response.status}).`, 409);
  const value: unknown = await response.json();
  cache.set(url, { at: Date.now(), value });
  return value;
}

function rec(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const KNOWN_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "opus",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "webm",
  "mp4",
  "ogv",
]);

/** Provider file types are not always extensions ("mp32" is an MP3): fall back to the URL, then a default. */
export function normalizeExtension(
  fileType: string,
  urlExtension: string,
  fallback: string,
): string {
  for (const candidate of [fileType, urlExtension]) {
    const ext = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (KNOWN_EXTENSIONS.has(ext)) return ext;
    if (/^mp3/.test(ext)) return "mp3";
  }
  return fallback;
}

// ------------------------------------------------------------------ openverse
const OPENVERSE_LICENSES = "cc0,pdm,by,by-sa";

function openverseItem(raw: unknown, kind: StockKind): StockItem | null {
  const r = rec(raw);
  const license = openverseLicense(r.license, r.license_version, r.license_url);
  if (!license || typeof r.id !== "string" || typeof r.url !== "string") return null;
  const title = (typeof r.title === "string" && r.title.trim()) || "Sans titre";
  const creator = typeof r.creator === "string" && r.creator ? r.creator : null;
  const isAudio = kind === "music" || kind === "sfx";
  const ext = normalizeExtension(
    typeof r.filetype === "string" ? r.filetype : "",
    extname(new URL(r.url).pathname).slice(1),
    isAudio ? "mp3" : "jpg",
  );
  return {
    id: r.id,
    provider: "openverse",
    kind,
    title,
    creator,
    creatorUrl: typeof r.creator_url === "string" ? r.creator_url : null,
    landingUrl: typeof r.foreign_landing_url === "string" ? r.foreign_landing_url : null,
    thumbnail: isAudio
      ? typeof r.thumbnail === "string"
        ? r.thumbnail
        : null
      : `${OPENVERSE}/images/${r.id}/thumb/`,
    preview: isAudio ? r.url : null,
    width: num(r.width),
    height: num(r.height),
    duration: isAudio && num(r.duration) ? Number(r.duration) / 1000 : null,
    size: num(r.filesize),
    extension: ext,
    license,
    attribution: attributionText(
      title,
      creator,
      license,
      `Openverse / ${String(r.source ?? r.provider ?? "")}`.replace(/ \/ $/, ""),
    ),
  };
}

async function searchOpenverse(kind: StockKind, query: string, page: number): Promise<StockPage> {
  const isAudio = kind === "music" || kind === "sfx";
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(PAGE_SIZE),
    license: OPENVERSE_LICENSES,
    mature: "false",
  });
  if (kind === "music") params.set("category", "music");
  // Freesound items carry no category in Openverse, so sound effects are chosen by source.
  if (kind === "sfx") params.set("source", "freesound");
  const data = rec(await getJson(`${OPENVERSE}/${isAudio ? "audio" : "images"}/?${params}`));
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    items: results.map((r) => openverseItem(r, kind)).filter((i): i is StockItem => i !== null),
    page,
    hasMore: page < (num(data.page_count) ?? 0),
  };
}

// ------------------------------------------------------------------ wikimedia commons
function commonsItem(page: unknown): StockItem | null {
  const p = rec(page);
  const info = rec(Array.isArray(p.imageinfo) ? p.imageinfo[0] : null);
  const meta = rec(info.extmetadata);
  const value = (key: string) => rec(meta[key]).value;
  const shortName = stripHtml(value("LicenseShortName")) ?? "";
  const license = commonsLicense(shortName, stripHtml(value("LicenseUrl")));
  if (!license || typeof info.url !== "string" || typeof p.title !== "string") return null;
  const title = p.title.replace(/^File:/, "").replace(/\.[^.]+$/, "");
  const creator = stripHtml(value("Artist"));
  return {
    id: String(p.pageid ?? p.title),
    provider: "commons",
    kind: "videos",
    title,
    creator,
    creatorUrl: null,
    landingUrl: typeof info.descriptionurl === "string" ? info.descriptionurl : null,
    thumbnail: typeof info.thumburl === "string" ? info.thumburl : null,
    preview: null,
    width: num(info.width),
    height: num(info.height),
    duration: num(info.duration),
    size: num(info.size),
    extension: extname(new URL(info.url).pathname).slice(1).toLowerCase() || "webm",
    license,
    attribution: attributionText(title, creator, license, "Wikimedia Commons"),
  };
}

const COMMONS_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mime|extmetadata",
  iiurlwidth: "360",
  iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
};

async function searchCommons(query: string, page: number): Promise<StockPage> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String((page - 1) * PAGE_SIZE),
    gsrsearch: `filetype:video ${query}`,
    ...COMMONS_PROPS,
  });
  const data = rec(await getJson(`${COMMONS}?${params}`));
  const pages = Object.values(rec(rec(data.query).pages)).sort(
    (a, b) => Number(rec(a).index ?? 0) - Number(rec(b).index ?? 0),
  );
  return {
    items: pages.map(commonsItem).filter((i): i is StockItem => i !== null),
    page,
    hasMore: Boolean(data.continue),
  };
}

// ------------------------------------------------------------------ public api
export async function searchStock(
  kind: StockKind,
  rawQuery: unknown,
  rawPage: unknown,
): Promise<StockPage> {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 100) : "";
  if (!query) throw new CreatorError("Tapez un mot-clé pour chercher.");
  const page = Math.min(50, Math.max(1, Math.floor(Number(rawPage) || 1)));
  return kind === "videos" ? searchCommons(query, page) : searchOpenverse(kind, query, page);
}

/** The item fetched again from its provider: the only source trusted for a download. */
export async function fetchStockItem(
  kind: StockKind,
  provider: unknown,
  id: unknown,
): Promise<StockItem> {
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(id))
    throw new CreatorError("Média invalide.");
  let item: StockItem | null = null;
  if (provider === "openverse" && kind !== "videos") {
    const isAudio = kind === "music" || kind === "sfx";
    item = openverseItem(
      await getJson(`${OPENVERSE}/${isAudio ? "audio" : "images"}/${id}/`),
      kind,
    );
  } else if (provider === "commons" && kind === "videos" && /^\d+$/.test(id)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      pageids: id,
      ...COMMONS_PROPS,
    });
    const pages = Object.values(rec(rec(rec(await getJson(`${COMMONS}?${params}`)).query).pages));
    item = commonsItem(pages[0]);
  }
  if (!item)
    throw new CreatorError(
      "Ce média n'est plus disponible ou sa licence n'est pas autorisée.",
      404,
    );
  return item;
}

/** The provider's direct file URL for an item, checked against the known hosts. */
async function sourceUrl(item: StockItem): Promise<string> {
  let url: string | null = null;
  if (item.provider === "openverse") {
    const isAudio = item.kind === "music" || item.kind === "sfx";
    url = String(
      rec(await getJson(`${OPENVERSE}/${isAudio ? "audio" : "images"}/${item.id}/`)).url ?? "",
    );
  } else {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      pageids: item.id,
      prop: "imageinfo",
      iiprop: "url",
    });
    const page = rec(
      Object.values(rec(rec(rec(await getJson(`${COMMONS}?${params}`)).query).pages))[0],
    );
    url = String(rec(Array.isArray(page.imageinfo) ? page.imageinfo[0] : null).url ?? "");
  }
  let host = "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("https only");
    host = parsed.hostname;
  } catch {
    throw new CreatorError("Adresse de téléchargement invalide.", 409);
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new CreatorError("Source de téléchargement non autorisée.", 409);
  }
  return url;
}

async function openDownload(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  } catch {
    throw new CreatorError("Le téléchargement a échoué. Vérifiez la connexion Internet.", 409);
  }
  if (!response.ok || !response.body)
    throw new CreatorError(`Téléchargement refusé (${response.status}).`, 409);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES)
    throw new CreatorError("Fichier trop volumineux (plus de 400 Mo).", 409);
  return response;
}

/** A readable file name for the media, kept short and safe. */
export function stockFileName(item: StockItem): string {
  const base =
    item.title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "media";
  return `${base}.${item.extension}`;
}

/** Streams the item's file to the page (which imports it into the open project). */
export async function streamStockFile(item: StockItem, res: ServerResponse): Promise<void> {
  const response = await openDownload(await sourceUrl(item));
  res.writeHead(200, {
    "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(stockFileName(item))}`,
    "Cache-Control": "no-store",
    "X-Stock-File-Name": encodeURIComponent(stockFileName(item)),
  });
  await pipeline(Readable.fromWeb(response.body as never), res);
}

// ------------------------------------------------------------------ credits
export const CREDITS_FILE = ".creator-credits.json";

export interface StockCredit {
  file: string;
  title: string;
  creator: string | null;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  source: string;
  landingUrl: string | null;
  attribution: string;
  importedAt: string;
}

function creditOf(item: StockItem, file: string): StockCredit {
  return {
    file,
    title: item.title,
    creator: item.creator,
    license: item.license.label,
    licenseUrl: item.license.url,
    attributionRequired: item.license.attributionRequired,
    source: item.provider === "commons" ? "Wikimedia Commons" : "Openverse",
    landingUrl: item.landingUrl,
    attribution: item.attribution,
    importedAt: new Date().toISOString(),
  };
}

export function readCredits(dir: string): StockCredit[] {
  const file = join(dir, CREDITS_FILE);
  if (!existsSync(file)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(rec(data).credits) ? (rec(data).credits as StockCredit[]) : [];
  } catch {
    return [];
  }
}

function addCredit(dir: string, credit: StockCredit): void {
  const credits = readCredits(dir).filter((c) => c.file !== credit.file);
  writeFileAtomic(
    join(dir, CREDITS_FILE),
    JSON.stringify({ version: 1, credits: [...credits, credit] }, null, 2),
  );
}

/** Records a stock media imported into a project (the file itself arrives through the normal import). */
export function recordProjectCredit(
  workspace: CreatorWorkspace,
  projectId: unknown,
  file: unknown,
  item: StockItem,
): void {
  const dir = projectDirFor(workspace, typeof projectId === "string" ? projectId : "");
  if (!dir || typeof file !== "string" || !file || file.length > 300 || file.includes("..")) {
    throw new CreatorError("Projet ou fichier invalide.");
  }
  addCredit(dir, creditOf(item, file));
}

/** Downloads a stock media straight into « Ma bibliothèque », with its credit. */
export async function downloadToLibrary(
  workspace: CreatorWorkspace,
  item: StockItem,
): Promise<string> {
  const dir = libraryDirFor(workspace);
  let name = stockFileName(item);
  const ext = extname(name);
  for (let n = 2; existsSync(join(dir, name)); n++)
    name = `${name.slice(0, name.length - ext.length).replace(/ \(\d+\)$/, "")} (${n})${ext}`;
  const target = join(dir, name);
  if (!target.startsWith(dir + sep)) throw new CreatorError("Nom de fichier invalide.");
  const temp = `${target}.download`;
  const response = await openDownload(await sourceUrl(item));
  let written = 0;
  const body = Readable.fromWeb(response.body as never);
  body.on("data", (chunk: Buffer) => {
    written += chunk.length;
    if (written > MAX_DOWNLOAD_BYTES) body.destroy(new Error("too large"));
  });
  try {
    await pipeline(body, createWriteStream(temp));
    renameSync(temp, target);
  } catch {
    rmSync(temp, { force: true });
    throw new CreatorError("Le téléchargement a échoué ou le fichier est trop volumineux.", 409);
  }
  addCredit(dir, creditOf(item, name));
  return name;
}
