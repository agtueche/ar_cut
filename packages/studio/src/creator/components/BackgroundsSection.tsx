// « Fonds » at the top of the Multimédia tab: a solid or gradient full-frame
// background, created in the app and inserted at the playhead behind every layer.

import { useState } from "react";
import { usePlayerStore } from "../../player";
import { COMPOSITION_PALETTE } from "../../../creator-server/palette";
import { insertElement } from "../insertElement";
import { useStudioBridge } from "../studioBridge";
import { useI18n } from "../i18n";

const DEFAULT_DURATION = 5;

export function BackgroundsSection() {
  const { t } = useI18n();
  const bridge = useStudioBridge();
  const [color, setColor] = useState<string>(COMPOSITION_PALETTE.background);
  const [from, setFrom] = useState<string>(COMPOSITION_PALETTE.accent);
  const [to, setTo] = useState<string>(COMPOSITION_PALETTE.action);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const add = async (kind: "solid" | "gradient") => {
    if (!bridge || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const start = Math.round(usePlayerStore.getState().currentTime * 100) / 100;
      const result = await insertElement(bridge, {
        kind,
        text: "",
        imageSrc: null,
        start,
        duration: DEFAULT_DURATION,
        color,
        background: kind === "solid" ? color : from,
        background2: to,
        animation: { preset: "none", duration: 0.5, delay: 0, ease: "none" },
        label: kind === "solid" ? t("backgrounds.addSolid") : t("backgrounds.addGradient"),
      });
      setMessage(t("elements.inserted", { id: result.elementId, time: start.toFixed(2) }));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const swatch = "h-7 w-9 cursor-pointer rounded border border-border-strong bg-input";
  return (
    <section aria-label={t("backgrounds.title")} className="border-b border-border px-3 py-2.5">
      <h3 className="mb-2 text-step-11 font-semibold uppercase tracking-wide text-text-muted">
        {t("backgrounds.title")}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={t("backgrounds.solidColor")}
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className={swatch}
        />
        <button
          type="button"
          disabled={!bridge || busy}
          onClick={() => void add("solid")}
          className="h-7 rounded border border-border-strong px-2 text-step-11 text-text-1 hover:bg-hover disabled:opacity-40"
        >
          {t("backgrounds.addSolid")}
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <input
          type="color"
          aria-label={t("backgrounds.gradientFrom")}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className={swatch}
        />
        <input
          type="color"
          aria-label={t("backgrounds.gradientTo")}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className={swatch}
        />
        <button
          type="button"
          disabled={!bridge || busy}
          onClick={() => void add("gradient")}
          className="h-7 rounded border border-border-strong px-2 text-step-11 text-text-1 hover:bg-hover disabled:opacity-40"
        >
          {t("backgrounds.addGradient")}
        </button>
      </div>
      {message && <p className="mt-1.5 text-step-11 text-text-muted">{message}</p>}
    </section>
  );
}
