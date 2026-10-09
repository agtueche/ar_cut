import { useEffect, useState } from "react";
import { usePlayerStore } from "../../player/store/playerStore";
import {
  useCompositionDocument,
  editComposition,
  setRootAttribute,
  rootAttribute,
} from "../compositionDocument";
import {
  addMarker,
  parseMarkers,
  removeMarker,
  serializeMarkers,
  updateMarker,
  MARKERS_ATTR,
  type Marker,
} from "../markers";
import { TRACK_COLORS, isTrackColor } from "../trackMeta";
import { useMarkerStore } from "../markerStore";
import { inputClass } from "./common";

export function MarkerSync() {
  const { html } = useCompositionDocument();
  useEffect(() => {
    useMarkerStore.getState().setMarkers(parseMarkers(rootAttribute(html, MARKERS_ATTR)));
  }, [html]);
  useEffect(() => () => useMarkerStore.getState().setMarkers([]), []);
  return null;
}

export function MarkersPanel() {
  const { bridge } = useCompositionDocument();
  const markers = useMarkerStore((s) => s.markers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const write = async (change: (markers: Marker[]) => Marker[]) => {
    if (!bridge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await editComposition(bridge, "Modifier les marqueurs", async (html) => {
        const next = change(parseMarkers(rootAttribute(html, MARKERS_ATTR)));
        const result = await setRootAttribute(html, MARKERS_ATTR, serializeMarkers(next));
        return result;
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm"
      aria-label="Marqueurs"
    >
      <p className="text-text-muted">
        Les marqueurs servent de repères et de points d’aimantation. Le temps est en secondes.
      </p>
      <button
        disabled={busy || !bridge}
        className={inputClass}
        onClick={() =>
          void write((list) =>
            addMarker(list, usePlayerStore.getState().currentTime, `Repère ${list.length + 1}`),
          )
        }
      >
        Ajouter à la tête de lecture
      </button>
      {markers.map((marker) => (
        <fieldset
          key={`${marker.id}-${marker.name}-${marker.time}-${marker.color}`}
          disabled={busy}
          className="flex flex-col gap-2 rounded border border-border p-2"
        >
          <label>
            Nom
            <input
              aria-label={`Nom ${marker.id}`}
              className={inputClass}
              defaultValue={marker.name}
              maxLength={80}
              onBlur={(e) => {
                if (e.target.value !== marker.name)
                  void write((list) => updateMarker(list, marker.id, { name: e.target.value }));
              }}
            />
          </label>
          <label>
            Temps (s)
            <input
              aria-label={`Temps ${marker.id}`}
              className={inputClass}
              type="number"
              min={0}
              step={0.001}
              defaultValue={marker.time}
              onBlur={(e) => {
                const time = e.target.valueAsNumber;
                if (Number.isFinite(time) && time >= 0 && time !== marker.time)
                  void write((list) => updateMarker(list, marker.id, { time }));
              }}
            />
          </label>
          <select
            aria-label={`Couleur ${marker.id}`}
            className={inputClass}
            value={marker.color}
            onChange={(e) => {
              const color = e.target.value;
              if (isTrackColor(color))
                void write((list) => updateMarker(list, marker.id, { color }));
            }}
          >
            {TRACK_COLORS.map((color) => (
              <option key={color}>{color}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <button onClick={() => usePlayerStore.getState().requestSeek(marker.time)}>
              Aller au repère
            </button>
            <button onClick={() => void write((list) => removeMarker(list, marker.id))}>
              Supprimer
            </button>
          </div>
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-danger-ink">
          {error}
        </p>
      )}
    </section>
  );
}
