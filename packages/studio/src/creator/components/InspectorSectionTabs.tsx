export const INSPECTOR_LABELS: Record<string, string> = {
  text: "Texte",
  style: "Vidéo / image",
  layout: "Transformation",
  motion: "Animation",
  grade: "Ajustement",
  effects: "Effets",
  overlays: "Superpositions",
  "audio-fx": "Son",
  media: "Média / vitesse",
};
export function InspectorSectionTabs({
  groups,
  active,
  onSelect,
}: {
  groups: readonly { id: string; title: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="creator-inspector-tabs" aria-label="Sections des propriétés">
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          aria-pressed={group.id === active}
          onClick={() => onSelect(group.id)}
        >
          {INSPECTOR_LABELS[group.id] ?? group.title}
        </button>
      ))}
    </nav>
  );
}
