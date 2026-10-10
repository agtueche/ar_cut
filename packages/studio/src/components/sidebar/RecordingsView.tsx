import { Desktop, Microphone, VideoCamera } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { recordingApi, type RecordingItem, type RecordingKind } from "../../creator/creatorApi";
import { DEFAULT_ENHANCE_OPTIONS, RecordingsList } from "./RecordingsList";
import {
  DEFAULT_LIVE,
  levelVerdict,
  useMediaDevices,
  useRecorder,
  type LiveProcessing,
} from "./useRecorder";

const KINDS: Array<{ id: RecordingKind; en: string; fr: string; icon: ReactNode }> = [
  { id: "voice", en: "Voice-over", fr: "Voix off", icon: <Microphone size={14} /> },
  { id: "webcam", en: "Webcam", fr: "Webcam", icon: <VideoCamera size={14} /> },
  { id: "screen", en: "Screen", fr: "Écran", icon: <Desktop size={14} /> },
];

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Level bar from -60 to 0 dBFS, with the target zone marked. */
function LevelMeter({ rms, peak }: { rms: number; peak: number }) {
  const pct = (db: number) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
  const verdict = levelVerdict({ rms, peak, clips: 0 });
  return (
    <div
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-panel-input"
      aria-hidden="true"
    >
      {/* target zone: -24 … -6 dBFS */}
      <div
        className="absolute inset-y-0 bg-panel-accent/15"
        style={{ left: pct(-24), width: `${(18 / 60) * 100}%` }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${verdict === "loud" ? "bg-danger" : verdict === "good" ? "bg-accent" : "bg-panel-text-5"}`}
        style={{ width: pct(rms) }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-panel-text-1" style={{ left: pct(peak) }} />
    </div>
  );
}

export function RecordingsView({
  onImport,
}: {
  onImport?: (files: FileList) => void | Promise<void>;
}) {
  const label = useStudioLabel();
  const [kind, setKind] = useState<RecordingKind>("voice");
  const [live, setLive] = useState<LiveProcessing>(DEFAULT_LIVE);
  const [micId, setMicId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(() => {
    recordingApi.list().then(
      (r) => setItems(r.items),
      () => setItems([]),
    );
  }, []);
  useEffect(refresh, [refresh]);

  const onRecorded = useCallback(
    (blob: Blob) => {
      setSaving(label("Saving the take…", "Enregistrement de la prise…"));
      setSaveError(null);
      recordingApi
        .upload(kind, blob)
        .then(async ({ path }) => {
          if (autoEnhance && kind === "voice") {
            setSaving(label("Enhancing the voice…", "Amélioration de la voix…"));
            await recordingApi.enhance(path, DEFAULT_ENHANCE_OPTIONS);
          }
        })
        .catch((e: unknown) =>
          setSaveError(
            e instanceof Error ? e.message : label("Save failed", "Échec de l'enregistrement"),
          ),
        )
        .finally(() => {
          setSaving(null);
          refresh();
        });
    },
    [kind, autoEnhance, label, refresh],
  );

  const rec = useRecorder({ kind, live, micId, cameraId, onRecorded });
  const { mics, cameras } = useMediaDevices(rec.phase);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = kind === "voice" ? null : rec.stream;
  }, [rec.stream, kind]);

  const verdict = levelVerdict(rec.level);
  const verdictText: Record<typeof verdict, string> = {
    silent: label(
      "No sound — speak to test your level.",
      "Aucun son — parlez pour tester le niveau.",
    ),
    low: label(
      "Too quiet — move closer to the microphone.",
      "Trop faible — rapprochez-vous du micro.",
    ),
    good: label("Good level.", "Bon niveau."),
    loud: label(
      "Too loud — move back or lower the gain.",
      "Trop fort — reculez ou baissez le gain.",
    ),
  };
  const busy =
    rec.phase === "starting" ||
    rec.phase === "recording" ||
    rec.phase === "paused" ||
    rec.phase === "countdown";
  const chip = (key: keyof LiveProcessing, text: string, hint: string) => (
    <button
      type="button"
      disabled={busy}
      aria-pressed={live[key]}
      title={hint}
      onClick={() => setLive((l) => ({ ...l, [key]: !l[key] }))}
      className={`rounded-full px-2 py-0.5 text-[10px] transition-colors disabled:opacity-60 ${
        live[key]
          ? "bg-panel-accent/15 text-accent-ink"
          : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
      }`}
    >
      {live[key] ? "✓ " : ""}
      {text}
    </button>
  );
  const select = "w-full min-w-0 rounded bg-panel-input px-1.5 py-1 text-[10px] text-panel-text-1";

  return (
    <div className="flex flex-col">
      <div
        role="tablist"
        aria-label={label("Recording type", "Type d'enregistrement")}
        className="creator-stock-tabs mx-3 mb-2 mt-1 grid grid-cols-3 gap-0.5 rounded-md bg-panel-input p-0.5"
      >
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            disabled={busy}
            onClick={() => setKind(k.id)}
            title={label(k.en, k.fr)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-medium transition-colors disabled:opacity-60 ${
              kind === k.id
                ? "bg-panel-accent/15 text-accent-ink"
                : "text-panel-text-3 hover:text-panel-text-1"
            }`}
          >
            {k.icon}
            <span className="creator-stock-tab-label truncate">{label(k.en, k.fr)}</span>
          </button>
        ))}
      </div>

      <div className="mx-3 flex flex-col gap-2 rounded-md border border-panel-border p-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-panel-text-5">
          {label("Microphone", "Micro")}
          <select
            className={select}
            value={micId}
            disabled={busy}
            onChange={(e) => setMicId(e.target.value)}
          >
            <option value="">{label("Default microphone", "Micro par défaut")}</option>
            {mics.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `${label("Microphone", "Micro")} ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        {kind === "webcam" && (
          <label className="flex flex-col gap-0.5 text-[10px] text-panel-text-5">
            {label("Camera", "Caméra")}
            <select
              className={select}
              value={cameraId}
              disabled={busy}
              onChange={(e) => setCameraId(e.target.value)}
            >
              <option value="">{label("Default camera", "Caméra par défaut")}</option>
              {cameras.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `${label("Camera", "Caméra")} ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <div className="mb-1 text-[10px] text-panel-text-5">
            {label("Live processing", "Traitement en direct")}
          </div>
          <div className="flex flex-wrap gap-1">
            {chip(
              "noiseSuppression",
              label("Noise reduction", "Réduction du bruit"),
              label(
                "Removes steady background noise while you record",
                "Retire le bruit de fond constant pendant l'enregistrement",
              ),
            )}
            {chip(
              "echoCancellation",
              label("Echo cancellation", "Anti-écho"),
              label(
                "Prevents speakers or room echo from being recorded",
                "Évite d'enregistrer l'écho de la pièce ou des haut-parleurs",
              ),
            )}
            {chip(
              "autoGainControl",
              label("Auto gain", "Gain automatique"),
              label("Keeps a steady level if you move", "Garde un niveau régulier si vous bougez"),
            )}
          </div>
        </div>

        {kind !== "voice" && rec.stream && (
          <video
            ref={previewRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded-sm bg-neutral-900"
          />
        )}

        {rec.phase !== "idle" && rec.phase !== "error" && rec.phase !== "starting" && (
          <div className="flex flex-col gap-1">
            <LevelMeter rms={rec.level.rms} peak={rec.level.peak} />
            <span
              className={`text-[10px] ${verdict === "loud" ? "text-danger-ink" : verdict === "good" ? "text-accent-ink" : "text-panel-text-5"}`}
            >
              {verdictText[verdict]}
              {rec.level.clips > 0
                ? ` ${label("Clipping detected:", "Saturation détectée :")} ${rec.level.clips}`
                : ""}
            </span>
          </div>
        )}

        {rec.error && (
          <p role="alert" className="text-[10px] text-danger-ink">
            {rec.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {(rec.phase === "idle" || rec.phase === "error") && (
            <button
              type="button"
              onClick={() => void rec.startMonitor()}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-[12px] font-semibold text-on-accent shadow-sm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {kind === "voice" ? (
                <Microphone size={18} weight="fill" aria-hidden="true" />
              ) : kind === "webcam" ? (
                <VideoCamera size={18} weight="fill" aria-hidden="true" />
              ) : (
                <Desktop size={18} weight="fill" aria-hidden="true" />
              )}
              {kind === "screen"
                ? label("Choose the screen…", "Choisir l'écran…")
                : kind === "webcam"
                  ? label("Turn on camera and mic", "Activer caméra et micro")
                  : label("Turn on the microphone", "Activer le micro")}
            </button>
          )}
          {rec.phase === "starting" && (
            <div role="status" className="text-[11px] text-panel-text-5">
              <p>
                {label(
                  "Allow microphone access in your browser…",
                  "Autorisez l’accès au micro dans votre navigateur…",
                )}
              </p>
              <button type="button" onClick={rec.close} className="mt-2 underline">
                {label("Cancel", "Annuler la demande")}
              </button>
            </div>
          )}
          {rec.phase === "ready" && (
            <>
              <button
                type="button"
                onClick={rec.record}
                disabled={saving !== null}
                className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-[11px] font-semibold text-on-danger disabled:opacity-60"
              >
                ● {label("Record", "Enregistrer")}
              </button>
              <button
                type="button"
                onClick={rec.close}
                className="text-[10px] text-panel-text-5 hover:text-panel-text-1"
              >
                {label("Turn off", "Désactiver")}
              </button>
            </>
          )}
          {rec.phase === "countdown" && (
            <span
              className="text-[18px] font-bold tabular-nums text-panel-text-1"
              aria-live="assertive"
            >
              {rec.countdown}
            </span>
          )}
          {(rec.phase === "recording" || rec.phase === "paused") && (
            <>
              <span className="flex items-center gap-1 text-[12px] font-semibold tabular-nums text-panel-text-1">
                <span
                  className={`h-2 w-2 rounded-full ${rec.phase === "recording" ? "animate-pulse bg-danger" : "bg-panel-text-5"}`}
                />
                {clock(rec.elapsed)}
              </span>
              {rec.phase === "recording" ? (
                <button
                  type="button"
                  onClick={rec.pause}
                  className="rounded-md bg-panel-input px-2 py-1 text-[10px] text-panel-text-2 hover:text-panel-text-1"
                >
                  ❚❚ {label("Pause", "Pause")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={rec.resume}
                  className="rounded-md bg-panel-input px-2 py-1 text-[10px] text-panel-text-2 hover:text-panel-text-1"
                >
                  ▶ {label("Resume", "Reprendre")}
                </button>
              )}
              <button
                type="button"
                onClick={rec.stop}
                className="rounded-md bg-panel-input px-2 py-1 text-[10px] font-semibold text-panel-text-1"
              >
                ■ {label("Stop", "Arrêter")}
              </button>
            </>
          )}
        </div>

        {kind === "voice" && (
          <label className="flex items-start gap-1.5 text-[10px] text-panel-text-3">
            <input
              type="checkbox"
              checked={autoEnhance}
              onChange={(e) => setAutoEnhance(e.target.checked)}
              className="mt-px"
            />
            {label(
              "Enhance the voice automatically after each take (the original is kept)",
              "Améliorer la voix automatiquement après chaque prise (l'original est conservé)",
            )}
          </label>
        )}
        {saving && <p className="text-[10px] text-accent-ink">{saving}</p>}
        {saveError && <p className="text-[10px] text-danger-ink">{saveError}</p>}

        <details className="text-[10px] text-panel-text-5">
          <summary className="cursor-pointer text-panel-text-3">
            {label("Tips for clean sound", "Conseils pour un son propre")}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-snug">
            <li>
              {label(
                "Stay 15–20 cm from the microphone, slightly to the side.",
                "Restez à 15–20 cm du micro, légèrement de côté.",
              )}
            </li>
            <li>
              {label(
                "Soft rooms sound better: curtains, sofa, wardrobe of clothes.",
                "Une pièce « molle » sonne mieux : rideaux, canapé, penderie.",
              )}
            </li>
            <li>
              {label(
                "Turn off fans, air conditioning and notifications.",
                "Coupez ventilateur, climatisation et notifications.",
              )}
            </li>
            <li>
              {label(
                "Aim for the green zone: steady, never red.",
                "Visez la zone verte du niveau : régulier, jamais rouge.",
              )}
            </li>
            <li>
              {label(
                "Use headphones so the microphone does not pick up the speakers.",
                "Mettez un casque pour que le micro ne capte pas les haut-parleurs.",
              )}
            </li>
          </ul>
        </details>
      </div>

      <RecordingsList items={items} onImport={onImport} onChanged={refresh} />
    </div>
  );
}
