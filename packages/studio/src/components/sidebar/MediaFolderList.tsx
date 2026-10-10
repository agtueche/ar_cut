import { createPortal } from "react-dom";
import { useMemo, useState, type DragEvent } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { TRACK_COLOR_VAR } from "../../creator/components/TrackHeaderExtras";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { TIMELINE_ASSET_MIME } from "../../utils/timelineAssetDrop";
import { menuClasses } from "../ui/menuStyle";
import { cn } from "../ui";
import {
  folderTree,
  type FolderColor,
  type MediaFolder,
  type MediaFoldersState,
} from "./mediaFolders";
import { ConfirmDialog } from "./MenuDialogs";

const COLORS: FolderColor[] = ["teal", "orange", "blue", "amber", "red", "gray"];
const MAX_DEPTH = 3;

/** The asset path carried by a media drag (cards and audio rows set it). */
function draggedAssetPath(e: DragEvent): string | null {
  const raw = e.dataTransfer.getData(TIMELINE_ASSET_MIME);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const path = (parsed as { path?: unknown }).path;
    return typeof path === "string" ? path : null;
  } catch {
    return null;
  }
}

function NameInput({
  initial,
  placeholder,
  depth,
  onDone,
}: {
  initial: string;
  placeholder: string;
  depth: number;
  onDone: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      autoFocus
      value={draft}
      maxLength={60}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(draft.trim() || null);
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(draft.trim() || null)}
      style={{ marginLeft: depth * 10 }}
      className="mx-1 my-0.5 h-6 min-w-0 rounded border border-panel-accent bg-panel-input px-1.5 text-[11px] text-panel-text-1 outline-none"
    />
  );
}

