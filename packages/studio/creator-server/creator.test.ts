// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCreatorRequest, type CreatorContext } from "./router";
import { readCompositionInfo, readManifest } from "./projectMeta";
import { createWorkspace, slugify } from "./workspace";

const TEMPLATES_DIR = resolve(__dirname, "../creator-templates");

let home: string;
let ctx: CreatorContext;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "creator-test-"));
  ctx = {
    workspace: createWorkspace(home),
    templatesDir: TEMPLATES_DIR,
    findSystemChrome: () => undefined,
  };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const call = (method: string, path: string, body: unknown = null) =>
  handleCreatorRequest(ctx, method, path, body);

const blankInput = {
  title: "Ma Vidéo d'été",
  width: 1080,
  height: 1920,
  fps: 25,
  duration: 12,
  template: null,
};

function projectOf(body: unknown): { id: string; title: string; width: number; fps: number } {
  return (body as { project: { id: string; title: string; width: number; fps: number } }).project;
}

describe("création et persistance", () => {
  it("crée une composition vide au format demandé, avec un manifest", async () => {
    const res = await call("POST", "/projects", blankInput);
    expect(res.status).toBe(201);
    const project = projectOf(res.body);
    expect(project.id).toBe("ma-video-d-ete");
    const dir = join(ctx.workspace.projectsDir, project.id);
    const info = readCompositionInfo(readFileSync(join(dir, "index.html"), "utf-8"));
    expect(info).toEqual({ width: 1080, height: 1920, duration: 12 });
    expect(readManifest(dir, "x")).toMatchObject({ title: "Ma Vidéo d'été", fps: 25 });
  });

  it("ne réutilise jamais un identifiant existant", async () => {
    const first = projectOf((await call("POST", "/projects", blankInput)).body);
    const second = projectOf((await call("POST", "/projects", blankInput)).body);
    expect(second.id).not.toBe(first.id);
    expect(second.id).toBe("ma-video-d-ete-2");
  });

  it("refuse des dimensions invalides avec un message explicite", async () => {
    const res = await call("POST", "/projects", { ...blankInput, width: 1081 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("largeur");
  });

  it("copie un modèle en gardant la fréquence d'images demandée", async () => {
    const res = await call("POST", "/projects", {
      ...blankInput,
      template: "verticale-sous-titres",
    });
    expect(res.status).toBe(201);
    const project = projectOf(res.body);
    const dir = join(ctx.workspace.projectsDir, project.id);
    expect(existsSync(join(dir, "compositions", "sous-titres.html"))).toBe(true);
    expect(existsSync(join(dir, "template.json"))).toBe(false);
    expect(project.width).toBe(1080);
    expect(project.fps).toBe(25);
  });

  it("change la cadence et refuse une cadence non prise en charge", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    expect(projectOf((await call("PATCH", `/projects/${project.id}`, { fps: 50 })).body).fps).toBe(
      50,
    );
    expect((await call("PATCH", `/projects/${project.id}`, { fps: 29 })).status).toBe(400);
  });

  it("renomme sans changer le dossier, et relit le nouveau titre", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    await call("PATCH", `/projects/${project.id}`, { title: "Nouveau titre" });
    const list = (await call("GET", "/projects")).body as {
      projects: Array<{ id: string; title: string }>;
    };
    expect(list.projects).toEqual([
      expect.objectContaining({ id: project.id, title: "Nouveau titre" }),
    ]);
  });
});

describe("duplication, corbeille et restauration", () => {
  it("duplique sans copier l'historique ni les exports", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const dir = join(ctx.workspace.projectsDir, project.id);
    mkdirSync(join(dir, ".hyperframes"));
    mkdirSync(join(dir, "renders"));
    writeFileSync(join(dir, "renders", "a.mp4"), "x");
    const copy = projectOf((await call("POST", `/projects/${project.id}/duplicate`)).body);
    const copyDir = join(ctx.workspace.projectsDir, copy.id);
    expect(copy.title).toBe("Ma Vidéo d'été (copie)");
    expect(existsSync(join(copyDir, "index.html"))).toBe(true);
    expect(existsSync(join(copyDir, ".hyperframes"))).toBe(false);
    expect(existsSync(join(copyDir, "renders"))).toBe(false);
  });

  it("met à la corbeille puis restaure le projet", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const trashed = await call("DELETE", `/projects/${project.id}`);
    expect(trashed.status).toBe(200);
    expect(
      ((await call("GET", "/projects")).body as { projects: unknown[] }).projects,
    ).toHaveLength(0);
    const entries = ((await call("GET", "/trash")).body as { entries: Array<{ trashId: string }> })
      .entries;
    expect(entries).toHaveLength(1);
    const restored = await call("POST", `/trash/${entries[0]?.trashId}/restore`);
    expect(projectOf(restored.body).id).toBe(project.id);
  });

  it("supprime définitivement depuis la corbeille uniquement", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    expect((await call("DELETE", `/trash/${project.id}`)).status).toBe(404);
    await call("DELETE", `/projects/${project.id}`);
    const [entry] = ((await call("GET", "/trash")).body as { entries: Array<{ trashId: string }> })
      .entries;
    expect((await call("DELETE", `/trash/${entry?.trashId}`)).status).toBe(200);
    expect(((await call("GET", "/trash")).body as { entries: unknown[] }).entries).toHaveLength(0);
  });
});

