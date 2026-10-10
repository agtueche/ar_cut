import { useState } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import {
  recordingApi,
  recordingFileUrl,
  type EnhanceOptions,
  type RecordingItem,
} from "../../creator/creatorApi";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { filename } from "./assetHelpers";

export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptions = {
  denoise: "medium",
  deEss: true,
  voiceEq: true,
  compress: true,
  normalize: true,
  trimSilence: true,
};

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function importTake(path: string, onImport: (files: FileList) => void | Promise<void>) {
  const response = await studioApiFetch(recordingFileUrl(path));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], filename(path), { type: blob.type }));
  await onImport(transfer.files);
}

function EnhancePanel({ item, onDone }: { item: RecordingItem; onDone: () => void }) {
  const label = useStudioLabel();
  const [options, setOptions] = useState<EnhanceOptions>(DEFAULT_ENHANCE_OPTIONS);
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const toggle = (key: Exclude<keyof EnhanceOptions, "denoise">, text: string, hint: string) => (
    <label className="flex items-start gap-1.5 text-[10px] text-panel-text-3" title={hint}>
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
        className="mt-px"
      />
      {text}
    </label>
  );
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-md bg-panel-input/60 p-2">
      <label className="flex items-center justify-between gap-2 text-[10px] text-panel-text-3">
        {label("Noise reduction", "Réduction du bruit")}
        <select
          value={options.denoise}
          onChange={(e) =>
            setOptions((o) => ({ ...o, denoise: e.target.value as EnhanceOptions["denoise"] }))
          }
          className="rounded bg-panel-input px-1 py-0.5 text-[10px] text-panel-text-1"
        >
          <option value="off">{label("None", "Aucune")}</option>
          <option value="light">{label("Light (hiss)", "Légère (souffle)")}</option>
          <option value="medium">{label("Medium (voice AI)", "Moyenne (IA voix)")}</option>
          <option value="strong">{label("Strong (noisy room)", "Forte (pièce bruyante)")}</option>
        </select>
      </label>
      {toggle(
        "voiceEq",
        label("Voice EQ (clearer, less boomy)", "Égaliseur voix (plus clair, moins sourd)"),
        label(
          "Cuts mud around 250 Hz, adds presence around 3.5 kHz",
          "Atténue le côté sourd vers 250 Hz, ajoute de la présence vers 3,5 kHz",
        ),
      )}
      {toggle(
        "deEss",
        label("Soften harsh « s »", "Adoucir les « s » sifflants"),
        label("De-esser", "De-esser"),
      )}
      {toggle(
        "compress",
        label("Even out the volume (compression)", "Égaliser le volume (compression)"),
        label(
          "Quiet words come up, loud ones come down",
          "Les mots faibles remontent, les forts sont contenus",
        ),
      )}
      {toggle(
        "normalize",
        label("Video loudness (-16 LUFS)", "Volume aux normes vidéo (-16 LUFS)"),
        label(
          "Same loudness as YouTube, TikTok or podcasts",
          "Même niveau sonore que YouTube, TikTok ou les podcasts",
        ),
      )}
      {toggle(
        "trimSilence",
        label("Trim silence at start and end", "Couper les silences au début et à la fin"),
        label(
          "Removes the dead air before and after you speak",
          "Retire les blancs avant et après la parole",
        ),
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() => {
            setState("busy");
            setMessage(null);
            recordingApi.enhance(item.path, options).then(
              () => {
                setState("idle");
                onDone();
              },
              (e: unknown) => {
                setState("failed");
                setMessage(e instanceof Error ? e.message : null);
              },
            );
          }}
          className="rounded-md bg-panel-accent/15 px-2 py-1 text-[10px] font-semibold text-accent-ink enabled:hover:bg-panel-accent/25 disabled:opacity-60"
        >
          {state === "busy" ? label("Processing…", "Traitement…") : label("Enhance", "Améliorer")}
        </button>
        {state === "failed" && (
          <span className="text-[10px] text-danger-ink">{message ?? label("Failed", "Échec")}</span>
        )}
      </div>
      <p className="text-[9px] leading-snug text-panel-text-5">
        {label(
          "The original take is kept: compare both before using one.",
          "La prise d'origine est conservée : comparez les deux avant d'en utiliser une.",
        )}
      </p>
    </div>
  );
}

