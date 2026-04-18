// Read DESIGN.md and CLAUDE.md before modifying.
import { Activity } from "lucide-react";

// ─── DESIGN.md token constants ────────────────────────────────────────────────
const TOKEN = {
  textPrimary:  "#f8fafc",
  textMuted:    "#94a3b8",
  surface:      "#0e1223",
  threatRed:    "#ef4444",
  border:       "#334155",
};

// ─── Pulse animation (injected once) ─────────────────────────────────────────
const PULSE_ID = "impact-card-pulse";
if (typeof document !== "undefined" && !document.getElementById(PULSE_ID)) {
  const s = document.createElement("style");
  s.id = PULSE_ID;
  s.textContent = `
    @keyframes impact-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    .impact-dot { animation: impact-pulse 1.4s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

// ─── ImpactZoneCard ───────────────────────────────────────────────────────────
export default function ImpactZoneCard() {
  return (
    <div
      className="absolute top-4 right-4 z-[1000] overflow-hidden"
      style={{
        width: 200,
        background: TOKEN.surface,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 6,
        backdropFilter: "blur(8px)",
      }}
      data-testid="impact-zone-card"
    >
      {/* ── Header bar — solid red, full bleed ── */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: TOKEN.threatRed }}
      >
        <div className="flex items-center gap-2">
          {/* Pulsing alert dot */}
          <span
            className="impact-dot"
            style={{
              display:         "block",
              width:           7,
              height:          7,
              borderRadius:    "50%",
              background:      "#fff",
              flexShrink:      0,
            }}
          />
          <span
            className="font-ui font-semibold uppercase"
            style={{ color: "#fff", fontSize: 11, letterSpacing: "0.08em" }}
          >
            Impact Zone A-1
          </span>
        </div>
        <Activity size={14} color="rgba(255,255,255,0.8)" />
      </div>

      {/* ── Ground Motion ── */}
      <div className="px-3 pt-3 pb-1">
        <p
          className="font-ui uppercase"
          style={{ color: TOKEN.textMuted, fontSize: 9, letterSpacing: "0.12em", marginBottom: 2 }}
        >
          Ground Motion
        </p>
        <div className="flex items-baseline gap-1">
          <span
            className="font-data font-medium"
            style={{ color: TOKEN.textPrimary, fontSize: 36, lineHeight: 1 }}
          >
            32.4
          </span>
          <span
            className="font-data"
            style={{ color: TOKEN.textMuted, fontSize: 12 }}
          >
            cr/s²
          </span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 my-2" style={{ height: 1, background: TOKEN.border }} />

      {/* ── Magnitude + Depth ── */}
      <div className="flex px-3 pb-3 gap-6">
        <div>
          <p
            className="font-ui uppercase"
            style={{ color: TOKEN.textMuted, fontSize: 8, letterSpacing: "0.1em", marginBottom: 2 }}
          >
            Magnitude
          </p>
          <span
            className="font-data font-medium"
            style={{ color: TOKEN.textPrimary, fontSize: 18 }}
          >
            7.2
          </span>
        </div>
        <div>
          <p
            className="font-ui uppercase"
            style={{ color: TOKEN.textMuted, fontSize: 8, letterSpacing: "0.1em", marginBottom: 2 }}
          >
            Depth
          </p>
          <span
            className="font-data font-medium"
            style={{ color: TOKEN.textPrimary, fontSize: 18 }}
          >
            12km
          </span>
        </div>
      </div>
    </div>
  );
}
