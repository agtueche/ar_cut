// Track header additions: rename by double-click or menu, colour, lock, and a
// right-click menu. Every write goes through Studio's multi-clip attribute
// writer (one file save, one undo step), on each clip of the track: see
// creator/trackMeta.ts for why the settings live on the clips.

import { createPortal } from "react-dom";
import { useMemo, useState, type CSSProperties } from "react";
import { LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { menuClasses } from "../../components/ui/menuStyle";
import { cn } from "../../components/ui";
import type { TimelineElement } from "../../player/store/timelineElement";
import { translate, getLocale, type MessageKey } from "../i18n";
import { allowingLockedTrackEdit } from "../lockGate";
import {
  TRACK_COLORS,
  TRACK_COLOR_ATTR,
  TRACK_LOCK_ATTR,
  TRACK_NAME_ATTR,
  normalizeTrackName,
  resolveTrackMeta,
  type TrackColor,
  type TrackMeta,
} from "../trackMeta";

const t = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(getLocale(), key, vars);

/** CSS value per colour key, from the theme's tokens. */
export const TRACK_COLOR_VAR: Record<TrackColor, string> = {
  teal: "var(--color-accent)",
  orange: "var(--color-cta)",
  blue: "var(--color-selection)",
  amber: "var(--color-container)",
  red: "var(--color-danger)",
  gray: "var(--color-text-off)",
};

const COLOR_LABEL: Record<TrackColor, MessageKey> = {
  teal: "track.color.teal",
  orange: "track.color.orange",
  blue: "track.color.blue",
  amber: "track.color.amber",
  red: "track.color.red",
  gray: "track.color.gray",
};

export function trackMetaOf(elements: readonly TimelineElement[]): TrackMeta {
  return resolveTrackMeta(
    elements.map((element) => ({
      name: element.trackName,
      color: element.trackColor,
      locked: element.timelineLocked === true,
    })),
  );
}

/** The label a track shows: its name, else Studio's first-clip label. */
export function trackLabelFor(elements: readonly TimelineElement[], fallback: string): string {
  const first = elements[0];
  return trackMetaOf(elements).name ?? first?.label ?? first?.domId ?? first?.id ?? fallback;
}

/** The inset colour bar on a coloured track's header (an inset shadow: no layout shift). */
export function trackColorStyle(elements: readonly TimelineElement[]): CSSProperties {
  const color = trackMetaOf(elements).color;
  return color ? { boxShadow: `inset 3px 0 0 ${TRACK_COLOR_VAR[color]}` } : {};
}

export interface TrackSettingsActions {
  meta: TrackMeta;
  rename: (raw: string) => Promise<void>;
  setColor: (color: TrackColor | null) => Promise<void>;
  setLocked: (locked: boolean) => Promise<void>;
}

export function useTrackSettings(
  elements: readonly TimelineElement[],
  displayNumber: number | null,
): TrackSettingsActions {
  const { onSetElementsAttributeQuiet } = useTimelineEditContextOptional();
  const meta = useMemo(() => trackMetaOf(elements), [elements]);
  const which = displayNumber === null ? "" : ` ${displayNumber}`;
  const write = async (attr: string, value: string | null, label: string) => {
    if (!onSetElementsAttributeQuiet || elements.length === 0) return;
    // Track settings stay editable on a locked track (see creator/lockGate.ts).
    await allowingLockedTrackEdit(() =>
      onSetElementsAttributeQuiet(
        elements.map((element) => ({ element, value })),
        attr,
        label,
      ),
    );
  };
  return {
    meta,
    rename: (raw) => write(TRACK_NAME_ATTR, normalizeTrackName(raw), t("track.renamed", { which })),
    setColor: (color) => write(TRACK_COLOR_ATTR, color, t("track.colored", { which })),
    setLocked: (locked) =>
      write(
        TRACK_LOCK_ATTR,
        locked ? "" : null,
        t(locked ? "track.locked" : "track.unlocked", { which }),
      ),
  };
}

/** Hide/mute stays available on a locked track, as in CapCut and Filmora. */
export function withLockedTrackBypass<A extends unknown[]>(
  handler: ((...args: A) => Promise<void> | void) | undefined,
): ((...args: A) => Promise<void>) | undefined {
  return handler && ((...args) => allowingLockedTrackEdit(async () => handler(...args)));
}

export function TrackNameField({
  label,
  editing,
  onStartEditing,
  onDone,
}: {
  label: string;
  editing: boolean;
  onStartEditing: () => void;
  onDone: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(label);
  if (!editing) {
    return (
      <span
        title={`${label} — ${t("track.renameHint")}`}
        className="min-w-0 truncate text-[11px] leading-tight"
        onDoubleClick={(event) => {
          event.stopPropagation();
          setDraft(label);
          onStartEditing();
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      aria-label={t("track.rename")}
      onChange={(event) => setDraft(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") onDone(draft);
        if (event.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(draft)}
      className="h-5 min-w-0 flex-1 rounded border border-[var(--timeline-accent)] bg-[var(--timeline-row-bg)] px-1 text-[11px] text-[var(--timeline-text-solid)] outline-none"
    />
  );
}

export function TrackLockButton({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  const label = locked ? t("track.unlock") : t("track.lock");
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={locked}
      title={label}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 transition-colors",
        "focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-[var(--timeline-accent)]",
        locked
          ? "text-[var(--timeline-accent)]"
          : "text-[var(--timeline-text-faint)] hover:text-[var(--timeline-text-soft)]",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {locked ? <LockSimple size={13} weight="fill" /> : <LockSimpleOpen size={13} />}
    </button>
  );
}

export interface TrackMenuAnchor {
  x: number;
  y: number;
}

export function TrackContextMenu({
  anchor,
  actions,
  hidden,
  asMute,
  onRename,
  onToggleHidden,
  onClose,
}: {
  anchor: TrackMenuAnchor;
  actions: TrackSettingsActions;
  hidden: boolean;
  asMute: boolean;
  onRename: () => void;
  onToggleHidden: () => void;
  onClose: () => void;
}) {
  const menuRef = useContextMenuDismiss(onClose);
  const row = cn(menuClasses.row, menuClasses.rowEnabled);
  const run = (task: () => unknown) => () => {
    onClose();
    void task();
  };
  const hideLabel = asMute
    ? hidden
      ? t("track.unmute")
      : t("track.mute")
    : hidden
      ? t("track.show")
      : t("track.hide");
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("track.menu")}
      className={`${menuClasses.panel} fixed z-200 min-w-48`}
      style={{
        left: Math.min(anchor.x, window.innerWidth - 220),
        top: Math.min(anchor.y, window.innerHeight - 260),
      }}
    >
      <div className={menuClasses.group}>
        <button type="button" role="menuitem" className={row} onClick={run(onRename)}>
          {t("track.rename")}
        </button>
        <button
          type="button"
          role="menuitem"
          className={row}
          onClick={run(() => actions.setLocked(!actions.meta.locked))}
        >
          {actions.meta.locked ? t("track.unlock") : t("track.lock")}
        </button>
        <button type="button" role="menuitem" className={row} onClick={run(onToggleHidden)}>
          {hideLabel}
        </button>
      </div>
      <div className={menuClasses.group}>
        <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-[var(--timeline-text-faint)]">
          {t("track.color")}
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {TRACK_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-checked={actions.meta.color === color}
              aria-label={t(COLOR_LABEL[color])}
              title={t(COLOR_LABEL[color])}
              onClick={run(() => actions.setColor(color))}
              className={cn(
                "h-5 w-5 rounded-full",
                actions.meta.color === color &&
                  "ring-2 ring-[var(--timeline-text-solid)] ring-offset-1",
              )}
              style={{ background: TRACK_COLOR_VAR[color] }}
            />
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={run(() => actions.setColor(null))}
            className="ml-1 text-[10px] text-[var(--timeline-text-faint)] hover:text-[var(--timeline-text-solid)]"
          >
            {t("track.noColor")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
