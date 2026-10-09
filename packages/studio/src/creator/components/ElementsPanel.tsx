import { useState } from "react";
import { Circle, ImageSquare, Paragraph, Square, Subtitles, TextHOne } from "@phosphor-icons/react";
import { Button, cn } from "../../components/ui";
import { usePlayerStore } from "../../player";
import {
  ANIMATION_PRESETS,
  EASES,
  isTextKind,
  type AnimationPreset,
  type ElementKind,
} from "../elementPresets";
import { insertElement } from "../insertElement";
import { COMPOSITION_PALETTE } from "../../../creator-server/palette";
import { useStudioBridge } from "../studioBridge";
import { useI18n, type MessageKey } from "../i18n";
import { ErrorBanner, Field, inputClass } from "./common";

const KINDS: Array<{
  id: ElementKind;
  label: MessageKey;
  icon: React.ReactNode;
  text: MessageKey | null;
}> = [
  {
    id: "title",
    label: "elements.title",
    icon: <TextHOne size={18} />,
    text: "elements.defaultTitle",
  },
  {
    id: "paragraph",
    label: "elements.paragraph",
    icon: <Paragraph size={18} />,
    text: "elements.defaultParagraph",
  },
  {
    id: "caption",
    label: "elements.caption",
    icon: <Subtitles size={18} />,
    text: "elements.defaultCaption",
  },
  { id: "rectangle", label: "elements.rectangle", icon: <Square size={18} />, text: null },
  { id: "circle", label: "elements.circle", icon: <Circle size={18} />, text: null },
  { id: "image", label: "elements.image", icon: <ImageSquare size={18} />, text: null },
];

const PRESET_LABELS: Record<AnimationPreset, MessageKey> = {
  none: "anim.none",
  fade: "anim.fade",
  slide: "anim.slide",
  scale: "anim.scale",
  reveal: "anim.reveal",
  typewriter: "anim.typewriter",
  highlight: "anim.highlight",
  float: "anim.float",
};

/** The library's « Texte » tab: titles, captions, shapes and logos with an entrance animation. */
export function ElementsPanel() {
  const { t } = useI18n();
  const bridge = useStudioBridge();
  const [kind, setKind] = useState<ElementKind>("title");
  const [text, setText] = useState(() => t("elements.defaultTitle"));
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(3);
  const [color, setColor] = useState<string>(COMPOSITION_PALETTE.text);
  const [background, setBackground] = useState<string>(COMPOSITION_PALETTE.accent);
  const [preset, setPreset] = useState<AnimationPreset>("slide");
  const [animDuration, setAnimDuration] = useState(0.8);
  const [delay, setDelay] = useState(0);
  const [ease, setEase] = useState("power3.out");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const chooseKind = (next: ElementKind) => {
    setKind(next);
    const defaultText = KINDS.find((item) => item.id === next)?.text;
    setText(defaultText ? t(defaultText) : "");
    if (!isTextKind(next) && (preset === "reveal" || preset === "typewriter")) setPreset("fade");
  };

  const textKind = isTextKind(kind);
  const images = bridge?.imageAssets ?? [];
  const canInsert =
    bridge !== null &&
    !busy &&
    duration > 0 &&
    (!textKind || text.trim().length > 0) &&
    (kind !== "image" || imageSrc !== null);

  const insert = async () => {
    if (!bridge) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const start = Math.round(usePlayerStore.getState().currentTime * 100) / 100;
      const label = `${t("elements.insertLabel")} : ${t(KINDS.find((item) => item.id === kind)!.label).toLowerCase()}`;
      const result = await insertElement(bridge, {
        kind,
        text: text.trim(),
        imageSrc,
        start,
        duration,
        color,
        background,
        animation: { preset, duration: animDuration, delay, ease },
        label,
      });
      setDone(
        result.skippedTweens > 0
          ? t("elements.insertedNoAnim", { id: result.elementId })
          : t("elements.inserted", { id: result.elementId, time: start.toFixed(2) }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t("elements.panelTitle")} className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        {!bridge && <p className="text-step-12 text-text-muted">{t("elements.waiting")}</p>}
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("elements.kind")}>
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={kind === item.id}
              onClick={() => chooseKind(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-step-11",
                kind === item.id
                  ? "border-accent bg-accent/10 text-text-0"
                  : "border-border-strong text-text-muted hover:bg-hover",
              )}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>

        {textKind && (
          <Field label={t("elements.text")} htmlFor="element-text">
            <textarea
              id="element-text"
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={cn(inputClass, "h-auto py-2")}
            />
          </Field>
        )}
        {kind === "image" && (
          <Field
            label={t("elements.imageFile")}
            htmlFor="element-image"
            hint={images.length ? undefined : t("elements.noImages")}
          >
            <select
              id="element-image"
              className={inputClass}
              value={imageSrc ?? ""}
              onChange={(event) => setImageSrc(event.target.value || null)}
            >
              <option value="">—</option>
              {images.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("elements.duration")} htmlFor="element-duration">
            <input
              id="element-duration"
              type="number"
              min={0.1}
              step={0.1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          {kind !== "image" && (
            <Field
              label={textKind ? t("elements.color") : t("elements.fill")}
              htmlFor="element-color"
            >
              <input
                id="element-color"
                type="color"
                value={textKind ? color : background}
                onChange={(event) =>
                  textKind ? setColor(event.target.value) : setBackground(event.target.value)
                }
                className="h-ctl-lg w-full cursor-pointer rounded-md border border-border-strong bg-input"
              />
            </Field>
          )}
        </div>
        {kind === "caption" && (
          <Field label={t("elements.background")} htmlFor="element-bg">
            <input
              id="element-bg"
              type="color"
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              className="h-ctl-lg w-full cursor-pointer rounded-md border border-border-strong bg-input"
            />
          </Field>
        )}

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-step-11 font-medium text-text-muted">
            {t("elements.animation")}
          </legend>
          <select
            aria-label={t("elements.animation")}
            value={preset}
            onChange={(event) => setPreset(event.target.value as AnimationPreset)}
            className={inputClass}
          >
            {ANIMATION_PRESETS.filter(
              (item) => textKind || (item !== "reveal" && item !== "typewriter"),
            ).map((item) => (
              <option key={item} value={item}>
                {t(PRESET_LABELS[item])}
              </option>
            ))}
          </select>
          {preset !== "none" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("elements.animDuration")} htmlFor="anim-duration">
                <input
                  id="anim-duration"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={animDuration}
                  disabled={preset === "float"}
                  onChange={(event) => setAnimDuration(Number(event.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label={t("elements.delay")} htmlFor="anim-delay">
                <input
                  id="anim-delay"
                  type="number"
                  min={0}
                  step={0.1}
                  value={delay}
                  disabled={preset === "float"}
                  onChange={(event) => setDelay(Number(event.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label={t("elements.ease")} htmlFor="anim-ease">
                <select
                  id="anim-ease"
                  value={ease}
                  disabled={preset === "typewriter" || preset === "highlight" || preset === "float"}
                  onChange={(event) => setEase(event.target.value)}
                  className={inputClass}
                >
                  {EASES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </fieldset>

        <p className="text-step-11 text-text-off">{t("elements.atPlayhead")}</p>
        <Button variant="primary" size="lg" disabled={!canInsert} onClick={() => void insert()}>
          {busy ? t("elements.inserting") : t("elements.insert")}
        </Button>
        {error && <ErrorBanner message={error} />}
        {done && <p className="text-step-12 text-accent-ink">{done}</p>}
      </div>
    </section>
  );
}
