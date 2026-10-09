import { OriginalSoundLibrary } from "./OriginalSoundLibrary";
import { useEffect, useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioBridge } from "../studioBridge";
import { SpatialAudioPanel } from "./SpatialAudioPanel";
import { inputClass } from "./common";

export function SoundPanel({ onAdd }: { onAdd?: (path: string) => void }) {
  const { assets, uploadProjectFiles } = useFileManagerContext();
  const bridge = useStudioBridge();
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  const record = async () => {
    try {
      if (recording) {
        recorder.current?.stop();
        return;
      }
      setError("");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const instance = new MediaRecorder(media);
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        setRecording(false);
        media.getTracks().forEach((track) => track.stop());
        const mime = instance.mimeType;
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        void uploadProjectFiles(
          [new File(chunks, `micro-${crypto.randomUUID()}.${ext}`, { type: mime })],
          "assets",
        ).catch((error) => setError(String(error)));
      };
      instance.start();
      setRecording(true);
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <section aria-label="Son" className="flex h-full flex-col gap-4 overflow-auto p-3 text-sm">
      <label>
        Importer un son
        <input
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => {
            if (e.target.files)
              void uploadProjectFiles(Array.from(e.target.files), "assets").catch((error) =>
                setError(String(error)),
              );
            e.target.value = "";
          }}
        />
      </label>
      <button className={inputClass} onClick={() => void record()}>
        {recording ? "Arrêter et importer l’enregistrement" : "Enregistrer au microphone"}
      </button>
      {recording && <p role="status">Enregistrement en cours…</p>}
      <input
        aria-label="Rechercher un son"
        placeholder="Rechercher un son…"
        className={inputClass}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {assets
        .filter(
          (path) =>
            /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(path) &&
            path.toLowerCase().includes(search.toLowerCase()),
        )
        .map((path) => (
          <div key={path} className="flex flex-col gap-2 rounded border border-border p-2">
            <p className="break-all">{path}</p>
            <audio
              controls
              preload="none"
              className="w-full"
              src={`/api/projects/${encodeURIComponent(bridge?.projectId ?? "")}/preview/${path.split("/").map(encodeURIComponent).join("/")}`}
            />
            <button disabled={!onAdd} onClick={() => onAdd?.(path)}>
              Ajouter à la timeline
            </button>
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
      <OriginalSoundLibrary />
      <SpatialAudioPanel />
    </section>
  );
}
