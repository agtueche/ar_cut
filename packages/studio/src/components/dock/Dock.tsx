import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";
import { installDockAccessibility } from "./dockAccessibility";
import { DockStripActions } from "./DockStripActions";
import { DockTab } from "./DockTab";
import { installTabFill } from "./dockTabFill";
import { addRegisteredPanel, applySideMinimums, buildEditLayout } from "./dockLayout";
import { DOCK_PANEL_COMPONENT, parseDockLayout } from "./dockLayoutSchema";
import { useDockLayoutStore, type DockController, type DockSnapshot } from "./dockLayoutStore";
import {
  PANEL_DEFINITIONS,
  PANEL_IDS,
  LEGACY_PANEL_IDS,
  isPanelId,
  panelsInZone,
  type PanelDefinition,
  type PanelId,
} from "./panelRegistry";
import "./dock.css";
import { menuClasses } from "../ui/menuStyle";
import { useCreatorEditorControls } from "../../creator/CreatorEditorContext";
import { WorkspaceMenu } from "./WorkspaceMenu";

const PERSIST_DEBOUNCE_MS = 250;

type Slots = Partial<Record<PanelId, HTMLElement>>;

interface SlotsContextValue {
  slots: Slots;
  registerSlot: (id: PanelId, element: HTMLElement | null) => void;
}

const SlotsContext = createContext<SlotsContextValue | null>(null);

function useSlots(): SlotsContextValue {
  const value = useContext(SlotsContext);
  if (!value) throw new Error("Dock.Panel must be rendered inside Dock.Root");
  return value;
}

/** The element dockview mounts for a panel; Dock.Panel portals the real content into it. */
function PanelSlot({ api }: IDockviewPanelProps) {
  const { registerSlot } = useSlots();
  const id = api.id;
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (isPanelId(id)) registerSlot(id, element);
    },
    [id, registerSlot],
  );
  return <div ref={ref} className="h-full w-full min-h-0 min-w-0 overflow-hidden" />;
}

const COMPONENTS = { [DOCK_PANEL_COMPONENT]: PanelSlot };

function snapshot(api: DockviewApi): DockSnapshot {
  const openPanels = new Set<PanelId>();
  const visiblePanels = new Set<PanelId>();
  for (const panel of api.panels) {
    if (!isPanelId(panel.id)) continue;
    openPanels.add(panel.id);
    if (panel.api.isVisible && panel.group.api.isVisible) visiblePanels.add(panel.id);
  }
  const groupActivePanels = api.groups.flatMap((group) => {
    const id = group.activePanel?.id;
    return isPanelId(id) ? [id] : [];
  });
  const active = api.activePanel?.id;
  return {
    openPanels,
    visiblePanels,
    activePanel: isPanelId(active) ? active : null,
    groupActivePanels,
  };
}

interface DockOptions {
  panels: readonly PanelId[];
  storageKey?: string | undefined;
  dockWidth: () => number;
  manual?: boolean;
  projectId?: string | null;
}

function createController(api: DockviewApi, options: DockOptions): DockController {
  const open = (id: PanelId) => {
    if (api.getPanel(id)) return;
    const { zone, reopen: preferred } = PANEL_DEFINITIONS[id];
    const reopen: PanelDefinition["reopen"] =
      zone === "center" || options.panels.includes(preferred.near)
        ? preferred
        : { near: "preview", direction: zone };
    // Side columns are tab groups; preview and timeline are separate groups in the centre.
    const sibling =
      zone === "center"
        ? undefined
        : panelsInZone(zone).find((other) => other !== id && api.getPanel(other));
    if (sibling) {
      addRegisteredPanel(api, id, { referencePanel: sibling, direction: "within" });
      return;
    }
    const hasAnchor = api.getPanel(reopen.near) !== undefined;
    const position = { referencePanel: reopen.near, direction: reopen.direction };
    addRegisteredPanel(api, id, hasAnchor ? position : undefined);
  };
  return {
    capture: () => api.toJSON(),
    restore: (layout) => {
      const parsed = parseDockLayout(layout, options.panels);
      if (!parsed) throw new Error("Disposition invalide.");
      api.fromJSON(parsed, { reuseExistingPanels: true });
    },
    save: () =>
      writeStudioUiPreferences(
        { dockLayout: api.toJSON() },
        undefined,
        options.projectId,
        options.storageKey,
      ),
    lock: (locked) => {
      useDockLayoutStore.setState({ locked });
      api.updateOptions({ locked, disableDnd: locked });
    },
    open,
    activate: (id) => {
      open(id);
      api.getPanel(id)?.api.setActive();
    },
    close: (id) => {
      if (useDockLayoutStore.getState().locked) return;
      const panel = api.getPanel(id);
      if (panel) api.removePanel(panel);
    },
    setTitle: (id, title) => api.getPanel(id)?.api.setTitle(title),
    setGroupVisible: (id, visible) => api.getPanel(id)?.group.api.setVisible(visible),
    reset: () => {
      if (!useDockLayoutStore.getState().locked)
        buildEditLayout(api, options.dockWidth(), options.panels);
    },
  };
}

