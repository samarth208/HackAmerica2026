// Read DESIGN.md before modifying.
import { useState, useEffect } from "react";

function Counter({ label, value, highlight }) {
  return (
    <div className="flex items-center gap-2 px-3 border-r border-border last:border-0">
      <span className="font-label text-text-muted uppercase tracking-wider" style={{ fontSize: 9 }}>{label}</span>
      <span className={`font-data font-semibold ${highlight ?? "text-text-primary"}`} style={{ fontSize: 12 }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function StatusBar() {
  const [counters, setCounters] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/counters").then((r) => r.json()).then(setCounters).catch(() => {});
    load();
    const id = setInterval(() => { load(); setTick((t) => t + 1); }, 8000);
    return () => clearInterval(id);
  }, []);

  const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="w-full bg-surface border-t border-border flex items-center shrink-0 overflow-x-auto"
      style={{ height: 28 }}>
      <Counter label="Hotspots"    value={counters?.hotspots}        highlight="text-threat-orange" />
      <Counter label="Seismic"     value={counters?.seismic_events}  highlight="text-threat-red"    />
      <Counter label="Damage Zones" value={counters?.damage_zones}   highlight="text-threat-red"    />
      <Counter label="Actions"     value={counters?.pending_actions} highlight="text-threat-amber"  />
      <Counter label="Crews"       value={counters?.crews}           highlight="text-threat-green"  />
      <div className="flex-1" />
      <div className="px-3 flex items-center gap-1.5">
        <span className="font-label text-text-muted uppercase tracking-wider" style={{ fontSize: 9 }}>UTC</span>
        <span className="font-data text-text-muted" style={{ fontSize: 10 }}>{now}</span>
      </div>
    </div>
  );
}
