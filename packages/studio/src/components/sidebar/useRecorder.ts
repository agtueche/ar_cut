// Recorder for « Enregistrements »: microphone (voice-over), webcam or screen.
// Live browser processing (noise suppression, echo cancellation, auto gain)
// happens at capture; the heavier clean-up runs on the server afterwards.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingKind } from "../../creator/creatorApi";

export type RecorderPhase =
  | "idle"
  | "starting"
  | "ready"
  | "countdown"
  | "recording"
  | "paused"
  | "error";

export interface LiveProcessing {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_LIVE: LiveProcessing = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export interface LevelReading {
  /** RMS level in dBFS over the last ~100 ms (-100 when silent). */
  rms: number;
  /** Peak in dBFS over the last ~100 ms. */
  peak: number;
  /** Times the signal touched full scale since monitoring started. */
  clips: number;
}

export type LevelVerdict = "silent" | "low" | "good" | "loud";

/** What to tell the speaker about their level. Pure — unit-tested. */
export function levelVerdict({ rms, peak }: LevelReading): LevelVerdict {
  if (peak > -1) return "loud";
  if (rms < -50) return "silent";
  if (rms < -32) return "low";
  return "good";
}

function pickMimeType(video: boolean): string | undefined {
  const candidates = video
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find(
    (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
  );
}

export function useRecorder({
  kind,
  live,
  micId,
  cameraId,
  onRecorded,
}: {
  kind: RecordingKind;
  live: LiveProcessing;
  micId: string;
  cameraId: string;
  onRecorded: (blob: Blob) => void;
}) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelReading>({ rms: -100, peak: -100, clips: 0 });
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const captureAttempt = useRef(0);
  const captureTimeout = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const stopMonitor = useCallback(() => {
    captureAttempt.current++;
    if (captureTimeout.current !== null) window.clearTimeout(captureTimeout.current);
    captureTimeout.current = null;
    if (meterRef.current !== null) window.clearInterval(meterRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    meterRef.current = null;
    timerRef.current = null;
    for (const s of streamsRef.current) for (const t of s.getTracks()) t.stop();
    streamsRef.current = [];
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setStream(null);
    setLevel({ rms: -100, peak: -100, clips: 0 });
  }, []);

  useEffect(() => stopMonitor, [stopMonitor]);
  // Changing the source or the live processing needs a fresh capture.
  useEffect(() => {
    if (recorderRef.current) return;
    stopMonitor();
    setPhase("idle");
  }, [
    kind,
    micId,
    cameraId,
    live.noiseSuppression,
    live.echoCancellation,
    live.autoGainControl,
    stopMonitor,
  ]);

  const startMonitor = useCallback(async () => {
    stopMonitor();
    const attempt = captureAttempt.current;
    setError(null);
    setPhase("starting");
    captureTimeout.current = window.setTimeout(() => {
      if (attempt !== captureAttempt.current) return;
      stopMonitor();
      setError(
        "Le navigateur ne répond pas à la demande du micro. Autorisez le microphone dans le navigateur et dans Réglages Système → Confidentialité et sécurité → Microphone. Si vous utilisez le navigateur intégré, ouvrez cette même adresse dans Safari ou Chrome, puis réessayez.",
      );
      setPhase("error");
    }, 15000);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("capture-unavailable");
      }
      const audio: MediaTrackConstraints = {
        deviceId: micId ? { exact: micId } : undefined,
        channelCount: 1,
        sampleRate: 48000,
        noiseSuppression: live.noiseSuppression,
        echoCancellation: live.echoCancellation,
        autoGainControl: live.autoGainControl,
      };
      let combined: MediaStream;
      if (kind === "voice") {
        combined = await navigator.mediaDevices.getUserMedia({ audio });
      } else if (kind === "webcam") {
        combined = await navigator.mediaDevices.getUserMedia({
          audio,
          video: {
            deviceId: cameraId ? { exact: cameraId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });
      } else {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false,
        });
        if (attempt !== captureAttempt.current) {
          screen.getTracks().forEach((track) => track.stop());
          return;
        }
        streamsRef.current = [screen];
        const mic = await navigator.mediaDevices.getUserMedia({ audio });
        streamsRef.current = [screen, mic];
        combined = new MediaStream([...screen.getVideoTracks(), ...mic.getAudioTracks()]);
        // The browser's « Stop sharing » ends the take like the stop button.
        screen.getVideoTracks()[0]?.addEventListener("ended", () => recorderRef.current?.stop());
      }
      if (attempt !== captureAttempt.current) {
        combined.getTracks().forEach((track) => track.stop());
        return;
      }
      if (captureTimeout.current !== null) window.clearTimeout(captureTimeout.current);
      captureTimeout.current = null;
      streamsRef.current = [...streamsRef.current, combined];
      setStream(combined);

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      void ctx.resume().catch(() => undefined);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(new MediaStream(combined.getAudioTracks())).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let clips = 0;
      meterRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        let peak = 0;
        for (const v of data) {
          sum += v * v;
          peak = Math.max(peak, Math.abs(v));
        }
        if (peak >= 0.99) clips++;
        const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -100);
        setLevel({ rms: toDb(Math.sqrt(sum / data.length)), peak: toDb(peak), clips });
      }, 100);
      setPhase("ready");
    } catch (e) {
      if (attempt !== captureAttempt.current) return;
      stopMonitor();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Accès refusé. Autorisez le micro (et la caméra ou l'écran) dans le navigateur, puis réessayez."
          : name === "NotFoundError"
            ? "Aucun micro ou caméra détecté."
            : "Impossible de démarrer la capture.",
      );
      setPhase("error");
    }
  }, [kind, live, micId, cameraId, stopMonitor]);

  const beginRecording = useCallback(() => {
    if (!stream) return;
    const video = kind !== "voice";
    const mimeType = pickMimeType(video);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 256000,
      videoBitsPerSecond: video ? 8_000_000 : undefined,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType || (video ? "video/webm" : "audio/webm"),
      });
      setPhase("ready");
      if (blob.size > 0) onRecordedRef.current(blob);
      if (kind === "screen") {
        stopMonitor();
        setPhase("idle");
      }
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setElapsed(0);
    const started = Date.now();
    let pausedFor = 0;
    let pausedAt = 0;
    timerRef.current = window.setInterval(() => {
      const r = recorderRef.current;
      if (!r) return;
      if (r.state === "paused") {
        if (!pausedAt) pausedAt = Date.now();
        return;
      }
      if (pausedAt) {
        pausedFor += Date.now() - pausedAt;
        pausedAt = 0;
      }
      setElapsed((Date.now() - started - pausedFor) / 1000);
    }, 200);
    setPhase("recording");
  }, [stream, kind, stopMonitor]);

  const record = useCallback(() => {
    setPhase("countdown");
    let n = 3;
    setCountdown(n);
    const tick = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(tick);
        setCountdown(0);
        beginRecording();
      } else setCountdown(n);
    }, 1000);
  }, [beginRecording]);

  const pause = useCallback(() => {
    recorderRef.current?.pause();
    setPhase("paused");
  }, []);
  const resume = useCallback(() => {
    recorderRef.current?.resume();
    setPhase("recording");
  }, []);
  const stop = useCallback(() => recorderRef.current?.stop(), []);
  const close = useCallback(() => {
    stopMonitor();
    setPhase("idle");
  }, [stopMonitor]);

  return {
    phase,
    error,
    level,
    countdown,
    elapsed,
    stream,
    startMonitor,
    record,
    pause,
    resume,
    stop,
    close,
  };
}

/** Microphones and cameras, with labels once the user has granted access. */
export function useMediaDevices(phase: RecorderPhase) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // Labels only appear once access is granted: list again when the capture is live.
  const granted = phase === "ready";
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const load = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => !cancelled && setDevices(list))
        .catch(() => undefined);
    load();
    navigator.mediaDevices.addEventListener?.("devicechange", load);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", load);
    };
  }, [granted]);
  return {
    mics: devices.filter((d) => d.kind === "audioinput"),
    cameras: devices.filter((d) => d.kind === "videoinput"),
  };
}