/**
 * Panels added after layouts were first saved. A saved layout predating one of
 * them gets it once (migration); closing it afterwards is respected.
 */
const INTRODUCED_PANELS: readonly PanelId[] = [
  "library",
  "text",
  "markers",
  "subtitles",
  "sound",
  "credits",
];
const MIGRATED_KEY = "hf-creator-dock-introduced";

function introduceNewPanels(api: DockviewApi, projectId: string | null, options: DockOptions) {
  const key = `${MIGRATED_KEY}:${projectId ?? ""}`;
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    seen = [];
  }
  const controller = createController(api, options);
  let added = false;
  for (const id of INTRODUCED_PANELS) {
    if (seen.includes(id) || !options.panels.includes(id)) continue;
    controller.open(id);
    seen.push(id);
    added = true;
  }
  // Save the migrated layout now, not after the usual debounce: a remount
  // (StrictMode, a fast project switch) restores from storage before that and
  // would otherwise drop the panel while the marker says it was introduced.
  if (added && !options.manual) {
    writeStudioUiPreferences(
      { dockLayout: api.toJSON() },
      undefined,
      projectId,
      options.storageKey,
    );
  }
  try {
    if (!options.manual) localStorage.setItem(key, JSON.stringify(seen));
  } catch {
    /* storage unavailable: the panel is offered again next time */
  }
}

function restoreOrBuild(api: DockviewApi, projectId: string | null, options: DockOptions) {
  const { dockLayout } = readStudioUiPreferences(undefined, projectId, options.storageKey);
  const stored = parseDockLayout(dockLayout, options.panels);
  if (stored) {
    try {
      api.fromJSON(stored);
      introduceNewPanels(api, projectId, options);
      return;
    } catch {
      /* a layout the schema accepted but dockview cannot load: start over */
    }
  }
  buildEditLayout(api, options.dockWidth(), options.panels);
}

const windowWidth = () => window.innerWidth;

