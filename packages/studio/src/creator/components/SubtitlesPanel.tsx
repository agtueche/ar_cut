import { useEffect, useState } from "react";
import { usePlayerStore } from "../../player/store/playerStore";
import { useCompositionDocument, editComposition } from "../compositionDocument";
import { parseSubtitles, exportSubtitles, type SubtitleCue } from "../subtitleFormat";
import { applySubtitles, readSubtitleCues, DEFAULT_SUBTITLE_STYLE } from "../subtitleComposition";
import { inputClass } from "./common";

export function SubtitlesPanel() {
  const { bridge, html } = useCompositionDocument();
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [style, setStyle] = useState(DEFAULT_SUBTITLE_STYLE);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!draft) setCues(readSubtitleCues(html));
  }, [html, draft]);
  const change = (next: SubtitleCue[]) => {
    setCues(next);
    setDraft(true);
  };
  const patch = (index: number, value: Partial<SubtitleCue>) =>
    change(cues.map((cue, i) => (i === index ? { ...cue, ...value } : cue)));
  const apply = async () => {
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      await editComposition(bridge, "Modifier les légendes", (source) =>
        applySubtitles(source, cues, style),
      );
      setDraft(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const download = (format: "srt" | "vtt") => {
    try {
      const url = URL.createObjectURL(
        new Blob([exportSubtitles(cues, format)], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `legendes.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <section aria-label="Légendes" className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <p className="text-text-muted">
        Importer ou saisir des segments, puis appliquer au montage. L’enregistrement du projet reste
        manuel.
      </p>
      <label className="flex flex-col gap-1">
        Importer SRT / VTT
        <input
          type="file"
          accept=".srt,.vtt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void file
                .text()
                .then((text) => {
                  change(parseSubtitles(text));
                  setError(null);
                })
                .catch((error) => setError(String(error)));
            e.target.value = "";
          }}
        />
      </label>
      <button
        className={inputClass}
        onClick={() => {
          const start = usePlayerStore.getState().currentTime;
          change([...cues, { start, end: start + 2, text: "Nouvelle légende" }]);
        }}
      >
        Ajouter un segment
      </button>
      <div className="flex gap-2">
        <label>
          Texte
          <input
            aria-label="Couleur des légendes"
            type="color"
            value={style.color}
            onChange={(e) => {
              setStyle({ ...style, color: e.target.value });
              setDraft(true);
            }}
          />
        </label>
        <label>
          Fond
          <input
            aria-label="Fond des légendes"
            type="color"
            value={style.background}
            onChange={(e) => {
              setStyle({ ...style, background: e.target.value });
              setDraft(true);
            }}
          />
        </label>
        <label>
          Taille
          <input
            aria-label="Taille des légendes"
            type="number"
            min={12}
            max={200}
            className={inputClass}
            value={style.size}
            onChange={(e) => {
              setStyle({ ...style, size: e.target.valueAsNumber });
              setDraft(true);
            }}
          />
        </label>
      </div>
      {cues.map((cue, index) => (
        <fieldset
          key={index}
          disabled={busy}
          className="flex flex-col gap-2 rounded border border-border p-2"
        >
          <legend>Segment {index + 1}</legend>
          <textarea
            aria-label={`Texte segment ${index + 1}`}
            className={inputClass}
            rows={2}
            value={cue.text}
            onChange={(e) => patch(index, { text: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            {(["start", "end"] as const).map((field) => (
              <label key={field}>
                {field === "start" ? "Début (s)" : "Fin (s)"}
                <input
                  aria-label={`${field === "start" ? "Début" : "Fin"} segment ${index + 1}`}
                  className={inputClass}
                  type="number"
                  min={0}
                  step={0.001}
                  value={cue[field]}
                  onChange={(e) => patch(index, { [field]: e.target.valueAsNumber })}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => usePlayerStore.getState().requestSeek(cue.start)}>Voir</button>
            <button
              onClick={() => {
                const time = usePlayerStore.getState().currentTime;
                if (time > cue.start && time < cue.end)
                  change([
                    ...cues.slice(0, index),
                    { ...cue, end: time },
                    { ...cue, start: time },
                    ...cues.slice(index + 1),
                  ]);
                else setError("Placez la tête de lecture dans le segment à diviser.");
              }}
            >
              Diviser ici
            </button>
            <button
              disabled={!cues[index + 1]}
              onClick={() => {
                const next = cues[index + 1];
                if (next)
                  change([
                    ...cues.slice(0, index),
                    { ...cue, end: Math.max(cue.end, next.end), text: cue.text + "\n" + next.text },
                    ...cues.slice(index + 2),
                  ]);
              }}
            >
              Fusionner suivant
            </button>
            <button onClick={() => change(cues.filter((_, i) => i !== index))}>Supprimer</button>
          </div>
        </fieldset>
      ))}
      <button
        disabled={busy || !bridge || !draft}
        className={inputClass}
        onClick={() => void apply()}
      >
        {busy ? "Application…" : "Appliquer au montage"}
      </button>
      {draft && (
        <p role="status">
          Segments en préparation : appliquez-les pour les inclure dans le montage.
        </p>
      )}
      <div className="flex gap-3">
        <button disabled={!cues.length} onClick={() => download("srt")}>
          Exporter SRT
        </button>
        <button disabled={!cues.length} onClick={() => download("vtt")}>
          Exporter VTT
        </button>
      </div>
      <p className="text-text-muted">
        La transcription automatique et la reconnaissance du chant ne sont pas disponibles dans
        cette installation.
      </p>
      {error && (
        <p role="alert" className="text-danger-ink">
          {error}
        </p>
      )}
    </section>
  );
}
