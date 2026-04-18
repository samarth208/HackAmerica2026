// Read DESIGN.md before modifying.
import { Shield, Activity, Wifi, WifiOff } from "lucide-react";

const THREAT_LEVELS = {
  nominal:  { label: "NOMINAL",  cls: "text-threat-green border-threat-green bg-threat-green/10" },
  advisory: { label: "ADVISORY", cls: "text-threat-amber border-threat-amber bg-threat-amber/10" },
  warning:  { label: "WARNING",  cls: "text-threat-orange border-threat-orange bg-threat-orange/10" },
  critical: { label: "CRITICAL", cls: "text-threat-red border-threat-red bg-threat-red/10" },
};

export default function Header({ connected, simulating, onSimulate, threatLevel = "critical" }) {
  const threat = THREAT_LEVELS[threatLevel] ?? THREAT_LEVELS.nominal;

  return (
    <header className="h-topbar w-full bg-surface border-b border-border flex items-center px-5 shrink-0 gap-4">

      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center justify-center rounded-md bg-accent/15 border border-accent/30"
          style={{ width: 30, height: 30 }}>
          <Shield size={15} className="text-accent" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-brand font-bold tracking-widest text-text-primary uppercase"
            style={{ fontSize: 15, letterSpacing: "0.2em" }}>AEGIS</span>
          <span className="font-label text-text-muted uppercase tracking-widest"
            style={{ fontSize: 8 }}>Disaster Response</span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border shrink-0" />

      {/* Threat level badge */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-label font-bold uppercase tracking-widest ${threat.cls}`}
        style={{ fontSize: 10 }}>
        <Activity size={10} strokeWidth={2.5} />
        THREAT: {threat.label}
      </div>

      {/* Live pulse */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-threat-green opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-threat-green" />
        </span>
        <span className="font-data text-threat-green" style={{ fontSize: 10 }}>LIVE</span>
      </div>

      <div className="flex-1" />

      {/* Connection indicator */}
      <div className={`flex items-center gap-1.5 font-data ${connected ? "text-threat-green" : "text-threat-red"}`}
        style={{ fontSize: 10 }}>
        {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
        {connected ? "CONNECTED" : "OFFLINE"}
      </div>

      {/* Simulate button */}
      <button
        onClick={onSimulate}
        disabled={simulating}
        className={`font-label uppercase tracking-widest font-bold px-4 rounded border transition-all
          ${simulating
            ? "border-threat-amber/40 text-threat-amber/40 cursor-not-allowed"
            : "border-threat-amber text-threat-amber hover:bg-threat-amber/10 cursor-pointer"
          }`}
        style={{ fontSize: 10, height: 28 }}
      >
        {simulating ? "SIMULATING…" : "▶ SIMULATE CRISIS"}
      </button>

    </header>
  );
}