function TakeRow({
  item,
  onImport,
  onChanged,
}: {
  item: RecordingItem;
  onImport?: (files: FileList) => void | Promise<void>;
  onChanged: () => void;
}) {
  const label = useStudioLabel();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [library, setLibrary] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [confirm, setConfirm] = useState(false);
  const src = recordingFileUrl(item.path);
  const btn =
    "rounded-md bg-panel-input px-1.5 py-0.5 text-[10px] font-medium text-panel-text-3 enabled:hover:text-panel-text-1 disabled:opacity-60";
  const mark = (s: string, idle: string) =>
    s === "busy" ? "…" : s === "done" ? "✓" : s === "failed" ? label("Retry", "Réessayer") : idle;
  return (
    <div className="border-t border-panel-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-medium text-panel-text-2"
          title={item.path}
        >
          {item.path.replace(/\.[^.]+$/, "")}
        </span>
        {item.enhanced && (
          <span className="shrink-0 rounded-sm bg-panel-accent/15 px-1 py-px text-[9px] font-semibold text-accent-ink">
            {label("Enhanced", "Améliorée")}
          </span>
        )}
        <span className="shrink-0 text-[10px] tabular-nums text-panel-text-5">
          {formatDuration(item.duration)}
        </span>
      </div>
      {item.kind === "video" ? (
        <video
          src={src}
          controls
          preload="metadata"
          className="mt-1 w-full rounded-sm bg-neutral-900"
        />
      ) : (
        <audio src={src} controls preload="none" className="mt-1 h-7 w-full" />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {!item.enhanced && (
          <button
            type="button"
            className={btn}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {label("Enhance voice…", "Améliorer la voix…")}
          </button>
        )}
        {onImport && (
          <button
            type="button"
            className={btn}
            disabled={project === "busy" || project === "done"}
            onClick={() => {
              setProject("busy");
              importTake(item.path, onImport).then(
                () => setProject("done"),
                () => setProject("failed"),
              );
            }}
          >
            {mark(project, label("+ Project", "+ Projet"))}
          </button>
        )}
        <button
          type="button"
          className={btn}
          disabled={library === "busy" || library === "done"}
          onClick={() => {
            setLibrary("busy");
            recordingApi.toLibrary(item.path).then(
              () => setLibrary("done"),
              () => setLibrary("failed"),
            );
          }}
        >
          {mark(library, label("+ Library", "+ Biblio"))}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            void recordingApi.remove(item.path).then(onChanged, () => setConfirm(false));
          }}
          onBlur={() => setConfirm(false)}
          aria-label={label("Delete this take", "Supprimer cette prise")}
          className={`ml-auto rounded px-1 text-[10px] ${confirm ? "bg-danger/15 text-danger-ink" : "text-panel-text-5 hover:text-panel-text-1"}`}
        >
          {confirm ? label("Delete?", "Supprimer ?") : "×"}
        </button>
      </div>
      {open && (
        <EnhancePanel
          item={item}
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export function RecordingsList({
  items,
  onImport,
  onChanged,
}: {
  items: RecordingItem[] | null;
  onImport?: (files: FileList) => void | Promise<void>;
  onChanged: () => void;
}) {
  const label = useStudioLabel();
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 border-t border-panel-border px-3 py-2">
        <h3 className="text-[12px] font-semibold text-panel-text-1">
          {label("My takes", "Mes prises")}
        </h3>
        <span className="text-[11px] text-panel-text-5">{items?.length ?? 0}</span>
      </div>
      {items === null ? (
        <p className="px-3 py-2 text-[11px] text-panel-text-5">
          {label("Loading…", "Chargement…")}
        </p>
      ) : items.length === 0 ? (
        <p className="px-3 pb-3 text-[11px] leading-snug text-panel-text-5">
          {label(
            "No take yet. Your recordings appear here.",
            "Aucune prise pour l'instant. Vos enregistrements apparaîtront ici.",
          )}
        </p>
      ) : (
        items.map((item) => (
          <TakeRow key={item.path} item={item} onImport={onImport} onChanged={onChanged} />
        ))
      )}
    </div>
  );
}
