import type { SpatialSettings, Position3D } from "../spatialAudio";
const DIRECTIONS: { name: string; position: Position3D }[] = [
  { name: "Gauche", position: { x: -1, y: 0, z: 0 } },
  { name: "Droite", position: { x: 1, y: 0, z: 0 } },
  { name: "Devant", position: { x: 0, y: 0, z: -1 } },
  { name: "Derrière", position: { x: 0, y: 0, z: 1 } },
  { name: "Au-dessus", position: { x: 0, y: 1, z: 0 } },
  { name: "En dessous", position: { x: 0, y: -1, z: 0 } },
];
export function SpatialPositionView({
  settings,
  onChange,
}: {
  settings: SpatialSettings;
  onChange: (settings: SpatialSettings) => void;
}) {
  const point = settings.points[0];
  if (!point) return null;
  const relative = {
    x: point.x - settings.listener.x,
    y: point.y - settings.listener.y,
    z: point.z - settings.listener.z,
  };
  const distance = Math.hypot(relative.x, relative.y, relative.z);
  const scale = 42 / Math.max(1, Math.abs(relative.x), Math.abs(relative.y), Math.abs(relative.z));
  return (
    <section aria-label="Position initiale du son" className="rounded border border-border p-2">
      <div className="grid grid-cols-3 gap-1">
        {DIRECTIONS.map(({ name, position }) => (
          <button
            key={name}
            type="button"
            className="rounded bg-accent/10 p-1 text-xs text-accent"
            onClick={() =>
              onChange({
                ...settings,
                points: settings.points.map((p, i) =>
                  i
                    ? p
                    : {
                        ...p,
                        x: settings.listener.x + position.x,
                        y: settings.listener.y + position.y,
                        z: settings.listener.z + position.z,
                      },
                ),
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 250 140"
        role="img"
        aria-label={`Position initiale : distance ${distance.toFixed(2)} mètres`}
        className="w-full text-text-muted"
      >
        {[
          { cx: 62, title: "Vue de dessus", dy: relative.z },
          { cx: 187, title: "Vue de face", dy: -relative.y },
        ].map(({ cx, title, dy }) => (
          <g key={title}>
            <text x={cx} y="14" textAnchor="middle" fill="currentColor" fontSize="10">
              {title}
            </text>
            <circle cx={cx} cy="75" r="44" fill="none" stroke="currentColor" opacity="0.3" />
            <path d={`M${cx - 44} 75h88M${cx} 31v88`} stroke="currentColor" opacity="0.2" />
            <line
              x1={cx}
              y1="75"
              x2={cx + relative.x * scale}
              y2={75 + dy * scale}
              stroke="currentColor"
            />
            <circle cx={cx} cy="75" r="5" fill="currentColor" />
            <circle
              cx={cx + relative.x * scale}
              cy={75 + dy * scale}
              r="6"
              fill="var(--color-accent)"
            />
            <text x={cx} y="136" textAnchor="middle" fill="currentColor" fontSize="9">
              Auditeur au centre
            </text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-text-muted">
        Source initiale : {distance.toFixed(2)} m de l’auditeur. Les directions modifient la
        première image clé.
      </p>
    </section>
  );
}
