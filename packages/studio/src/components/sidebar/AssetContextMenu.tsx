import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { filename } from "./assetHelpers";
import { menuClasses } from "../ui/menuStyle";
import { AssetFolderMenuItems, AssetFolderPicker } from "./AssetFolderMenu";
import { useStudioLabel } from "../../creator/useStudioLabel";
import {
  AssetExtraItems,
  AssetInfoDialog,
  ExtractAudioDialog,
  NewFolderDialog,
  NewFolderItem,
  type AssetDialog,
} from "./AssetMenuExtras";
import { ConfirmDialog, PromptDialog } from "./MenuDialogs";

/** Reject names that would escape the asset directory or break paths. */
function isValidAssetName(name: string): boolean {
  return name.length > 0 && !/[/\\]/.test(name) && !name.includes("..");
}

/** Centred windows render at page level, isolated from the media card's handlers. */
function asWindow(node: ReactNode) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return createPortal(
    <div onClick={stop} onPointerDown={stop} onContextMenu={stop} onDoubleClick={stop}>
      {node}
    </div>,
    document.body,
  );
}

/** Keeps a floating panel inside the window once it has a size. */
function useClampedPosition(x: number, y: number, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      x: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's
  }, [x, y, ...deps]);
  return { ref, pos };
}

/**
 * Right-click menu of a project media. As in video editors, the menu is a list of
 * choices; a list of folders opens as a sub-menu beside it, and everything to read,
 * type or confirm (information, rename, delete…) opens in a centred window.
 */
export function ContextMenu({
  x,
  y,
  asset,
  onClose,
  onCopy,
  onDelete,
  onRename,
  onAddAtPlayhead,
}: {
  x: number;
  y: number;
  asset: string;
  onClose: () => void;
  onCopy: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAtPlayhead?: (path: string) => void;
}) {
  const label = useStudioLabel();
  const [dialog, setDialog] = useState<AssetDialog | null>(null);
  const name = filename(asset);

  if (dialog === "info") return asWindow(<AssetInfoDialog asset={asset} onClose={onClose} />);
  if (dialog === "extract") return asWindow(<ExtractAudioDialog asset={asset} onClose={onClose} />);
  if (dialog === "new-folder") return asWindow(<NewFolderDialog asset={asset} onClose={onClose} />);
  if (dialog === "rename")
    return asWindow(
      <PromptDialog
        title={label("Rename media", "Renommer le média")}
        fieldLabel={label("New name", "Nouveau nom")}
        initial={name}
        submitLabel={label("Rename", "Renommer")}
        validate={(value) =>
          isValidAssetName(value)
            ? null
            : label("Name can't contain / or ..", "Le nom ne peut pas contenir / ni ..")
        }
        onSubmit={(value) => {
          if (value === name) return;
          const dir = asset.includes("/") ? asset.slice(0, asset.lastIndexOf("/") + 1) : "";
          onRename?.(asset, `${dir}${value}`);
        }}
        onClose={onClose}
      />,
    );
  if (dialog === "delete")
    return asWindow(
      <ConfirmDialog
        title={label("Delete media?", "Supprimer le média ?")}
        message={label(
          `“${name}” will be deleted from the project. Clips that use it will lose their source.`,
          `« ${name} » sera supprimé du projet. Les clips qui l'utilisent perdront leur source.`,
        )}
        confirmLabel={label("Delete", "Supprimer")}
        onConfirm={() => onDelete?.(asset)}
        onClose={onClose}
      />,
    );
  return (
    <MenuList
      x={x}
      y={y}
      asset={asset}
      onClose={onClose}
      onCopy={onCopy}
      onAddAtPlayhead={onAddAtPlayhead}
      canRename={!!onRename}
      canDelete={!!onDelete}
      onDialog={setDialog}
    />
  );
}

