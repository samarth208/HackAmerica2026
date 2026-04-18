// Read DESIGN.md before modifying.
import { AlertTriangle, Clock, Radio, HeartPulse, Zap } from "lucide-react";

function SeverityBar({ value, color }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="font-label text-text-muted uppercase tracking-wider" style={{ fontSize: 10 }}>{label}</span>
      <span className={`font-data font-semibold ${highlight ?? "text-text-primary"}`} style={{ fontSize: 11 }}>{value}</span>
    </div>
  );
}

function TacticalCard({ icon: Icon, iconColor, title, value, sub, severity }) {
  return (
    <div className="rounded-lg p-3 mb-2" style={{
      background: `${iconColor}08`,
      border: `1px solid ${iconColor}25`,
    }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-md shrink-0"
          style={{ width: 24, height: 24, background: `${iconColor}18`, border: `1px solid ${iconColor}35` }}>
          <Icon size={12} style={{ color: iconColor }} />
        </div>
        <span className="font-label font-semibold uppercase tracking-wider text-text-primary" style={{ fontSize: 10 }}>
          {title}
        </span>
      </div>
      <div className="font-data font-bold text-text-primary mb-1" style={{ fontSize: 18 }}>{value}</div>
      {sub && <p className="font-ui text-text-muted mb-2" style={{ fontSize: 11 }}>{sub}</p>}
      {severity != null && <SeverityBar value={severity} color={iconColor} />}
    </div>
  );
}

export default function ThreatPanel() {
  return (
    <div className="flex flex-col bg-surface border-r border-border shrink-0 overflow-y-auto"
      style={{ width: 236 }}>

      {/* Incident header */}
      <div className="px-4 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertTriangle size={11} className="text-threat-red" />
          <span className="font-label uppercase tracking-widest text-threat-red" style={{ fontSize: 9 }}>
            Active Incident
          </span>
        </div>
        <h1 className="font-brand font-bold text-text-primary leading-none mb-1" style={{ fontSize: 26 }}>
          M6.7 Seismic
        </h1>
        <p className="font-ui text-text-muted" style={{ fontSize: 12 }}>
          Northridge epicenter · 17 km depth
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-data text-threat-red font-bold" style={{ fontSize: 12 }}>CRITICAL</span>
          <div className="flex-1">
            <SeverityBar value={0.87} color="var(--color-threat-red)" />
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="px-4 py-3 border-b border-border">
        <StatRow label="Epicenter"    value="34.213°N 118.537°W" />
        <StatRow label="Magnitude"    value="6.7 Mw" highlight="text-threat-red" />
        <StatRow label="Depth"        value="17.0 km" />
        <StatRow label="Time"         value="04:31 UTC" />
        <StatRow label="Affected Pop" value="~2.1M" highlight="text-threat-orange" />
      </div>

      {/* Tactical cards */}
      <div className="px-4 py-3">
        <TacticalCard
          icon={Clock}
          iconColor="var(--color-threat-orange)"
          title="Response Time"
          value="00:04:11"
          sub="13 crews en route to Hub Alpha"
          severity={0.72}
        />
        <TacticalCard
          icon={Radio}
          iconColor="var(--color-accent)"
          title="Comms Grid"
          value="81%"
          sub="Connectivity loss — backup relay active"
          severity={0.81}
        />
        <TacticalCard
          icon={HeartPulse}
          iconColor="var(--color-threat-purple)"
          title="Medical Surge"
          value="Lvl 4"
          sub="3 hospitals at overflow threshold"
          severity={0.92}
        />
        <TacticalCard
          icon={Zap}
          iconColor="var(--color-threat-amber)"
          title="Aftershock Risk"
          value="35%"
          sub="2h window · M4.5+ probability"
          severity={0.35}
        />
      </div>

    </div>
  );
}
