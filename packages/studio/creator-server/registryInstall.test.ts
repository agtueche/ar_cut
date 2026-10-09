// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitToHostViewport, installRegistryItemWithCli } from "./registryInstall";

describe("installation depuis le catalogue", () => {
  it("refuse un nom qui pourrait sortir du catalogue ou injecter des options", async () => {
    for (const blockName of ["../etc", "--force", "a b", ""]) {
      await expect(
        installRegistryItemWithCli({
          cliPath: "/nope",
          registryRoot: "/nope",
          projectDir: "/nope",
          blockName,
        }),
      ).rejects.toThrow("invalide");
    }
  });

  it("adapte un bloc 1920×1080 au format vertical du projet", () => {
    const dir = mkdtempSync(join(tmpdir(), "creator-registry-"));
    try {
      writeFileSync(
        join(dir, "index.html"),
        '<div data-composition-id="main" data-width="1080" data-height="1920"></div>',
      );
      const block = join(dir, "bloc.html");
      writeFileSync(
        block,
        '<meta name="viewport" content="width=1920, height=1080" />\n<style>#r { width: 1920px; height: 1080px; }</style>',
      );
      fitToHostViewport(dir, [block]);
      const html = readFileSync(block, "utf-8");
      expect(html).toContain('content="width=1080, height=1920"');
      expect(html).toContain("width: 1080px; height: 1920px;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
