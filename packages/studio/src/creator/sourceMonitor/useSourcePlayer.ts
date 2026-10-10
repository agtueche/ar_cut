// Playback of the source monitor: its own player, independent of the timeline's.
// Plays forward natively; J (reverse) is stepped by hand because browsers do not
// play media backwards. Also reads the sound level for the monitor's meter.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { nextShuttleRate, snapToFrame } from "./sourceTimecode";

export interface SourcePlayer {
  time: number;
  duration: number;
  /** 0 paused, > 0 forward speed, < 0 reverse speed. */
  rate: number;
  /** Sound level of the last tenth of a second, 0..1 (0 when silent or unknown). */
  level: number;
  volume: number;
  muted: boolean;
  seek: (seconds: number) => void;
  togglePlay: () => void;
  shuttle: (key: "j" | "k" | "l") => void;
  step: (frames: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  /** Plays from `from` and stops at `to` (play the marked section). */
  playRange: (from: number, to: number) => void;
}

type Media = HTMLVideoElement | HTMLAudioElement;

export function useSourcePlayer(
  mediaRef: RefObject<Media | null>,
  fps: number,
  key: string,
): SourcePlayer {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(0);
  const [level, setLevel] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const stopAtRef = useRef<number | null>(null);
  const analyserRef = useRef<{ node: AnalyserNode; ctx: AudioContext; media: Media } | null>(null);

  // New media: back to the start, paused.
  useEffect(() => {
    setTime(0);
    setDuration(0);
    setRate(0);
    setLevel(0);
    stopAtRef.current = null;
  }, [key]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onMeta = () => setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    const onTime = () => {
      setTime(media.currentTime);
      if (stopAtRef.current != null && media.currentTime >= stopAtRef.current) {
        media.pause();
        stopAtRef.current = null;
      }
    };
    const onPause = () => setRate((r) => (r > 0 ? 0 : r));
    const onEnded = () => setRate(0);
    media.addEventListener("loadedmetadata", onMeta);
    media.addEventListener("durationchange", onMeta);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("seeked", onTime);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEnded);
    onMeta();
    return () => {
      media.removeEventListener("loadedmetadata", onMeta);
      media.removeEventListener("durationchange", onMeta);
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("seeked", onTime);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEnded);
    };
  }, [mediaRef, key]);

  // Smooth time while playing (timeupdate alone ticks only ~4 times a second),
  // reverse shuttle, and the level meter.
  useEffect(() => {
    if (rate === 0) return;
    const media = mediaRef.current;
    if (!media) return;
    let last = performance.now();
    const buffer = new Uint8Array(1024);
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (rate < 0) {
        const next = Math.max(0, media.currentTime + rate * dt);
        media.currentTime = next;
        if (next <= 0) setRate(0);
      }
      setTime(media.currentTime);
      const analyser = analyserRef.current;
      if (analyser && analyser.media === media) {
        analyser.node.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
      }
    }, 40);
    return () => {
      window.clearInterval(id);
      setLevel(0);
    };
  }, [rate, mediaRef]);

  /** Taps the media into a level meter, once per element (browsers allow only one source node). */
  const ensureMeter = useCallback(() => {
    const media = mediaRef.current;
    if (!media || analyserRef.current?.media === media) return;
    try {
      const ctx = analyserRef.current?.ctx ?? new AudioContext();
      const source = ctx.createMediaElementSource(media);
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      node.connect(ctx.destination);
      analyserRef.current = { node, ctx, media };
      void ctx.resume();
    } catch {
      /* No meter for this media: playback itself is unaffected. */
    }
  }, [mediaRef]);

  const applyRate = useCallback(
    (next: number) => {
      const media = mediaRef.current;
      if (!media) return;
      setRate(next);
      if (next > 0) {
        ensureMeter();
        media.playbackRate = next;
        void media.play().catch(() => setRate(0));
      } else {
        media.pause();
      }
    },
    [mediaRef, ensureMeter],
  );

  const seek = useCallback(
    (seconds: number) => {
      const media = mediaRef.current;
      if (!media) return;
      const max = Number.isFinite(media.duration) ? media.duration : seconds;
      media.currentTime = Math.max(0, Math.min(seconds, max));
      setTime(media.currentTime);
    },
    [mediaRef],
  );

  return {
    time,
    duration,
    rate,
    level,
    volume,
    muted,
    seek,
    togglePlay: () => {
      stopAtRef.current = null;
      applyRate(rate === 0 ? 1 : 0);
    },
    shuttle: (k) => {
      stopAtRef.current = null;
      applyRate(nextShuttleRate(rate, k));
    },
    step: (frames) => {
      applyRate(0);
      const media = mediaRef.current;
      if (media) seek(snapToFrame(media.currentTime, fps) + frames / Math.max(1, fps));
    },
    setVolume: (value) => {
      const media = mediaRef.current;
      setVolumeState(value);
      if (media) media.volume = value;
    },
    toggleMute: () => {
      const media = mediaRef.current;
      setMuted((m) => {
        if (media) media.muted = !m;
        return !m;
      });
    },
    playRange: (from, to) => {
      seek(from);
      stopAtRef.current = to;
      applyRate(1);
    },
  };
}
