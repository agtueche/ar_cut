import { useState } from "react";
import { FilmSlate, Sparkle } from "@phosphor-icons/react";
import { Button, cn } from "../../components/ui";
import { creatorApi, type ProjectSummary, type PublicTemplate } from "../creatorApi";
import { useI18n, type MessageKey } from "../i18n";
import { CtaButton, ErrorBanner, Field, Modal, errorMessage, inputClass } from "./common";

type FormatId = "landscape" | "portrait" | "square" | "custom";

const FORMATS: Array<{ id: FormatId; label: MessageKey; width: number; height: number }> = [
  { id: "landscape", label: "wizard.format.landscape", width: 1920, height: 1080 },
  { id: "portrait", label: "wizard.format.portrait", width: 1080, height: 1920 },
  { id: "square", label: "wizard.format.square", width: 1080, height: 1080 },
  { id: "custom", label: "wizard.format.custom", width: 1280, height: 720 },
];

const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function isValidSide(value: number): boolean {
  return Number.isInteger(value) && value >= 64 && value <= 7680 && value % 2 === 0;
}

function FormatPreview({ width, height }: { width: number; height: number }) {
  const ratio = width / height;
  const boxW = ratio >= 1 ? 40 : 40 * ratio;
  const boxH = ratio >= 1 ? 40 / ratio : 40;
  return (
    <span className="flex h-11 w-11 items-center justify-center">
      <span
        className="rounded-sm border-2 border-current"
        style={{ width: Math.max(8, boxW), height: Math.max(8, boxH) }}
      />
    </span>
  );
}

export function NewProjectWizard({
  templates,
  initialTemplate = null,
  onClose,
  onCreated,
}: {
  templates: PublicTemplate[];
  initialTemplate?: string | null;
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<string | null>(initialTemplate);
  const [format, setFormat] = useState<FormatId>("landscape");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(
    () => templates.find((item) => item.id === initialTemplate)?.fps ?? 30,
  );
  const [duration, setDuration] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenTemplate = templates.find((item) => item.id === template) ?? null;
  const dimensionsValid = isValidSide(width) && isValidSide(height);
  const durationValid = duration >= 1 && duration <= 3600;
  const canSubmit =
    title.trim().length > 0 && (chosenTemplate !== null || (dimensionsValid && durationValid));

  const chooseFormat = (id: FormatId) => {
    setFormat(id);
    const preset = FORMATS.find((item) => item.id === id);
    if (preset && id !== "custom") {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  };

  const submit = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setError(t("wizard.errors.name"));
      return;
    }
    if (!chosenTemplate && !dimensionsValid) {
      setError(t("wizard.errors.dimensions"));
      return;
    }
    if (!chosenTemplate && !durationValid) {
      setError(t("wizard.errors.duration"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { project } = await creatorApi.createProject({
        title: title.trim(),
        width: chosenTemplate?.width ?? width,
        height: chosenTemplate?.height ?? height,
        fps,
        duration: chosenTemplate?.duration ?? duration,
        template,
      });
      onCreated(project);
    } catch (caught) {
      setError(errorMessage(caught, t));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t("wizard.title")}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("wizard.cancel")}
          </Button>
          <CtaButton disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? t("wizard.creating") : t("wizard.create")}
          </CtaButton>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={t("wizard.name")} htmlFor="wizard-name">
          <input
            id="wizard-name"
            className={inputClass}
            value={title}
            maxLength={120}
            placeholder={t("wizard.namePlaceholder")}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-step-11 font-medium text-text-muted">
            {t("wizard.start")}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StartOption
              selected={template === null}
              onSelect={() => setTemplate(null)}
              icon={<FilmSlate size={20} />}
              title={t("wizard.blank")}
              body={t("wizard.blankHint")}
            />
            {templates.map((item) => (
              <StartOption
                key={item.id}
                selected={template === item.id}
                onSelect={() => {
                  setTemplate(item.id);
                  setFps(item.fps);
                }}
                icon={<Sparkle size={20} />}
                title={item.title}
                body={`${item.width}×${item.height} · ${item.duration} s`}
              />
            ))}
          </div>
        </fieldset>

        {chosenTemplate ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-raised px-3 py-2 text-step-12 text-text-muted">
              {t("wizard.templateFormat", {
                format: `${chosenTemplate.width}×${chosenTemplate.height}, ${chosenTemplate.duration} s`,
              })}
            </p>
            <Field label={t("wizard.fps")} htmlFor="wizard-template-fps">
              <select
                id="wizard-template-fps"
                className={cn(inputClass, "max-w-40")}
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
              >
                {FPS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="mb-1.5 text-step-11 font-medium text-text-muted">
                {t("wizard.format")}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMATS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={format === item.id}
                    onClick={() => chooseFormat(item.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-step-12",
                      format === item.id
                        ? "border-accent bg-accent/10 text-text-0"
                        : "border-border-strong text-text-muted hover:bg-hover",
                    )}
                  >
                    <FormatPreview
                      width={item.id === "custom" ? width || 1 : item.width}
                      height={item.id === "custom" ? height || 1 : item.height}
                    />
                    {t(item.label)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("wizard.width")} htmlFor="wizard-width">
                <input
                  id="wizard-width"
                  type="number"
                  className={cn(inputClass, !isValidSide(width) && "border-danger")}
                  value={width}
                  min={64}
                  max={7680}
                  step={2}
                  onChange={(event) => {
                    setFormat("custom");
                    setWidth(Number(event.target.value));
                  }}
                />
              </Field>
              <Field label={t("wizard.height")} htmlFor="wizard-height">
                <input
                  id="wizard-height"
                  type="number"
                  className={cn(inputClass, !isValidSide(height) && "border-danger")}
                  value={height}
                  min={64}
                  max={7680}
                  step={2}
                  onChange={(event) => {
                    setFormat("custom");
                    setHeight(Number(event.target.value));
                  }}
                />
              </Field>
              <Field label={t("wizard.fps")} htmlFor="wizard-fps">
                <select
                  id="wizard-fps"
                  className={inputClass}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                >
                  {FPS_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("wizard.duration")} htmlFor="wizard-duration">
                <input
                  id="wizard-duration"
                  type="number"
                  className={cn(inputClass, !durationValid && "border-danger")}
                  value={duration}
                  min={1}
                  max={3600}
                  step={0.5}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </Field>
            </div>
            {!dimensionsValid && (
              <p className="text-step-11 text-danger-ink">{t("wizard.errors.dimensions")}</p>
            )}
          </>
        )}
        {error && <ErrorBanner message={error} />}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function StartOption({
  selected,
  onSelect,
  icon,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left",
        selected ? "border-accent bg-accent/10" : "border-border-strong hover:bg-hover",
      )}
    >
      <span className={selected ? "text-accent-ink" : "text-text-muted"}>{icon}</span>
      <span className="text-step-12 font-semibold text-text-0">{title}</span>
      <span className="text-step-11 text-text-muted">{body}</span>
    </button>
  );
}