function MenuList({
  x,
  y,
  asset,
  onClose,
  onCopy,
  onAddAtPlayhead,
  canRename,
  canDelete,
  onDialog,
}: {
  x: number;
  y: number;
  asset: string;
  onClose: () => void;
  onCopy: (path: string) => void;
  onAddAtPlayhead?: (path: string) => void;
  canRename: boolean;
  canDelete: boolean;
  onDialog: (dialog: AssetDialog) => void;
}) {
  const label = useStudioLabel();
  const { ref: menuRef, pos } = useClampedPosition(x, y, []);
  // The folders sub-menu, opened beside the item that announced it.
  const [submenu, setSubmenu] = useState<DOMRect | null>(null);

  // Keyboard: Escape closes the sub-menu first, then the menu; arrows move between items.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (submenu) setSubmenu(null);
        else onClose();
        return;
      }
      if (e.key === "ArrowLeft" && submenu) {
        setSubmenu(null);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const scope = submenu
        ? '[data-submenu-panel] [role="menuitem"]'
        : '[data-main-menu] > * [role="menuitem"], [data-main-menu] > [role="menuitem"]';
      const items = Array.from(document.querySelectorAll<HTMLElement>(scope));
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.findIndex((el) => el === document.activeElement);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      items[(idx + delta + items.length) % items.length]?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [submenu, onClose]);

  // Focus the first item on open so the arrow keys work immediately.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuRef]);

  // `block`: one item per line, or the menu sizes itself to items laid side by side.
  const itemCls = `block ${menuClasses.row} ${menuClasses.rowEnabled} active:bg-neutral-700/70 transition-colors`;
  const open = (dialog: AssetDialog) => () => onDialog(dialog);

  // Rendered at page level, above every panel: inside the media panel it would be
  // clipped by the panel's edges and drawn behind the neighbouring panels.
  return createPortal(
    <div
      className="fixed inset-0 z-200"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        data-main-menu=""
        aria-label={label(`Actions for ${filename(asset)}`, `Actions pour ${filename(asset)}`)}
        className={`${menuClasses.panel} absolute min-w-[210px] text-xs`}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
        onMouseOver={(e) => {
          // Hovering another item closes the folders sub-menu, as in macOS menus.
          const item = (e.target as HTMLElement).closest('[role="menuitem"]');
          if (item && !item.hasAttribute("data-submenu")) setSubmenu(null);
        }}
      >
        {onAddAtPlayhead && (
          <div className={menuClasses.group}>
            <button
              role="menuitem"
              onClick={() => {
                onAddAtPlayhead(asset);
                onClose();
              }}
              className={itemCls}
            >
              {label("Add at playhead", "Ajouter à la tête de lecture")}
            </button>
          </div>
        )}
        <div className={menuClasses.group}>
          <AssetExtraItems
            asset={asset}
            itemCls={itemCls}
            onMode={(mode) => onDialog(mode)}
            onClose={onClose}
          />
          <button
            role="menuitem"
            onClick={() => {
              onCopy(asset);
              onClose();
            }}
            className={itemCls}
          >
            {label("Copy path", "Copier le chemin")}
          </button>
        </div>
        <div className={menuClasses.group}>
          <AssetFolderMenuItems
            asset={asset}
            itemCls={itemCls}
            onOpenPicker={(anchor) => setSubmenu(anchor.getBoundingClientRect())}
            onClose={onClose}
          />
          <NewFolderItem itemCls={itemCls} onMode={(mode) => onDialog(mode)} />
        </div>
        {canRename && (
          <button role="menuitem" onClick={open("rename")} className={itemCls}>
            {label("Rename…", "Renommer…")}
          </button>
        )}
        {canDelete && (
          <button
            role="menuitem"
            onClick={open("delete")}
            className={`block ${menuClasses.row} ${menuClasses.rowDanger} active:bg-neutral-700/70 transition-colors`}
          >
            {label("Delete…", "Supprimer…")}
          </button>
        )}
      </div>
      {submenu && (
        <FolderSubmenu anchor={submenu} asset={asset} itemCls={itemCls} onClose={onClose} />
      )}
    </div>,
    document.body,
  );
}

/** « Ajouter à un dossier ▸ »: opens to the right of its item, or to the left near the edge. */
function FolderSubmenu({
  anchor,
  asset,
  itemCls,
  onClose,
}: {
  anchor: DOMRect;
  asset: string;
  itemCls: string;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: anchor.right - 4, y: anchor.top - 4 });
  useLayoutEffect(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const right = anchor.right - 4;
    setPos({
      x: right + rect.width + margin > window.innerWidth ? anchor.left - rect.width + 4 : right,
      y: Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - rect.height - margin)),
    });
  }, [anchor]);
  return (
    <div
      ref={panelRef}
      role="menu"
      data-submenu-panel=""
      aria-label={label("Add to a folder", "Ajouter à un dossier")}
      className={`${menuClasses.panel} absolute min-w-[180px] max-h-[60vh] overflow-y-auto text-xs`}
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <AssetFolderPicker asset={asset} itemCls={itemCls} onClose={onClose} />
    </div>
  );
}
