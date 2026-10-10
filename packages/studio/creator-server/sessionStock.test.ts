// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  commonsLicense,
  isStockKind,
  normalizeExtension,
  searchStock,
  stockFileName,
  type StockItem,
} from "./sessionStock";

describe("banque libre de droits", () => {
  it("keeps only licences that allow commercial use and modification", () => {
    expect(commonsLicense("CC0", null)?.code).toBe("cc0");
    expect(commonsLicense("Public domain", null)?.code).toBe("pdm");
    expect(commonsLicense("CC BY 3.0", null)).toMatchObject({
      code: "by",
      label: "CC BY 3.0",
      attributionRequired: true,
    });
    expect(commonsLicense("CC BY-SA 4.0", null)).toMatchObject({
      code: "by-sa",
      attributionRequired: true,
    });
    expect(commonsLicense("CC BY-NC 4.0", null)).toBeNull();
    expect(commonsLicense("CC BY-ND 2.0", null)).toBeNull();
    expect(commonsLicense("GFDL", null)).toBeNull();
  });

  it("names downloaded files from the title, safely", () => {
    const item = { title: "Ocean in Sommarøy: été / hiver", extension: "webm" } as StockItem;
    expect(stockFileName(item)).toBe("Ocean in Sommar y ete hiver.webm");
    expect(stockFileName({ title: "../../etc", extension: "jpg" } as StockItem)).toBe("etc.jpg");
  });

  it("turns provider file types into real extensions", () => {
    expect(normalizeExtension("mp32", "", "mp3")).toBe("mp3");
    expect(normalizeExtension("", "wav", "mp3")).toBe("wav");
    expect(normalizeExtension("weird", "", "jpg")).toBe("jpg");
  });

  it("knows its four categories and refuses an empty search", async () => {
    expect(["videos", "images", "music", "sfx"].every(isStockKind)).toBe(true);
    expect(isStockKind("films")).toBe(false);
    await expect(searchStock("images", "   ", 1)).rejects.toThrow("mot-clé");
  });
});
