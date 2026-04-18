// Read DESIGN.md before modifying.

const LAYERS = [
  { key: "firePerimeter",  label: "Fire",        dot: "var(--color-threat-orange)" },
  { key: "emberRisk",      label: "Ember Risk",  dot: "var(--color-threat-amber)"  },
  { key: "seismicDamage",  label: "Damage Grid", dot: "var(--color-threat-red)"    },
  { key: "crews",          label: "Crews",       dot: "var(--color-threat-green)"  },
  { key: "infrastructure", label: "Infra",       dot: "var(--color-accent)"        },
];

function LayerPill({ label, layerKey, active, dot, onClick }) {
  return (
    <button
      onClick={onClick}
      data-layer-key={layerKey}
      className="flex items-center gap-1.5 rounded-full px-3 font-label transition-all cursor-pointer focus:outline-none"
      style={{
        height: 26,
        fontSize: 11,
        border: `1px solid ${active ? dot : "var(--color-border)"}`,
        background: active ? `${dot}14` : "transparent",
        color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
        opacity: active ? 1 : 0.6,
      }}
    >
      <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: active ? dot : "currentColor" }} />
      {label}
    </button>
  );
}

export default function LayerControls({ layerVisibility = {}, onToggleLayer }) {
  return (
    <div className="w-full bg-surface/95 border-t border-border px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0 backdrop-blur-sm">
      <span className="font-label text-text-muted uppercase tracking-widest shrink-0 mr-1" style={{ fontSize: 10 }}>
        Layers
      </span>
      {LAYERS.map(({ key, label, dot }) => (
        <LayerPill
          key={key}
          layerKey={key}
          label={label}
          dot={dot}
          active={layerVisibility[key] !== false}
          onClick={() => onToggleLayer?.(key)}
        />
      ))}
    </div>
  );
}
