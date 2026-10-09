import { useEffect } from "react";
import { create } from "zustand";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { useDockLayoutStore } from "../../components/dock/dockLayoutStore";
const useInspectorRequest = create<{ section: string | null }>(() => ({ section: null }));
export function useCreatorInspectorNavigation(enabled: boolean, select: (id: string) => void) {
  const section = useInspectorRequest((state) => state.section);
  useEffect(() => {
    if (!enabled || !section) return;
    select(section);
    useInspectorRequest.setState({ section: null });
  }, [enabled, section, select]);
}
export function InspectorLibraryShortcut({ kind }: { kind: "effects" | "grade" }) {
  const { domEditSelection } = useDomEditContext();
  const tag = domEditSelection?.tagName?.toLowerCase();
  const selected = tag === "video" || tag === "img";
  return (
    <section className="flex flex-col gap-3 border-b border-border p-3 text-xs">
      <h3 className="font-semibold">
        {kind === "grade" ? "Filtres, couleur et LUT" : "Effets sur le clip"}
      </h3>
      <p className="text-text-muted">
        {kind === "grade"
          ? "Retrouvez les réglages colorimétriques, les courbes et les LUT dans l’inspecteur du clip sélectionné."
          : "Appliquez un effet au clip sélectionné et réglez ses paramètres dans l’inspecteur."}
      </p>
      <button
        disabled={!selected}
        className="rounded border border-border-strong bg-accent/10 p-2 text-accent disabled:opacity-40"
        onClick={() => {
          useInspectorRequest.setState({ section: kind });
          useDockLayoutStore.getState().activatePanel("design");
        }}
      >
        {selected ? "Ouvrir les réglages du clip" : "Sélectionnez une vidéo ou une image"}
      </button>
    </section>
  );
}
