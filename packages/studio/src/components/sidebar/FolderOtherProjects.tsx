import { useState } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { basename, filename } from "./assetHelpers";
import type { FolderItem, MediaFolder } from "./mediaFolders";

/** Copies a media of another project into the open one, through the normal import path. */
async function importFromProject(
  item: FolderItem,
  onImport: (files: FileList) => void | Promise<void>,
): Promise<void> {
  const url = buildProjectApiPath(
    item.projectId,
    `/preview/${item.path.split("/").map(encodeURIComponent).join("/")}`,
  );
  const response = await studioApiFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], filename(item.path), { type: blob.type }));
  await onImport(transfer.files);
}

/** Folder entries that live in other projects: listed with their project, importable. */
export function FolderOtherProjects({
  folder,
  projectId,
  onImport,
  onRemove,
}: {
  folder: MediaFolder;
  projectId: string;
  onImport?: (files: FileList) => void | Promise<void>;
  onRemove: (item: FolderItem) => void;
}) {
  const label = useStudioLabel();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const items = folder.items.filter((i) => i.projectId !== projectId);
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2 border-t border-panel-border">
        <h3 className="text-[12px] font-semibold text-panel-text-1">
          {label("From other projects", "Depuis d'autres projets")}
        </h3>
        <span className="text-[11px] text-panel-text-5">{items.length}</span>
      </div>
      {items.map((item) => {
        const key = `${item.projectId}/${item.path}`;
        return (
          <div key={key} className="flex items-center gap-2 px-4 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-panel-text-2" title={item.path}>
                {basename(item.path)}
              </div>
              <div className="truncate text-[10px] text-panel-text-5">{item.projectId}</div>
              {failed === key && (
                <div className="text-[10px] text-danger-ink">
                  {label(
                    "Import failed — the file may have moved.",
                    "Échec de l'import : le fichier a peut-être été déplacé.",
                  )}
                </div>
              )}
            </div>
            {onImport && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(key);
                  setFailed(null);
                  importFromProject(item, onImport)
                    .catch(() => setFailed(key))
                    .finally(() => setBusy(null));
                }}
                className="shrink-0 rounded-md bg-panel-input px-2 py-1 text-[10px] font-medium text-panel-text-3 enabled:hover:text-panel-text-1 disabled:opacity-60"
              >
                {busy === key
                  ? label("Importing…", "Import…")
                  : label("Import here", "Importer ici")}
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={label("Remove from folder", "Retirer du dossier")}
              title={label("Remove from folder", "Retirer du dossier")}
              className="shrink-0 px-1 text-[12px] text-panel-text-5 hover:text-panel-text-1"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** A selected folder with nothing from this project in it. */
export function FolderEmptyState({ hasElsewhere }: { hasElsewhere: boolean }) {
  const label = useStudioLabel();
  return (
    <p className="px-4 py-3 text-[11px] leading-snug text-panel-text-5">
      {hasElsewhere
        ? label(
            "Nothing from this project in this folder.",
            "Aucun média de ce projet dans ce dossier.",
          )
        : label(
            "This folder is empty. Drag media onto it, or right-click a media › Add to a folder.",
            "Ce dossier est vide. Glissez des médias dessus, ou faites un clic droit sur un média › Ajouter à un dossier.",
          )}
    </p>
  );
}