describe("sécurité des chemins", () => {
  it.each(["..", "..%2F..%2Fetc", "%2E%2E", "a%2Fb", "Majuscule"])(
    "refuse l'identifiant %s",
    async (id) => {
      const res = await call("DELETE", `/projects/${id}`);
      expect(res.status).toBe(404);
      expect(existsSync(home)).toBe(true);
    },
  );

  it("refuse un modèle qui sort du dossier des modèles", async () => {
    const res = await call("POST", "/projects", { ...blankInput, template: "../../etc" });
    expect(res.status).toBe(400);
  });

  it("produit des identifiants sûrs à partir de n'importe quel titre", () => {
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("   ")).toBe("projet");
  });
});

describe("assistant : préparer pour Claude Code", () => {
  it("construit un prompt contextualisé et l'enregistre dans l'historique", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const res = await call("POST", `/projects/${project.id}/assistant/prompt`, {
      request: "Anime ce titre pendant deux secondes.",
      compositionPath: "index.html",
      currentTime: 1.5,
      selection: {
        label: "Titre",
        tagName: "H1",
        id: "title",
        dataAttributes: { "data-start": "0" },
      },
    });
    expect(res.status).toBe(200);
    const { prompt } = res.body as { prompt: string };
    expect(prompt).toContain("Anime ce titre pendant deux secondes.");
    expect(prompt).toContain(join(ctx.workspace.projectsDir, project.id));
    expect(prompt).toContain("- id : title");
    expect(prompt).toContain("npx hyperframes lint");
    const history = (await call("GET", `/projects/${project.id}/assistant`)).body as {
      entries: Array<{ request: string }>;
    };
    expect(history.entries[0]?.request).toBe("Anime ce titre pendant deux secondes.");
  });

  it("refuse une demande vide", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const res = await call("POST", `/projects/${project.id}/assistant/prompt`, { request: "  " });
    expect(res.status).toBe(400);
  });
});

describe("modèles", () => {
  it("expose les cinq modèles initiaux", async () => {
    const res = await call("GET", "/templates");
    const ids = (res.body as { templates: Array<{ id: string }> }).templates.map((t) => t.id);
    expect(ids.sort()).toEqual([
      "motion-typographique",
      "presentation-services",
      "publicite-produit",
      "verticale-sous-titres",
      "video-pedagogique",
    ]);
  });
});

describe("manifeste et exports", () => {
  it("migre l'ancien creator.json vers .creator.json, ignoré par l'historique du Studio", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const dir = join(ctx.workspace.projectsDir, project.id);
    const hidden = join(dir, ".creator.json");
    writeFileSync(
      join(dir, "creator.json"),
      readFileSync(hidden, "utf-8").replace("Ma Vidéo d'été", "Ancien titre"),
    );
    rmSync(hidden);
    const list = (await call("GET", "/projects")).body as { projects: Array<{ title: string }> };
    expect(list.projects[0]?.title).toBe("Ancien titre");
    expect(existsSync(hidden)).toBe(true);
    expect(existsSync(join(dir, "creator.json"))).toBe(false);
  });

  it("ne liste que les exports terminés", async () => {
    const project = projectOf((await call("POST", "/projects", blankInput)).body);
    const renders = join(ctx.workspace.projectsDir, project.id, "renders");
    mkdirSync(renders);
    writeFileSync(join(renders, "fini.mp4"), "x");
    writeFileSync(join(renders, "fini.meta.json"), '{"status":"complete"}');
    writeFileSync(join(renders, "en-cours.mp4"), "x");
    const res = (await call("GET", "/exports")).body as { exports: Array<{ filename: string }> };
    expect(res.exports.map((entry) => entry.filename)).toEqual(["fini.mp4"]);
  });
});
