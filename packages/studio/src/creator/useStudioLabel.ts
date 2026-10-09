import { useCreatorEditorControls } from "./CreatorEditorContext";
const french = (_english: string, translated: string) => translated;
const english = (original: string, _translated: string) => original;
/** Localize Creator without changing the standalone/embedded Studio. */
export function useStudioLabel() {
  return useCreatorEditorControls() ? french : english;
}
