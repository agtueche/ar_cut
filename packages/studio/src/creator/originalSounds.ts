import { encodeStereoWav } from "./spatialAudio";
export const ORIGINAL_SOUNDS = [
  { id: "notification", name: "Notification douce", category: "Interface", duration: 0.6 },
  { id: "success", name: "Validation lumineuse", category: "Interface", duration: 1 },
  { id: "sweep", name: "Balayage léger", category: "Transition", duration: 0.8 },
  { id: "pulse", name: "Impulsion grave", category: "Impact", duration: 0.5 },
  { id: "ambient", name: "Accord ambiant", category: "Musique", duration: 8 },
] as const;
export type OriginalSoundId = (typeof ORIGINAL_SOUNDS)[number]["id"];
/** Original synthesized signals, no samples or remote assets. Same samples on every run. */
export function synthesizeOriginalSound(id: OriginalSoundId) {
  const preset = ORIGINAL_SOUNDS.find((p) => p.id === id)!;
  const rate = 48000;
  const data = new Float32Array(Math.ceil(preset.duration * rate));
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const release = Math.min(1, (preset.duration - t) / 0.12);
    const attack = Math.min(1, t / 0.015);
    const sine = (hz: number) => Math.sin(2 * Math.PI * hz * t);
    let value = 0;
    if (id === "notification") value = (sine(880) + 0.3 * sine(1320)) * Math.exp(-7 * t) * 0.35;
    if (id === "success") value = sine(t < 0.3 ? 523.25 : t < 0.6 ? 659.25 : 783.99) * 0.25;
    if (id === "sweep")
      value =
        Math.sin(2 * Math.PI * (180 * t + 900 * t * t)) *
        Math.sin((Math.PI * t) / preset.duration) *
        0.25;
    if (id === "pulse") value = sine(75) * Math.exp(-10 * t) * 0.5;
    if (id === "ambient")
      value =
        ((sine(261.63) + sine(329.63) + sine(392)) / 3) *
        0.3 *
        Math.sin((Math.PI * t) / preset.duration);
    data[i] = value * attack * release;
  }
  return encodeStereoWav([data, data], rate);
}
