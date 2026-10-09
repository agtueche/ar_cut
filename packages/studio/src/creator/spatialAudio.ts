export interface Position3D {
  x: number;
  y: number;
  z: number;
}
export interface SpatialKeyframe extends Position3D {
  time: number;
}
export interface SpatialSettings {
  listener: Position3D;
  points: SpatialKeyframe[];
  reference: string;
}
export const DEFAULT_SPATIAL: SpatialSettings = {
  listener: { x: 0, y: 0, z: 0 },
  points: [{ time: 0, x: -1, y: 0, z: -1 }],
  reference: "",
};
export function validateSpatial(settings: SpatialSettings, duration: number) {
  const finitePosition = (p: Position3D) =>
    [p.x, p.y, p.z].every((n) => Number.isFinite(n) && Math.abs(n) <= 100);
  if (!finitePosition(settings.listener) || !settings.points.length || settings.points.length > 100)
    throw new Error("Positions invalides (limite ±100 m, 100 images clés).");
  const points = [...settings.points].sort((a, b) => a.time - b.time);
  if (
    points[0]!.time !== 0 ||
    points.some(
      (p, i) =>
        !finitePosition(p) ||
        !Number.isFinite(p.time) ||
        p.time < 0 ||
        p.time > duration ||
        (i > 0 && p.time === points[i - 1]!.time),
    )
  )
    throw new Error(
      "La première image clé doit être à 0 s ; les temps doivent être uniques et compris dans le son.",
    );
  return points;
}
export function encodeStereoWav(
  channels: readonly Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  if (channels.length !== 2 || channels[0]!.length !== channels[1]!.length)
    throw new Error("Deux canaux de même longueur sont nécessaires.");
  const length = channels[0]!.length;
  const result = new ArrayBuffer(44 + length * 4),
    view = new DataView(result);
  const str = (offset: number, text: string) =>
    [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + length * 4, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length * 4, true);
  for (let i = 0; i < length; i++)
    for (let c = 0; c < 2; c++) {
      const value = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(44 + (i * 2 + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
  return result;
}
/** Bake Web Audio's real HRTF into a stereo asset used unchanged by preview and export. */
export async function renderSpatialAudio(bytes: ArrayBuffer, settings: SpatialSettings) {
  if (bytes.byteLength > 64 * 1024 * 1024)
    throw new Error("Le fichier dépasse 64 Mo. Découpez-le avant traitement.");
  const decoder = new OfflineAudioContext(2, 1, 48000);
  const input = await decoder.decodeAudioData(bytes);
  if (input.duration > 180)
    throw new Error(
      "Limite du traitement binaural : 3 minutes par source. Découpez le son avant traitement.",
    );
  const points = validateSpatial(settings, input.duration);
  const context = new OfflineAudioContext(2, Math.ceil(input.duration * 48000), 48000);
  const source = context.createBufferSource();
  source.buffer = input;
  const panner = context.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 100;
  panner.rolloffFactor = 1;
  panner.channelCount = 1;
  panner.channelCountMode = "explicit";
  context.listener.positionX.value = settings.listener.x;
  context.listener.positionY.value = settings.listener.y;
  context.listener.positionZ.value = settings.listener.z;
  context.listener.forwardX.value = 0;
  context.listener.forwardY.value = 0;
  context.listener.forwardZ.value = -1;
  context.listener.upX.value = 0;
  context.listener.upY.value = 1;
  context.listener.upZ.value = 0;
  for (const [i, point] of points.entries())
    for (const axis of ["x", "y", "z"] as const) {
      const param =
        axis === "x" ? panner.positionX : axis === "y" ? panner.positionY : panner.positionZ;
      if (i === 0) param.setValueAtTime(point[axis], 0);
      else param.linearRampToValueAtTime(point[axis], point.time);
    }
  source.connect(panner).connect(context.destination);
  source.start();
  const output = await context.startRendering();
  return {
    bytes: encodeStereoWav([output.getChannelData(0), output.getChannelData(1)], output.sampleRate),
    duration: input.duration,
  };
}
