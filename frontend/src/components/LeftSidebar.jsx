// Read DESIGN.md and CLAUDE.md before modifying.
import { AlertTriangle, Clock, Radio, Cross } from "lucide-react";

// ─── StatusCard ───────────────────────────────────────────────────────────────
function StatusCard() {
  return (
    <div
      className="mx-3 mb-3 rounded p-3"
      style={{
        background: "rgba(239,68,68,0.08)",
        border:     "1px solid rgba(239,68,68,0.35)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-label text-xs uppercase tracking-wider font-medium text-threat-red">
          STATUS: CRITICAL
        </span>
        <AlertTriangle size={13} className="text-threat-red" />
      </div>
      <div
        className="mb-2"
        style={{ height: 1, background: "linear-gradient(to right, var(--color-threat-red), transparent)" }}
      />
      <p className="font-ui text-xs leading-relaxed text-text-muted">
        Immediate structural integrity threats detected across 16 high-density zones.
      </p>
    </div>
  );
}

// ─── TacticalCard ─────────────────────────────────────────────────────────────
function TacticalCard({ icon: Icon, iconColor, badge, badgeColor, title, subtitle, subtitleClass, right }) {
  return (
    <div
      className="mx-3 mb-2 rounded p-2.5"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <div
          className="mt-0.5 shrink-0 rounded-full flex items-center justify-center"
          style={{
            width:      28,
            height:     28,
            background: `${iconColor}22`,
            border:     `1px solid ${iconColor}55`,
          }}
        >
          <Icon size={13} style={{ color: iconColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span className="font-label uppercase font-medium block text-text-primary" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
            {title}
          </span>
          <div className="flex items-center justify-between gap-1 mt-0.5 min-w-0">
            <p className={`font-ui text-xs truncate ${subtitleClass ?? "text-text-muted"}`}>
              {subtitle}
            </p>
            {right && (
              <span className="font-data shrink-0 text-threat-amber" style={{ fontSize: 10 }}>
                {right.text}
              </span>
            )}
            {badge && (
              <span
                className="font-label uppercase shrink-0 px-1 py-0.5 rounded"
                style={{
                  color:         badgeColor,
                  background:    `${badgeColor}18`,
                  border:        `1px solid ${badgeColor}44`,
                  fontSize:      8,
                  letterSpacing: "0.05em",
                }}
              >
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LeftSidebar ──────────────────────────────────────────────────────────────
export default function LeftSidebar() {
  return (
    <div
      className="flex flex-col bg-surface border-r border-border overflow-y-auto shrink-0"
      style={{ width: 220 }}
      data-testid="left-sidebar"
    >
      {/* Incident Header */}
      <div className="px-3 pt-4 pb-3">
        <span className="font-label text-xs uppercase tracking-widest text-accent">
          Seismic Anomaly
        </span>
        <h1 className="font-brand font-bold leading-tight mt-0.5 text-text-primary" style={{ fontSize: 28 }}>
          Mag 7.2 Event
        </h1>
        <p className="font-label text-xs uppercase tracking-wider mt-1 text-text-muted">
          Sector 7G &bull; Active Displacement
        </p>
      </div>

      {/* Status Card */}
      <StatusCard />

      {/* Tactical Cards */}
      <TacticalCard
        icon={Clock}
        iconColor="var(--color-threat-orange)"
        title="Tactical Deployment"
        subtitle="Crews Dispatched: 13 Hub-Alpha"
        right={{ text: "14:02:11" }}
      />
      <TacticalCard
        icon={Radio}
        iconColor="var(--color-accent)"
        badge="Comm Link"
        badgeColor="var(--color-accent)"
        title="Infrastructure Grid"
        subtitle="81% Connectivity Loss"
        subtitleClass="text-threat-orange"
      />
      <TacticalCard
        icon={Cross}
        iconColor="var(--color-threat-purple)"
        badge="Medical"
        badgeColor="var(--color-threat-purple)"
        title="Emergency Triage"
        subtitle="Level: 4 Overflow"
      />
    </div>
  );
}
