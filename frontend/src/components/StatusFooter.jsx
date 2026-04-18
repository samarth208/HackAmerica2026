// Read DESIGN.md and CLAUDE.md before modifying.

// ─── StatusFooter ─────────────────────────────────────────────────────────────
export default function StatusFooter() {
  return (
    <div
      className="w-full flex items-center justify-between shrink-0 px-4 bg-bg border-t border-border"
      style={{ height: 24 }}
      data-testid="status-footer"
    >
      {/* Left: product name */}
      <div className="flex items-center gap-2">
        <span className="font-data text-xs uppercase tracking-wider text-text-muted">
          AEGIS Disaster Intel
        </span>
        <span className="font-data text-xs text-threat-amber">
          V4.0.2-ALERT_MODE
        </span>
      </div>

      {/* Right: system stats */}
      <div className="flex items-center gap-4">
        <span className="font-data text-xs text-text-muted">
          System Status:{" "}
          <span className="text-threat-amber">Degraded</span>
        </span>
        <span className="font-data text-xs text-text-muted">Latency: 124ms</span>
        <span className="font-data text-xs text-text-muted">Encryption: AES-256</span>
      </div>
    </div>
  );
}
