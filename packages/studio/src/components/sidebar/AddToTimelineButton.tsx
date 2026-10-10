// The « + » in the corner of a media thumbnail: one click puts the media on the
// timeline at the playhead (the same action as « Ajouter à la tête de lecture »).
import { Plus } from "@phosphor-icons/react";
import { useStudioLabel } from "../../creator/useStudioLabel";

export function AddToTimelineButton({
  asset,
  name,
  onAdd,
}: {
  asset: string;
  name: string;
  onAdd: (path: string) => void;
}) {
  const label = useStudioLabel();
  const text = label(`Add ${name} to the timeline`, `Ajouter ${name} à la timeline`);
  // The card underneath opens the preview on click and starts a drag on press:
  // the button keeps its own presses so it only ever adds.
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <button
      type="button"
      draggable={false}
      aria-label={text}
      title={label("Add to the timeline", "Ajouter à la timeline")}
      onPointerDown={keep}
      onPointerUp={keep}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={keep}
      onClick={(e) => {
        e.stopPropagation();
        onAdd(asset);
      }}
      className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-950/80 text-panel-text-1 shadow-sm transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Plus size={13} weight="bold" aria-hidden="true" />
    </button>
  );
}