function Root({
  projectId,
  panels: suppliedPanels,
  storageKey,
  dockWidth = windowWidth,
  children,
  manualPersistence,
}: {
  manualPersistence?: boolean;
  projectId: string | null;
  panels?: readonly PanelId[];
  storageKey?: string;
  dockWidth?: () => number;
  children: ReactNode;
}) {
  const creator = useCreatorEditorControls();
  const panels = suppliedPanels ?? (creator ? PANEL_IDS : LEGACY_PANEL_IDS);
  const manual = manualPersistence ?? Boolean(creator);
  const [slots, setSlots] = useState<Slots>({});
  const registerSlot = useCallback((id: PanelId, element: HTMLElement | null) => {
    setSlots((prev) => {
      if (prev[id] === (element ?? undefined)) return prev;
      const next = { ...prev };
      if (element) next[id] = element;
      else delete next[id];
      return next;
    });
  }, []);

  const disposeRef = useRef<() => void>(() => {});
  useEffect(() => () => disposeRef.current(), []);

  const onReady = useCallback(
    ({ api }: DockviewReadyEvent) => {
      disposeRef.current();
      const options = { panels, storageKey, dockWidth, manual, projectId };
      restoreOrBuild(api, projectId, options);
      applySideMinimums(api, dockWidth());
      const root = api.groups[0]?.element.closest<HTMLElement>(".hf-dock");
      const disposeAccessibility = root ? installDockAccessibility(api, root) : () => {};
      const disposeTabFill = root ? installTabFill(api, root) : () => {};
      // Sides size against dockWidth, the window by default; the dock's own box lags a resize.
      const resizeObserver = new ResizeObserver(() => applySideMinimums(api, dockWidth()));
      if (root) resizeObserver.observe(root);
      const store = useDockLayoutStore.getState();
      store.attach(createController(api, options), panels);
      store.sync(snapshot(api));
      const pending = store.takePendingActivation();
      if (pending) api.getPanel(pending)?.api.setActive();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const persist = () => {
        if (manual) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          writeStudioUiPreferences({ dockLayout: api.toJSON() }, undefined, projectId, storageKey);
        }, PERSIST_DEBOUNCE_MS);
      };
      // dockview does not fire onDidLayoutChange for add/remove/activate,
      // so every event class is wired to the same sync+persist pair.
      const onDockChange = () => {
        useDockLayoutStore.getState().sync(snapshot(api));
        persist();
      };
      const subscriptions = [
        api.onDidAddPanel(() => {
          applySideMinimums(api, dockWidth());
          onDockChange();
        }),
        api.onDidMovePanel(() => {
          applySideMinimums(api, dockWidth());
          onDockChange();
        }),
        api.onDidRemovePanel(onDockChange),
        api.onDidActivePanelChange(onDockChange),
        api.onDidLayoutChange(onDockChange),
      ];
      disposeRef.current = () => {
        clearTimeout(timer);
        for (const subscription of subscriptions) subscription.dispose();
        disposeAccessibility();
        disposeTabFill();
        resizeObserver.disconnect();
        useDockLayoutStore.getState().detach();
      };
    },
    [projectId, panels, storageKey, dockWidth, manual],
  );

  return (
    <SlotsContext.Provider value={{ slots, registerSlot }}>
      <DockviewReact
        key={projectId ?? ""}
        className={`hf-dock ${creator ? "hf-dock-creator" : ""} flex-1 min-h-0`}
        components={COMPONENTS}
        defaultTabComponent={DockTab}
        rightHeaderActionsComponent={DockStripActions}
        defaultRenderer="always"
        disableFloatingGroups
        disableTabsOverflowList
        onReady={onReady}
      />
      {children}
    </SlotsContext.Provider>
  );
}

function Panel({ id, title, children }: { id: PanelId; title?: string; children: ReactNode }) {
  const element = useSlots().slots[id];
  const visible = useDockLayoutStore((state) => state.visiblePanels.has(id));
  const controller = useDockLayoutStore((state) => state.controller);
  const open = useDockLayoutStore((state) => state.openPanels.has(id));
  const label = title ?? PANEL_DEFINITIONS[id].title;
  useEffect(() => {
    if (open) controller?.setTitle(id, label);
  }, [controller, id, label, open]);
  const definition: PanelDefinition = PANEL_DEFINITIONS[id];
  const shown = visible || definition.keepMounted;
  return element && shown ? createPortal(children, element) : null;
}

function LegacyWindowMenu() {
  const openPanels = useDockLayoutStore((state) => state.openPanels);
  const panels = useDockLayoutStore((state) => state.panels);
  const togglePanel = useDockLayoutStore((state) => state.togglePanel);
  const resetLayout = useDockLayoutStore((state) => state.resetLayout);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-7 px-2.5 rounded-md text-[11px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
      >
        Window
      </button>
      {open && (
        <div role="menu" className={`${menuClasses.panel} absolute right-0 top-8 z-50 w-44`}>
          {panels.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={openPanels.has(id)}
              onClick={() => togglePanel(id)}
              className={`${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2`}
            >
              <span className="w-3 text-accent-ink">{openPanels.has(id) ? "✓" : ""}</span>
              {PANEL_DEFINITIONS[id].title}
            </button>
          ))}
          <div className={menuClasses.divider} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              resetLayout();
              setOpen(false);
            }}
            className={`${menuClasses.row} ${menuClasses.rowEnabled}`}
          >
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}

function WindowMenu() {
  const creator = useCreatorEditorControls();
  return creator ? <WorkspaceMenu /> : <LegacyWindowMenu />;
}

export const Dock = { Root, Panel, WindowMenu };
