import { useEffect, useRef, useState } from "react";
import type { SerializedDockview } from "dockview-react";
import { useDockLayoutStore } from "./dockLayoutStore";
import { PANEL_DEFINITIONS } from "./panelRegistry";
import {
  readWorkspacePresets,
  writeWorkspacePresets,
  type WorkspacePreset,
} from "./workspacePresets";
import { Button } from "../ui";

export function WorkspaceMenu() {
  const { controller, panels, openPanels } = useDockLayoutStore();
  const [open, setOpen] = useState(false);
  const locked = useDockLayoutStore(state => state.locked);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [message, setMessage] = useState("");
  const previous = useRef<SerializedDockview | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    try {
      setPresets(readWorkspacePresets(localStorage));
    } catch {
      setMessage("Stockage indisponible.");
    }
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const run = (operation: () => void, success: string) => {
    try {
      operation();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opération impossible.");
    }
  };
  const store = (next: WorkspacePreset[]) => {
    writeWorkspacePresets(localStorage, next);
    setPresets(next);
  };
  const remember = () => {
    previous.current = controller?.capture?.() ?? null;
  };
  const chosen = presets.find((preset) => preset.name === selected);
  const cleanName = name.trim().slice(0, 80);

  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        Espace de travail
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Espace de travail"
          className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-border-strong bg-surface p-3 shadow-xl text-step-12"
        >
          <p className="mb-2 text-text-muted">
            Déplacez les panneaux par leur onglet. Enregistrez la disposition pour la retrouver à la
            prochaine ouverture.
          </p>
          <div className="grid grid-cols-2 gap-1">
            {panels.map((id) => (
              <label key={id} className="flex items-center gap-2 p-1 text-text-1">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={openPanels.has(id)}
                  onChange={() => useDockLayoutStore.getState().togglePanel(id)}
                />
                {PANEL_DEFINITIONS[id].title}
              </label>
            ))}
          </div>
          <label className="my-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={locked}
              onChange={(e) => {
                
                controller?.lock?.(e.target.checked);
              }}
            />
            Verrouiller la disposition
          </label>
          <div className="flex flex-wrap gap-1">
            <Button
              disabled={locked}
              onClick={() => {
                remember();
                controller?.reset();
              }}
            >
              Disposition par défaut
            </Button>
            <Button
              disabled={locked || !previous.current}
              onClick={() => {
                const layout = previous.current;
                remember();
                if (layout) controller?.restore?.(layout);
              }}
            >
              Disposition précédente
            </Button>
            <Button
              onClick={() => run(() => controller?.save?.(), "Disposition actuelle enregistrée.")}
            >
              Enregistrer la disposition actuelle
            </Button>
          </div>
          <label className="mt-3 block">
            Nom de la disposition
            <input
              aria-label="Nom de la disposition"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-border-strong bg-input p-2"
            />
          </label>
          <Button
            disabled={!cleanName || presets.some((p) => p.name === cleanName)}
            onClick={() =>
              run(() => {
                const layout = controller?.capture?.();
                if (!layout) throw new Error("Studio en cours de chargement.");
                store([...presets, { name: cleanName, layout }]);
                setSelected(cleanName);
              }, "Disposition nommée enregistrée.")
            }
          >
            Créer une disposition nommée
          </Button>
          <select
            aria-label="Dispositions enregistrées"
            className="my-2 w-full rounded border border-border-strong bg-input p-2"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setName(e.target.value);
            }}
          >
            <option value="">Choisir une disposition</option>
            {presets.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <Button
              disabled={!chosen || locked}
              onClick={() =>
                run(() => {
                  if (chosen) {
                    remember();
                    controller?.restore?.(chosen.layout);
                  }
                }, "Disposition chargée pour cette session.")
              }
            >
              Charger
            </Button>
            <Button
              disabled={
                !chosen || !cleanName || presets.some((p) => p.name === cleanName && p !== chosen)
              }
              onClick={() =>
                run(() => {
                  store(presets.map((p) => (p === chosen ? { ...p, name: cleanName } : p)));
                  setSelected(cleanName);
                }, "Disposition renommée.")
              }
            >
              Renommer
            </Button>
            <Button
              disabled={!chosen}
              onClick={() =>
                run(() => {
                  store(presets.filter((p) => p !== chosen));
                  setSelected("");
                }, "Disposition supprimée.")
              }
            >
              Supprimer
            </Button>
          </div>
          <p role="status" className="mt-2 text-text-muted">
            {message}
          </p>
        </div>
      )}
    </div>
  );
}
