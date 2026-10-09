// "Préparer pour Claude Code": turns a natural-language request plus the
// project's real context into a prompt the user pastes into Claude Code.
// Nothing here calls a model; no answer is ever invented.

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ProjectSummary } from "./projectMeta";

export interface AssistantSelection {
  label: string;
  tagName?: string;
  id?: string | null;
  hfId?: string;
  textContent?: string | null;
  dataAttributes?: Record<string, string>;
}

export interface AssistantPromptInput {
  project: ProjectSummary;
  projectDir: string;
  compositionPath: string;
  request: string;
  currentTime: number | null;
  selection: AssistantSelection | null;
}

const SKIPPED_DIRS = new Set([".hyperframes", "node_modules", "renders", ".thumbnails"]);
const MAX_FILES = 60;

/** Project files, relative and sorted, without history, exports or dependencies. */
export function listProjectFiles(projectDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full);
      } else {
        files.push(relative(projectDir, full));
      }
    }
  };
  if (existsSync(projectDir)) walk(projectDir);
  return files.sort();
}

function describeSelection(selection: AssistantSelection | null): string {
  if (!selection) return "Aucun élément sélectionné.";
  const lines = [`- Libellé : ${selection.label}`];
  if (selection.tagName) lines.push(`- Balise : <${selection.tagName.toLowerCase()}>`);
  if (selection.id) lines.push(`- id : ${selection.id}`);
  if (selection.hfId) lines.push(`- data-hf-id : ${selection.hfId}`);
  const timing = selection.dataAttributes ?? {};
  for (const key of ["data-start", "data-duration", "data-track-index"]) {
    if (timing[key] !== undefined) lines.push(`- ${key} : ${timing[key]}`);
  }
  if (selection.textContent) lines.push(`- Texte : « ${selection.textContent.slice(0, 200)} »`);
  return lines.join("\n");
}

export function buildAssistantPrompt(input: AssistantPromptInput): string {
  const { project } = input;
  const format = project.width && project.height ? `${project.width}×${project.height}` : "inconnu";
  const files = listProjectFiles(input.projectDir);
  const time = input.currentTime === null ? "—" : `${input.currentTime.toFixed(2)} s`;
  return `Tu travailles sur un projet HyperFrames ouvert dans Hyperframes Creator.

## Demande
${input.request.trim()}

## Projet
- Titre : ${project.title}
- Dossier : ${input.projectDir}
- Composition active : ${input.compositionPath}
- Format : ${format} · ${project.fps} i/s · durée ${project.duration ?? "?"} s
- Tête de lecture : ${time}

## Sélection dans l'éditeur
${describeSelection(input.selection)}

## Fichiers du projet
${files.map((file) => `- ${file}`).join("\n") || "- (aucun)"}

## Contraintes HyperFrames (à respecter)
- Lis d'abord la skill /hyperframes (puis /hyperframes-core et /hyperframes-animation si besoin).
- Les compositions HTML restent la source de vérité : modifie les fichiers du dossier ci-dessus, rien d'autre.
- Chaque élément temporel garde class="clip" et ses attributs data-start, data-duration et data-track-index.
- Une seule timeline GSAP racine en pause par composition, enregistrée sur window.__timelines.
- Rendu déterministe : pas de Date.now(), pas de Math.random() sans graine, pas de requête réseau au rendu.
- Préserve les animations existantes que la demande ne concerne pas.
- N'ajoute pas de musique de fond sauf demande explicite.
- N'utilise aucun service d'IA externe (génération d'image, de voix, de vidéo) sans l'autorisation explicite de l'utilisateur.
- Après modification, exécute dans le dossier du projet :
  npx hyperframes lint
  npx hyperframes check
  et corrige jusqu'à ce que les deux passent.

Hyperframes Creator détecte tes modifications : l'utilisateur pourra les garder ou les annuler depuis le panneau « Assistant IA ».
`;
}
