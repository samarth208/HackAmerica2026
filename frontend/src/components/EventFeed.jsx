// Read DESIGN.md before modifying.
import { useRef, useState } from "react";

const CAT_CONFIG = {
  fire:    { color: "var(--color-threat-orange)", dot: "#f97316" },
  seismic: { color: "var(--color-threat-red)",    dot: "#ef4444" },
  crew:    { color: "var(--color-threat-green)",  dot: "#22c55e" },
  system:  { color: "var(--color-text-muted)",    dot: "#64748b" },
};

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "--:--:--";
  }
}

function FeedEntry({ entry }) {
  const cfg = CAT_CONFIG[entry.category] ?? CAT_CONFIG.system;
  return (
    <div className="flex gap-2.5 py-2 border-b border-border/50 last:border-0 group">
      <div className="mt-1.5 shrink-0 rounded-full" style={{ width: 5, height: 5, background: cfg.dot }} />
      <div className="flex-1 min-w-0">
        <p className="font-ui text-text-primary leading-snug" style={{ fontSize: 12 }}>
          {entry.description ?? entry.message}
        </p>
        <span className="font-data text-text-muted" style={{ fontSize: 10 }}>
          {formatTime(entry.timestamp ?? entry.created_at)}
        </span>
      </div>
    </div>
  );
}

const SEED = [{
  id: "__seed__", category: "system",
  description: "AEGIS online — awaiting hazard data",
  timestamp: new Date().toISOString(),
}];

export default function EventFeed({ eventLog = [] }) {
  const scrollRef = useRef(null);
  const source = eventLog.length === 0 ? SEED : eventLog;
  const visible = [...source].sort((a, b) => new Date(b.timestamp ?? 0) - new Date(a.timestamp ?? 0)).slice(0, 100);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="font-label font-semibold uppercase tracking-widest text-accent" style={{ fontSize: 10 }}>
          Event Feed
        </span>
        <span className="font-data text-text-muted" style={{ fontSize: 10 }}>{visible.length} entries</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-1">
        {visible.map((e, i) => <FeedEntry key={e.id ?? i} entry={e} />)}
      </div>
    </div>
  );
}
