export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}
function seconds(raw: string): number {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(raw);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
    throw new Error(`Timecode invalide : ${raw}`);
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}
export function validateCues(cues: SubtitleCue[]): SubtitleCue[] {
  if (cues.length > 2000) throw new Error("Limite : 2 000 segments par composition.");
  for (const cue of cues)
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      !cue.text.trim()
    )
      throw new Error("Chaque segment doit avoir un texte et une fin après son début.");
  return [...cues].sort((a, b) => a.start - b.start);
}
export function parseSubtitles(source: string): SubtitleCue[] {
  const blocks = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
    const lines = block.split("\n");
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) throw new Error("Segment sans timecode SRT/VTT.");
    const match = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[index]!);
    if (!match) throw new Error("Timecode SRT/VTT invalide.");
    const text = lines
      .slice(index + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    cues.push({ start: seconds(match[1]!), end: seconds(match[2]!), text });
  }
  if (!cues.length) throw new Error("Aucun segment SRT/VTT détecté.");
  return validateCues(cues);
}
function stamp(time: number, vtt: boolean) {
  const ms = Math.round(time * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${vtt ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
}
export function exportSubtitles(cues: SubtitleCue[], format: "srt" | "vtt") {
  const vtt = format === "vtt";
  return (
    (vtt ? "WEBVTT\n\n" : "") +
    validateCues(cues)
      .map(
        (cue, index) =>
          `${index + 1}\n${stamp(cue.start, vtt)} --> ${stamp(cue.end, vtt)}\n${cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}\n`,
      )
      .join("\n")
  );
}
