import { useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { MediaPreview } from "../../components/MediaPreview";
import { inputClass } from "./common";
export function SourceMonitor({ onAdd }: { onAdd?: (path: string) => void }) {
  const { assets } = useFileManagerContext();
  const { projectId } = useStudioShellContext();
  const [selected, setSelected] = useState("");
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Moniteur source">
      <div className="flex gap-2 border-b border-border p-2">
        <select
          aria-label="Média source"
          className={inputClass}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choisir un média à prévisualiser</option>
          {assets.map((path) => (
            <option key={path}>{path}</option>
          ))}
        </select>
        <button
          disabled={!selected || !onAdd}
          onClick={() => onAdd?.(selected)}
          className="rounded bg-accent/10 px-3 text-xs text-accent"
        >
          Insérer
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {selected ? (
          <MediaPreview key={selected} projectId={projectId} filePath={selected} />
        ) : (
          <p className="p-6 text-center text-sm text-text-muted">
            Prévisualisez un rush à côté du montage. Son lecteur est indépendant de la tête de
            lecture de la timeline.
          </p>
        )}
      </div>
    </section>
  );
}
