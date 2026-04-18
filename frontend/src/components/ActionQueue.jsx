// Read DESIGN.md before modifying.
import { useState } from "react";
import { ShieldAlert, CheckCheck, X } from "lucide-react";

const TYPE_CONFIG = {
  dispatch:      { color: "var(--color-threat-red)",    label: "DISPATCH"   },
  evacuate:      { color: "var(--color-threat-amber)",  label: "EVACUATE"   },
  reposition:    { color: "var(--color-threat-orange)", label: "REPOSITION" },
  alert:         { color: "var(--color-threat-purple)", label: "ALERT"      },
  ember_dispatch:{ color: "var(--color-threat-green)",  label: "EMBER"      },
  seismic_alert: { color: "var(--color-threat-purple)", label: "SEISMIC"    },
};

const SENSITIVITY_COLOR = {
  immediate: "var(--color-threat-red)",
  high:      "var(--color-threat-orange)",
  medium:    "var(--color-threat-amber)",
  low:       "var(--color-threat-green)",
};

function ConfidenceRing({ pct, color }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
      <circle cx="13" cy="13" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />
      <circle cx="13" cy="13" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text x="13" y="16.5" textAnchor="middle" fill="white" style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 700 }}>
        {pct}%
      </text>
    </svg>
  );
}

function ActionCard({ card, onAction }) {
  const cfg = TYPE_CONFIG[card.action_type] ?? { color: "var(--color-text-muted)", label: card.action_type?.toUpperCase() };
  const sensColor = SENSITIVITY_COLOR[card.time_sensitivity] ?? "var(--color-text-muted)";
  const pct = Math.round((card.confidence ?? 0.9) * 100);

  return (
    <div className="rounded-lg mb-2.5 overflow-hidden"
      style={{ border: `1px solid ${cfg.color}30`, background: `${cfg.color}06` }}>

      {/* Color accent strip */}
      <div style={{ height: 2, background: cfg.color, opacity: 0.7 }} />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="font-label font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm"
            style={{ fontSize: 9, color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}35` }}>
            {cfg.label}
          </span>
          <span className="font-data ml-auto" style={{ fontSize: 10, color: sensColor }}>
            {card.time_sensitivity?.toUpperCase()}
          </span>
          <ConfidenceRing pct={pct} color={cfg.color} />
        </div>

        {/* Rationale */}
        <p className="font-ui text-text-primary leading-relaxed mb-3" style={{ fontSize: 12 }}>
          {card.rationale}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onAction(card.id ?? card.db_id, "approved")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded font-label font-semibold uppercase tracking-wider transition-all cursor-pointer"
            style={{
              fontSize: 10, height: 28,
              color: "var(--color-threat-green)",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.35)",
            }}
          >
            <CheckCheck size={11} /> Approve
          </button>
          <button
            onClick={() => onAction(card.id ?? card.db_id, "dismissed")}
            className="flex items-center justify-center rounded transition-all cursor-pointer"
            style={{
              width: 28, height: 28,
              color: "var(--color-text-muted)",
              background: "transparent",
              border: "1px solid var(--color-border)",
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActionQueue({ actionCards = [] }) {
  const [removedIds, setRemovedIds] = useState(new Set());

  async function handleAction(id, status) {
    if (id == null) { setRemovedIds((p) => new Set([...p, id])); return; }
    try {
      const res = await fetch(`/api/actions/${id}/${status === "approved" ? "approve" : "dismiss"}`, { method: "PATCH" });
      if (res.ok) setRemovedIds((p) => new Set([...p, id]));
    } catch {
      setRemovedIds((p) => new Set([...p, id]));
    }
  }

  const visible = [...actionCards]
    .filter((c) => !removedIds.has(c.id ?? c.db_id))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return (
    <div className="flex flex-col border-b border-border overflow-hidden" style={{ flex: "0 0 auto", maxHeight: "55%" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="font-label font-semibold uppercase tracking-widest text-accent" style={{ fontSize: 10 }}>
          Action Queue
        </span>
        {visible.length > 0 && (
          <span className="font-data font-bold text-threat-red rounded-full px-1.5"
            style={{ fontSize: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
            {visible.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-text-muted">
            <ShieldAlert size={24} strokeWidth={1.5} />
            <span className="font-ui text-xs">No active recommendations</span>
          </div>
        ) : (
          visible.map((card, i) => (
            <ActionCard key={card.id ?? card.db_id ?? i} card={card} onAction={handleAction} />
          ))
        )}
      </div>
    </div>
  );
}