function FolderMenu({
  anchor,
  folder,
  canNest,
  onRename,
  onNewChild,
  onColor,
  onDelete,
  onClose,
}: {
  anchor: { x: number; y: number };
  folder: MediaFolder;
  canNest: boolean;
  onRename: () => void;
  onNewChild: () => void;
  onColor: (color: FolderColor | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const menuRef = useContextMenuDismiss(onClose);
  const row = cn(menuClasses.row, menuClasses.rowEnabled);
  const run = (task: () => void) => () => {
    onClose();
    task();
  };
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label(`Folder ${folder.name}`, `Dossier ${folder.name}`)}
      className={`${menuClasses.panel} fixed z-200 min-w-48`}
      style={{
        left: Math.min(anchor.x, window.innerWidth - 220),
        top: Math.min(anchor.y, window.innerHeight - 240),
      }}
    >
      <div className={menuClasses.group}>
        <button type="button" role="menuitem" className={row} onClick={run(onRename)}>
          {label("Rename", "Renommer")}
        </button>
        {canNest && (
          <button type="button" role="menuitem" className={row} onClick={run(onNewChild)}>
            {label("New sub-folder", "Nouveau sous-dossier")}
          </button>
        )}
      </div>
      <div className={menuClasses.group}>
        <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-panel-text-5">
          {label("Colour", "Couleur")}
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-checked={folder.color === color}
              aria-label={color}
              onClick={run(() => onColor(color))}
              className={cn(
                "h-4 w-4 rounded-full",
                folder.color === color && "ring-2 ring-panel-text-1 ring-offset-1",
              )}
              style={{ background: TRACK_COLOR_VAR[color] }}
            />
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={run(() => onColor(null))}
            className="ml-1 text-[10px] text-panel-text-5 hover:text-panel-text-1"
          >
            {label("None", "Aucune")}
          </button>
        </div>
      </div>
      <div className={menuClasses.group}>
        <button type="button" role="menuitem" className={row} onClick={run(onDelete)}>
          {label("Delete folder…", "Supprimer le dossier…")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

type Editing = { kind: "create"; parentId: string | null } | { kind: "rename"; id: string } | null;

export function MediaFolderList({
  state,
  projectId,
  activeId,
  onSelect,
}: {
  state: MediaFoldersState;
  projectId: string;
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const label = useStudioLabel();
  const [editing, setEditing] = useState<Editing>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ folder: MediaFolder; x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState<MediaFolder | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const tree = useMemo(() => folderTree(state.folders), [state.folders]);
  const hasChildren = useMemo(
    () => new Set(state.folders.map((f) => f.parentId).filter((p): p is string => !!p)),
    [state.folders],
  );
  const depthOf = useMemo(() => new Map(tree.map((t) => [t.folder.id, t.depth])), [tree]);

  // A folder is hidden when any of its ancestors is collapsed.
  const visible = tree.filter(({ folder }) => {
    let parent = folder.parentId;
    while (parent) {
      if (collapsed.has(parent)) return false;
      parent = state.folders.find((f) => f.id === parent)?.parentId ?? null;
    }
    return true;
  });

  const createIn = (parentId: string | null) => {
    if (parentId) setCollapsed((s) => new Set([...s].filter((id) => id !== parentId)));
    setEditing({ kind: "create", parentId });
  };

  const newFolderInput = (parentId: string | null, depth: number) =>
    editing?.kind === "create" && editing.parentId === parentId ? (
      <NameInput
        initial=""
        depth={depth}
        placeholder={label("Folder name", "Nom du dossier")}
        onDone={(name) => {
          setEditing(null);
          if (!name) return;
          void state.create(name, parentId).then((folder) => folder && onSelect(folder.id));
        }}
      />
    ) : null;

  return (
    <section
      className="flex flex-col gap-0.5 px-[5px] py-2 border-b border-panel-border"
      aria-label={label("My folders", "Mes dossiers")}
    >
      <div className="flex items-center justify-between px-1.5 pb-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-panel-text-5">
          {label("My folders", "Mes dossiers")}
        </h3>
        <button
          type="button"
          onClick={() => createIn(null)}
          aria-label={label("New folder", "Nouveau dossier")}
          title={label("New folder", "Nouveau dossier")}
          className="flex h-5 w-5 items-center justify-center rounded text-panel-text-3 hover:bg-panel-input hover:text-panel-text-1"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {newFolderInput(null, 0)}

      {state.loaded && state.folders.length === 0 && editing?.kind !== "create" && (
        <button
          type="button"
          onClick={() => createIn(null)}
          className="px-2 py-1 text-left text-[10px] leading-snug text-panel-text-5 hover:text-panel-text-3"
        >
          {label(
            "No folder yet. Create one to sort your media.",
            "Aucun dossier. Créez-en un pour ranger vos médias.",
          )}
        </button>
      )}

      {visible.map(({ folder, depth }) => {
        const selected = folder.id === activeId;
        const here = folder.items.filter((i) => i.projectId === projectId).length;
        const elsewhere = folder.items.length - here;
        const isOpen = !collapsed.has(folder.id);
        return (
          <div key={folder.id} className="flex flex-col">
            {editing?.kind === "rename" && editing.id === folder.id ? (
              <NameInput
                initial={folder.name}
                depth={depth}
                placeholder={label("Folder name", "Nom du dossier")}
                onDone={(name) => {
                  setEditing(null);
                  if (name && name !== folder.name) void state.rename(folder.id, name);
                }}
              />
            ) : (
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : folder.id)}
                onDoubleClick={() => setEditing({ kind: "rename", id: folder.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ folder, x: e.clientX, y: e.clientY });
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TIMELINE_ASSET_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDropTarget(folder.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === folder.id ? null : t))}
                onDrop={(e) => {
                  setDropTarget(null);
                  const path = draggedAssetPath(e);
                  if (!path) return;
                  e.preventDefault();
                  e.stopPropagation();
                  void state.addItem(folder.id, { projectId, path });
                }}
                title={
                  elsewhere > 0
                    ? label(
                        `${here} here, ${elsewhere} in other projects`,
                        `${here} dans ce projet, ${elsewhere} dans d'autres projets`,
                      )
                    : undefined
                }
                style={{ paddingLeft: 6 + depth * 10 }}
                className={cn(
                  "flex items-center gap-1 rounded py-1 pr-1.5 text-left text-[11px] font-medium transition-colors",
                  selected
                    ? "bg-panel-accent/15 text-accent-ink"
                    : "text-panel-text-3 hover:text-panel-text-1",
                  dropTarget === folder.id && "ring-1 ring-panel-accent",
                )}
              >
                {hasChildren.has(folder.id) ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={isOpen ? label("Collapse", "Replier") : label("Expand", "Déplier")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((s) => {
                        const next = new Set(s);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        return next;
                      });
                    }}
                    className="w-2.5 shrink-0 text-[9px] text-panel-text-5"
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                ) : (
                  <span className="w-2.5 shrink-0" aria-hidden="true" />
                )}
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{
                    background: folder.color
                      ? TRACK_COLOR_VAR[folder.color]
                      : "var(--color-text-off)",
                  }}
                />
                <span className="min-w-0 flex-1 break-words">{folder.name}</span>
                <span className="shrink-0 text-[10px] text-panel-text-5">
                  {folder.items.length}
                </span>
              </button>
            )}
            {newFolderInput(folder.id, depth + 1)}
          </div>
        );
      })}

      {state.error && (
        <button
          type="button"
          onClick={state.clearError}
          className="mx-1 mt-1 rounded bg-danger/10 px-2 py-1 text-left text-[10px] text-danger"
        >
          {state.error}
        </button>
      )}

      {menu && (
        <FolderMenu
          anchor={menu}
          folder={menu.folder}
          canNest={(depthOf.get(menu.folder.id) ?? 0) < MAX_DEPTH - 1}
          onClose={() => setMenu(null)}
          onRename={() => setEditing({ kind: "rename", id: menu.folder.id })}
          onNewChild={() => createIn(menu.folder.id)}
          onColor={(color) => void state.setColor(menu.folder.id, color)}
          onDelete={() => setDeleting(menu.folder)}
        />
      )}
      {deleting &&
        createPortal(
          <ConfirmDialog
            title={label("Delete folder?", "Supprimer le dossier ?")}
            message={label(
              `“${deleting.name}” and its sub-folders will be deleted. The media files themselves are kept.`,
              `« ${deleting.name} » et ses sous-dossiers seront supprimés. Les fichiers des médias, eux, sont conservés.`,
            )}
            confirmLabel={label("Delete", "Supprimer")}
            onConfirm={() => {
              const id = deleting.id;
              void state.remove(id).then((deleted) => {
                if (activeId && deleted.includes(activeId)) onSelect(null);
              });
            }}
            onClose={() => setDeleting(null)}
          />,
          document.body,
        )}
    </section>
  );
}
