// Read DESIGN.md and CLAUDE.md before modifying.
// Dark map legend overlay — 5 layer rows with color swatch + name + toggle switch.
// All colors from DESIGN.md tokens only.

// DESIGN.md token constants — reference CSS vars to stay in sync with the design system
const TOKEN = {
  surface:     "var(--color-surface)",
  border:      "var(--color-border)",
  textPrimary: "var(--color-text-primary)",
  textMuted:   "var(--color-text-muted)",
  threatGreen: "var(--color-threat-green)",
  threatAmber: "var(--color-threat-amber)",
  threatRed:   "var(--color-threat-red)",
  threatPurple:"var(--color-threat-purple)",
  accent:      "var(--color-accent)",
};

const LAYERS = [
  { key: "firePerimeter",  label: "Fire Perimeter",   color: TOKEN.threatRed    },
  { key: "emberRisk",      label: "Ember Risk 30 min", color: TOKEN.threatAmber  },
  { key: "seismicDamage",  label: "Seismic Damage",   color: TOKEN.threatPurple },
  { key: "crews",          label: "Crews",             color: TOKEN.threatGreen  },
  { key: "infrastructure", label: "Infrastructure",    color: TOKEN.accent       },
];

// Toggle switch — pure inline styles to avoid Tailwind class purge in Leaflet context
function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        width:          32,
        height:         18,
        borderRadius:   9,
        background:     checked ? TOKEN.accent : TOKEN.border,
        border:         "none",
        cursor:         "pointer",
        padding:        2,
        transition:     "background 0.2s",
        flexShrink:     0,
      }}
    >
      <span
        style={{
          display:      "block",
          width:        14,
          height:       14,
          borderRadius: "50%",
          background:   TOKEN.textPrimary,
          transform:    checked ? "translateX(14px)" : "translateX(0)",
          transition:   "transform 0.2s",
        }}
      />
    </button>
  );
}

export default function MapLegend({ layerVisibility = {}, onToggle }) {
  return (
    <div
      style={{
        position:     "absolute",
        bottom:       48,          // sit above LayerControls bar
        left:         12,
        zIndex:       1000,
        background:   "rgba(14,18,35,0.92)",  // surface + alpha
        border:       `1px solid ${TOKEN.border}`,
        borderRadius: 8,
        padding:      "10px 12px",
        minWidth:     200,
        backdropFilter: "blur(4px)",
        fontFamily:   "Fira Sans, sans-serif",
      }}
    >
      <p
        style={{
          margin:        "0 0 8px 0",
          fontSize:      11,
          color:         TOKEN.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight:    600,
        }}
      >
        Layers
      </p>

      {LAYERS.map(({ key, label, color }) => (
        <div
          key={key}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            8,
            marginBottom:   6,
            opacity:        layerVisibility[key] === false ? 0.4 : 1,
            transition:     "opacity 0.2s",
          }}
        >
          {/* Color swatch */}
          <span
            style={{
              display:      "inline-block",
              width:        12,
              height:       12,
              borderRadius: 2,
              background:   color,
              flexShrink:   0,
            }}
          />

          {/* Layer name */}
          <span
            style={{
              flex:       1,
              fontSize:   12,
              color:      TOKEN.textPrimary,
              userSelect: "none",
            }}
          >
            {label}
          </span>

          {/* Toggle */}
          <Toggle
            checked={layerVisibility[key] !== false}
            onChange={() => onToggle?.(key)}
          />
        </div>
      ))}
    </div>
  );
}
