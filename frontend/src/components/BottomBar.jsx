// Read DESIGN.md and CLAUDE.md before modifying.
import { Grid2x2 } from "lucide-react";

// ─── BottomBar ────────────────────────────────────────────────────────────────
export default function BottomBar({ onDeploy }) {
  return (
    <div
      className="w-full flex items-center shrink-0 px-4 gap-6 bg-surface border-t border-border"
      style={{ height: 60 }}
      data-testid="bottom-bar"
    >
      {/* Deploy Unit */}
      <button
        onClick={onDeploy}
        className="font-label uppercase tracking-widest font-medium rounded shrink-0 bg-white text-bg"
        style={{
          fontSize:   13,
          letterSpacing: "0.12em",
          padding:    "10px 28px",
          border:     "none",
          cursor:     "pointer",
          minWidth:   150,
        }}
        data-testid="deploy-unit-btn"
      >
        Deploy Unit
      </button>

      {/* Divider */}
      <div className="bg-border shrink-0" style={{ width: 1, height: 32 }} />

      {/* Structures Lost */}
      <div className="flex items-center gap-2.5">
        <Grid2x2 size={22} className="text-threat-red" />
        <div>
          <p className="font-label uppercase tracking-wider text-text-muted" style={{ fontSize: 9 }}>
            Structures Lost
          </p>
          <span className="font-data font-medium text-text-primary" style={{ fontSize: 20 }}>
            1,402
          </span>
        </div>
      </div>

      {/* Field Agents */}
      <div className="flex items-center gap-2.5">
        <Grid2x2 size={22} className="text-accent" />
        <div>
          <p className="font-label uppercase tracking-wider text-text-muted" style={{ fontSize: 9 }}>
            Field Agents
          </p>
          <span className="font-data font-medium text-text-primary" style={{ fontSize: 20 }}>
            412
          </span>
        </div>
      </div>
    </div>
  );
}
