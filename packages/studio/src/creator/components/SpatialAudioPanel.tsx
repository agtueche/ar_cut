import { SpatialPositionView } from "./SpatialPositionView";
import { useEffect, useId, useState } from "react";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { openComposition } from "@hyperframes/sdk";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { usePlayerStore } from "../../player/store/playerStore";
import { useCompositionDocument, editComposition } from "../compositionDocument";
import { relativeToComposition } from "../insertElement";
import { nextTrackIndex } from "../elementPresets";
import { DEFAULT_SPATIAL, renderSpatialAudio, type SpatialSettings } from "../spatialAudio";
import { inputClass } from "./common";

export function SpatialAudioPanel() {
  const referenceListId = useId();
  const { bridge, html } = useCompositionDocument();
  const { assets, uploadProjectFiles } = useFileManagerContext();
  const [source, setSource] = useState("");
  const [settings, setSettings] = useState<SpatialSettings>(DEFAULT_SPATIAL);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  const processed = [...doc.querySelectorAll("audio[data-creator-spatial]")];
  const choose = (id: string) => {
    setTarget(id);
    const el = processed.find((el) => el.id === id);
    if (el) {
      try {
        const stored = JSON.parse(el.getAttribute("data-creator-spatial")!);
        setSettings(stored.settings);
        setSource(stored.source);
      } catch {
        setMessage("Configuration audio illisible.");
      }
    }
  };
  const render = async (insert: boolean) => {
    if (!bridge || !source || busy) return;
    setBusy(true);
    setMessage("Calcul binaural local…");
    try {
      const response = await studioApiFetch(
        `/api/projects/${encodeURIComponent(bridge.projectId)}/preview/${source.split("/").map(encodeURIComponent).join("/")}`,
      );
      if (!response.ok) throw new Error("Source audio introuvable.");
      const result = await renderSpatialAudio(await response.arrayBuffer(), settings);
      const blob = new Blob([result.bytes], { type: "audio/wav" });
      setPreview(URL.createObjectURL(blob));
      if (insert) {
        const name = `binaural-${crypto.randomUUID()}.wav`;
        const paths = await uploadProjectFiles(
          [new File([blob], name, { type: "audio/wav" })],
          "assets",
        );
        const path = paths[0];
        if (!path) throw new Error("Import du son traité impossible.");
        await editComposition(bridge, "Spatialisation binaurale", async (before) => {
          const comp = await openComposition(before, { history: false });
          const elements = comp.getElements();
          const root = elements.find((el) => el.attributes["data-composition-id"] !== undefined);
          if (!root) throw new Error("Composition introuvable.");
          const src = relativeToComposition(bridge.activeCompPath ?? "index.html", path);
          let el = elements.find(
            (el) => el.attributes.id === target && el.attributes["data-creator-spatial"],
          );
          if (el?.attributes["data-timeline-locked"] !== undefined)
            throw new Error("Cette piste est verrouillée.");
          const start = el
            ? Number(el.attributes["data-start"])
            : usePlayerStore.getState().currentTime;
          if (start + result.duration > Number(root.attributes["data-duration"]))
            throw new Error("Le son dépasse la durée du projet. Augmentez-la avant insertion.");
          const id =
            el?.id ??
            comp.addElement(
              root.id,
              root.children.length,
              `<audio id="spatial-${crypto.randomUUID()}" class="clip" data-start="${start}" data-duration="${result.duration}" data-track-index="${nextTrackIndex(before)}"></audio>`,
            );
          comp.setAttribute(id, "src", src);
          comp.setAttribute(id, "data-creator-spatial", JSON.stringify({ source, settings }));
          comp.setAttribute(id, "data-track-name", "Son binaural");
          return comp.serialize();
        });
      }
      setMessage(
        insert
          ? "Son binaural appliqué au montage. Enregistrez le projet pour le conserver."
          : "Aperçu binaural prêt. Écoutez au casque.",
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy} className="flex flex-col gap-3 rounded border border-border p-3">
      <legend>Spatialisation binaurale</legend>
      <p className="text-text-muted">
        Casque stéréo. Auditeur orienté vers −Z, haut = +Y, droite = +X ; positions en mètres. Le
        repère visuel est une annotation, il ne déplace pas l’auditeur. La perception avant/arrière
        varie selon l’auditeur.
      </p>
      <label>
        Clip à traiter
        <select className={inputClass} value={target} onChange={(e) => choose(e.target.value)}>
          <option value="">Nouveau clip</option>
          {processed.map((el) => (
            <option key={el.id} value={el.id}>
              {el.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Source
        <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Choisir un son</option>
          {assets
            .filter(
              (path) =>
                /\.(wav|mp3|m4a|ogg|flac|aac|webm)$/i.test(path) && !path.includes("binaural-"),
            )
            .map((path) => (
              <option key={path}>{path}</option>
            ))}
        </select>
      </label>
      <label>
        Repère visuel (facultatif)
        <input
          className={inputClass}
          value={settings.reference}
          placeholder="Nom du personnage ou de l’objet"
          list={referenceListId}
          onChange={(e) => setSettings({ ...settings, reference: e.target.value })}
        />
      </label>
      <datalist id={referenceListId}>
        {[...doc.querySelectorAll(".clip[id]:not(audio)")].map((el) => (
          <option key={el.id} value={el.id} />
        ))}
      </datalist>
      <p>Auditeur virtuel</p>
      <div className="grid grid-cols-3 gap-2">
        {(["x", "y", "z"] as const).map((axis) => (
          <label key={axis}>
            {axis.toUpperCase()}
            <input
              className={inputClass}
              aria-label={`Auditeur ${axis}`}
              type="number"
              min={-100}
              max={100}
              step={0.1}
              value={settings.listener[axis]}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  listener: { ...settings.listener, [axis]: e.target.valueAsNumber },
                })
              }
            />
          </label>
        ))}
      </div>
      <SpatialPositionView settings={settings} onChange={setSettings} />
      <p>Source — images clés à interpolation linéaire</p>
      {settings.points.map((point, index) => (
        <div key={index} className="grid grid-cols-4 gap-1">
          {(["time", "x", "y", "z"] as const).map((axis) => (
            <label key={axis}>
              {axis === "time" ? "Temps (s)" : axis.toUpperCase()}
              <input
                className={inputClass}
                aria-label={`Source ${index + 1} ${axis}`}
                type="number"
                step={0.1}
                value={point[axis]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    points: settings.points.map((p, i) =>
                      i === index ? { ...p, [axis]: e.target.valueAsNumber } : p,
                    ),
                  })
                }
              />
            </label>
          ))}
          {index > 0 && (
            <button
              onClick={() =>
                setSettings({ ...settings, points: settings.points.filter((_, i) => i !== index) })
              }
            >
              Retirer
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() =>
          setSettings({
            ...settings,
            points: [
              ...settings.points,
              { time: (settings.points.at(-1)?.time ?? 0) + 1, x: 1, y: 0, z: -1 },
            ],
          })
        }
      >
        Ajouter une image clé
      </button>
      <div className="flex flex-wrap gap-2">
        <button className={inputClass} disabled={!source} onClick={() => void render(false)}>
          Calculer l’aperçu
        </button>
        <button className={inputClass} disabled={!source} onClick={() => void render(true)}>
          {target ? "Appliquer au clip" : "Insérer à la tête de lecture"}
        </button>
      </div>
      {preview && <audio controls src={preview} className="w-full" />}
      <p role="status">{message}</p>
      <p className="text-text-muted">
        Le traitement HRTF produit un WAV stéréo utilisé à l’identique dans l’aperçu et l’export. La
        source reste intacte. Limite : 3 minutes et 64 Mo par source.
      </p>
    </fieldset>
  );
}
