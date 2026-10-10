import { useStudioLabel } from "../../creator/useStudioLabel";
import { folderTree, useMediaFolderActions } from "./mediaFolders";

/** "Mes dossiers" entries of an asset's context menu. Renders nothing outside the media panel. */
export function AssetFolderMenuItems({
  asset,
  itemCls,
  onOpenPicker,
  onClose,
}: {
  asset: string;
  itemCls: string;
  onOpenPicker: (anchor: HTMLElement) => void;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const actions = useMediaFolderActions();
  if (!actions) return null;
  const { currentFolder, projectId, addToLibrary } = actions;
  return (
    <>
      {addToLibrary && (
        <button
          role="menuitem"
          onClick={() => {
            void addToLibrary(asset);
            onClose();
          }}
          className={itemCls}
        >
          {label("Add to my library", "Ajouter à ma bibliothèque")}
        </button>
      )}
      <button
        role="menuitem"
        aria-haspopup="menu"
        data-submenu="folders"
        onClick={(e) => onOpenPicker(e.currentTarget)}
        onMouseEnter={(e) => onOpenPicker(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onOpenPicker(e.currentTarget);
        }}
        className={`${itemCls} flex items-center justify-between gap-4`}
      >
        <span>{label("Add to a folder", "Ajouter à un dossier")}</span>
        <span aria-hidden="true">▸</span>
      </button>
      {currentFolder && (
        <button
          role="menuitem"
          onClick={() => {
            void actions.removeItem(currentFolder.id, { projectId, path: asset });
            onClose();
          }}
          className={itemCls}
        >
          {label(`Remove from “${currentFolder.name}”`, `Retirer de « ${currentFolder.name} »`)}
        </button>
      )}
    </>
  );
}

/** Sub-menu of the asset menu (opens beside it): pick the folder to add the asset to. */
export function AssetFolderPicker({
  asset,
  itemCls,
  onBack,
  onClose,
}: {
  asset: string;
  itemCls: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const actions = useMediaFolderActions();
  if (!actions) return null;
  const tree = folderTree(actions.folders);
  return (
    <>
      {onBack && (
        <button role="menuitem" onClick={onBack} className={itemCls}>
          ← {label("Back", "Retour")}
        </button>
      )}
      {tree.length === 0 && (
        <p className="px-3 py-1.5 text-[10px] text-panel-text-5">
          {label(
            "No folder yet — create one with + in “My folders”.",
            "Aucun dossier — créez-en un avec + dans « Mes dossiers ».",
          )}
        </p>
      )}
      {tree.map(({ folder, depth }) => {
        const already = folder.items.some(
          (i) => i.projectId === actions.projectId && i.path === asset,
        );
        return (
          <button
            key={folder.id}
            role="menuitem"
            disabled={already}
            onClick={() => {
              void actions.addItem(folder.id, { projectId: actions.projectId, path: asset });
              onClose();
            }}
            style={{ paddingLeft: 12 + depth * 10 }}
            className={`${itemCls} disabled:opacity-50`}
          >
            {folder.name}
            {already ? ` ✓` : ""}
          </button>
        );
      })}
    </>
  );
}
