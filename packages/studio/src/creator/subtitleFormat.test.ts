import { describe, it, expect } from "vitest";
import { parseSubtitles, exportSubtitles } from "./subtitleFormat";
import { applySubtitles, DEFAULT_SUBTITLE_STYLE } from "./subtitleComposition";

describe("légendes SRT/VTT", () => {
  it("importe CRLF, texte multiligne et entités, et réexporte sans perdre les timings", () => {
    const cues = parseSubtitles(
      "1\r\n00:00:01,025 --> 00:00:03,200\r\nBonjour &amp; bienvenue\r\nDeuxième ligne\r\n",
    );
    expect(cues).toEqual([{ start: 1.025, end: 3.2, text: "Bonjour & bienvenue\nDeuxième ligne" }]);
    expect(parseSubtitles(exportSubtitles(cues, "vtt"))).toEqual(cues);
    expect(parseSubtitles(exportSubtitles(cues, "srt"))).toEqual(cues);
  });
  it("refuse segments inversés et timecodes invalides", () => {
    expect(() => parseSubtitles("1\n00:00:05,000 --> 00:00:02,000\nNon")).toThrow();
    expect(() => parseSubtitles("00:99:00.000 --> 01:00:00.000\nNon")).toThrow();
  });
  it("crée de vrais clips éditables, échappe le texte et refuse un dépassement", async () => {
    const html =
      '<html><body><div id="root" data-composition-id="r" data-width="640" data-height="360" data-duration="4"><div id="keep">Conserver</div></div></body></html>';
    const cues = [{ start: 0, end: 2, text: '<script>alert("x")</script> & texte' }];
    const result = await applySubtitles(html, cues, DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain('data-creator-caption="true"');
    expect(result).toContain('id="keep"');
    expect(result).not.toContain("<script>alert");
    const again = await applySubtitles(
      result,
      [{ start: 1, end: 3, text: "Corrigé" }],
      DEFAULT_SUBTITLE_STYLE,
    );
    expect(again.match(/data-creator-caption="true"/g)).toHaveLength(1);
    expect(again).toContain("Corrigé");
    await expect(
      applySubtitles(html, [{ start: 3, end: 8, text: "Long" }], DEFAULT_SUBTITLE_STYLE),
    ).rejects.toThrow("dépasse");
  });
});
