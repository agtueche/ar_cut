import {
  CaretDown,
  Funnel,
  Rows,
  SortAscending,
  SquaresFour,
  ListBullets,
} from "@phosphor-icons/react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { Menu, MenuCheckboxItem, MenuSeparator } from "../ui/Menu";
import { cn } from "../ui";
import type { MediaCategory } from "./assetHelpers";
import type { MediaLayout, MediaSortKey, MediaSortOrder, MediaViewSettings } from "./mediaBrowse";

export type MediaTypeFilter = MediaCategory | "all";
export type MediaUsageFilter = "all" | "used" | "unused";

/** Icon button that opens a menu; `active` tints it when a non-default choice is on. */
const MenuTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & { icon: ReactNode; active?: boolean }
>(function MenuTrigger({ icon, active, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-[30px] items-center gap-0.5 rounded-md px-1.5 transition-colors",
        "text-panel-text-3 hover:bg-panel-input hover:text-panel-text-1",
        "data-[popup-open]:bg-panel-input data-[popup-open]:text-panel-text-1",
        active && "text-accent-ink",
        className,
      )}
      {...props}
    >
      {icon}
      <CaretDown size={9} weight="bold" aria-hidden="true" className="creator-media-caret" />
    </button>
  );
});

/** A checked row that stays checked when clicked again (single choice, drawn with a ✓). */
function Choice({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <MenuCheckboxItem checked={checked} onCheckedChange={() => onSelect()}>
      {children}
    </MenuCheckboxItem>
  );
}

const LAYOUT_ICON: Record<MediaLayout, ReactNode> = {
  large: <SquaresFour size={15} />,
  small: <Rows size={15} />,
  list: <ListBullets size={15} />,
};

export function MediaViewMenus({
  settings,
  onChange,
  typeFilter,
  onTypeFilter,
  typeCounts,
  usageFilter,
  onUsageFilter,
  usageCounts,
}: {
  settings: MediaViewSettings;
  onChange: (patch: Partial<MediaViewSettings>) => void;
  typeFilter: MediaTypeFilter;
  onTypeFilter: (filter: MediaTypeFilter) => void;
  /** Files per type in the current view (search and usage already applied). */
  typeCounts: Partial<Record<MediaTypeFilter, number>>;
  /** Usage filter, only where « used in the edit » means something (this project). */
  usageFilter?: MediaUsageFilter;
  onUsageFilter?: (filter: MediaUsageFilter) => void;
  usageCounts?: { used: number; unused: number };
}) {
  const label = useStudioLabel();
  const layouts: Array<[MediaLayout, string]> = [
    ["large", label("Large thumbnails", "Grandes vignettes")],
    ["small", label("Small thumbnails", "Petites vignettes")],
    ["list", label("List", "Liste")],
  ];
  const sortKeys: Array<[MediaSortKey, string]> = [
    ["imported", label("Import time", "Heure d'importation")],
    ["created", label("Creation time", "Heure de création")],
    ["name", label("Name", "Nom")],
    ["type", label("Type", "Type")],
    ["duration", label("Duration", "Durée")],
  ];
  // The order wording follows the key: dates read as recent/old, names as A→Z.
  const orderLabels: Record<MediaSortKey, [string, string]> = {
    imported: [
      label("Newest first", "Du plus récent au plus ancien"),
      label("Oldest first", "Du plus ancien au plus récent"),
    ],
    created: [
      label("Newest first", "Du plus récent au plus ancien"),
      label("Oldest first", "Du plus ancien au plus récent"),
    ],
    name: [label("Z to A", "De Z à A"), label("A to Z", "De A à Z")],
    type: [label("Audio first", "Son en premier"), label("Video first", "Vidéo en premier")],
    duration: [
      label("Longest first", "Du plus long au plus court"),
      label("Shortest first", "Du plus court au plus long"),
    ],
  };
  const orders: Array<[MediaSortOrder, string]> = [
    ["desc", orderLabels[settings.sortKey][0]],
    ["asc", orderLabels[settings.sortKey][1]],
  ];
  const types: Array<[MediaTypeFilter, string]> = [
    ["all", label("All", "Tout")],
    ["video", label("Video", "Vidéo")],
    ["audio", label("Sound", "Son")],
    ["images", label("Image", "Image")],
  ];
  const usages: Array<[MediaUsageFilter, string, number]> = usageCounts
    ? [
        ["all", label("All media", "Tous les médias"), usageCounts.used + usageCounts.unused],
        ["used", label("Used in the edit", "Utilisés dans le montage"), usageCounts.used],
        ["unused", label("Not used", "Non utilisés"), usageCounts.unused],
      ]
    : [];
  const filtered = typeFilter !== "all" || (usageFilter ?? "all") !== "all";
  const layoutName = layouts.find(([id]) => id === settings.layout)?.[1] ?? "";

  return (
    <div className="creator-media-view-menus flex items-center gap-0.5">
      <Menu
        aria-label={label("Display", "Affichage")}
        trigger={
          <MenuTrigger
            icon={LAYOUT_ICON[settings.layout]}
            aria-label={`${label("Display", "Affichage")} : ${layoutName}`}
            title={label("Display", "Affichage")}
          />
        }
      >
        {layouts.map(([id, name]) => (
          <Choice
            key={id}
            checked={settings.layout === id}
            onSelect={() => onChange({ layout: id })}
          >
            {name}
          </Choice>
        ))}
      </Menu>
      <Menu
        aria-label={label("Sort", "Trier")}
        trigger={
          <MenuTrigger
            icon={<SortAscending size={15} />}
            aria-label={label("Sort", "Trier")}
            title={label("Sort", "Trier")}
          />
        }
      >
        {sortKeys.map(([id, name]) => (
          <Choice
            key={id}
            checked={settings.sortKey === id}
            onSelect={() => onChange({ sortKey: id })}
          >
            {name}
          </Choice>
        ))}
        <MenuSeparator />
        {orders.map(([id, name]) => (
          <Choice
            key={id}
            checked={settings.sortOrder === id}
            onSelect={() => onChange({ sortOrder: id })}
          >
            {name}
          </Choice>
        ))}
      </Menu>
      <Menu
        aria-label={label("Show", "Afficher")}
        trigger={
          <MenuTrigger
            icon={<Funnel size={15} />}
            active={filtered}
            aria-label={label("Show file types", "Types de fichiers affichés")}
            title={label("Show file types", "Types de fichiers affichés")}
          />
        }
      >
        <MenuGroupLabel>{label("File type", "Type de fichier")}</MenuGroupLabel>
        {types.map(([id, name]) => (
          <Choice key={id} checked={typeFilter === id} onSelect={() => onTypeFilter(id)}>
            <CountedLabel name={name} count={typeCounts[id] ?? 0} />
          </Choice>
        ))}
        {usages.length > 0 && (
          <>
            <MenuSeparator />
            <MenuGroupLabel>{label("Usage", "Utilisation")}</MenuGroupLabel>
            {usages.map(([id, name, count]) => (
              <Choice key={id} checked={usageFilter === id} onSelect={() => onUsageFilter?.(id)}>
                <CountedLabel name={name} count={count} />
              </Choice>
            ))}
          </>
        )}
      </Menu>
    </div>
  );
}

function MenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-panel-text-5">
      {children}
    </div>
  );
}

function CountedLabel({ name, count }: { name: string; count: number }) {
  return (
    <>
      {name}
      <span className="ml-2 tabular-nums text-panel-text-5">{count}</span>
    </>
  );
}

/** The filters in force, above the media: each one visible and removable in one click. */
export function ActiveMediaFilters({
  typeFilter,
  usageFilter,
  onClearType,
  onClearUsage,
}: {
  typeFilter: MediaTypeFilter;
  usageFilter: MediaUsageFilter;
  onClearType: () => void;
  onClearUsage: () => void;
}) {
  const label = useStudioLabel();
  if (typeFilter === "all" && usageFilter === "all") return null;
  const typeName: Record<MediaTypeFilter, string> = {
    all: "",
    video: label("Video", "Vidéo"),
    audio: label("Sound", "Son"),
    images: label("Image", "Image"),
    fonts: label("Fonts", "Polices"),
  };
  const usageName: Record<MediaUsageFilter, string> = {
    all: "",
    used: label("Used", "Utilisés"),
    unused: label("Not used", "Non utilisés"),
  };
  const chip = (text: string, onClear: () => void) => (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${label("Remove filter", "Retirer le filtre")} ${text}`}
      className="flex items-center gap-1 rounded-full bg-panel-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-ink hover:bg-panel-accent/25"
    >
      {text}
      <span aria-hidden="true">×</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 pt-1">
      {typeFilter !== "all" && chip(typeName[typeFilter], onClearType)}
      {usageFilter !== "all" && chip(usageName[usageFilter], onClearUsage)}
      <button
        type="button"
        onClick={() => {
          onClearType();
          onClearUsage();
        }}
        className="text-[10px] text-panel-text-5 hover:text-panel-text-1"
      >
        {label("Clear filters", "Effacer les filtres")}
      </button>
    </div>
  );
}
