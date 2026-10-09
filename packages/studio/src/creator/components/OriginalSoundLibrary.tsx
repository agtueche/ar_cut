import { useEffect, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { ORIGINAL_SOUNDS, synthesizeOriginalSound, type OriginalSoundId } from "../originalSounds";
import { inputClass } from "./common";
export function OriginalSoundLibrary() {
  const { uploadProjectFiles } = useFileManagerContext();
  const [category, setCategory] = useState("Tous");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const generate = (id: OriginalSoundId) =>
    new Blob([synthesizeOriginalSound(id)], { type: "audio/wav" });
  const add = async (id: OriginalSoundId) => {
    setBusy(true);
    try {
      await uploadProjectFiles(
        [
          new File([generate(id)], `studio-${id}-${crypto.randomUUID()}.wav`, {
            type: "audio/wav",
          }),
        ],
        "assets",
      );
      setStatus("Son importé dans la bibliothèque. Ajoutez-le au montage quand vous le souhaitez.");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded border border-border p-3">
      <summary className="cursor-pointer font-medium">Sons originaux gratuits</summary>
      <p className="my-2 text-xs text-text-muted">
        Synthèse locale sans échantillons tiers. Utilisation commerciale autorisée, sans attribution
        obligatoire. Aucun ajout automatique au montage.
      </p>
      <input
        aria-label="Rechercher un son original"
        className={inputClass}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher…"
      />
      <select
        aria-label="Catégorie sonore"
        className={inputClass}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {["Tous", "Interface", "Transition", "Impact", "Musique"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      {ORIGINAL_SOUNDS.filter(
        (p) =>
          (category === "Tous" || p.category === category) &&
          p.name.toLowerCase().includes(query.toLowerCase()),
      ).map((p) => (
        <div className="my-2 rounded border border-border p-2" key={p.id}>
          <p>
            {p.name} · {p.duration} s
          </p>
          <div className="mt-1 flex gap-3">
            <button onClick={() => setPreview(URL.createObjectURL(generate(p.id)))}>
              Préécouter {p.name}
            </button>
            <button disabled={busy} onClick={() => void add(p.id)}>
              Importer
            </button>
          </div>
        </div>
      ))}
      {preview && <audio controls autoPlay src={preview} className="w-full" />}
      <p role="status">{status}</p>
    </details>
  );
}
