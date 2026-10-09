import { useCreatorEditorControls } from "../CreatorEditorContext";
import { useCompositionDocument } from "../compositionDocument";
import { readCompositionSettings } from "../projectSettings";
export function ProjectInspectorInfo() {
  const creator = useCreatorEditorControls();
  const { html } = useCompositionDocument();
  const settings = readCompositionSettings(html);
  return (
    <section className="border-b border-border p-4 text-xs" aria-label="Informations du projet">
      <h2 className="mb-4 text-sm font-semibold text-accent">Informations du projet</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
        <dt className="text-text-muted">Nom</dt>
        <dd className="truncate">{creator?.project?.title ?? "—"}</dd>
        <dt className="text-text-muted">Résolution</dt>
        <dd>{settings ? `${settings.width} × ${settings.height}` : "—"}</dd>
        <dt className="text-text-muted">Cadence</dt>
        <dd>{creator?.project?.fps ?? 30} images/s</dd>
        <dt className="text-text-muted">Durée</dt>
        <dd>{settings ? `${settings.duration} s` : "—"}</dd>
      </dl>
      <p className="mt-5 text-text-muted">
        Sélectionnez un clip, un texte ou une forme pour afficher ses propriétés.
      </p>
    </section>
  );
}
