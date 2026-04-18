// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

function getStatusClasses(status: string): string {
  switch (status) {
    case "running":
    case "healthy":
      return "text-threat-green bg-threat-green/10 border-threat-green/30";
    case "queued":
    case "staging":
      return "text-threat-amber bg-threat-amber/10 border-threat-amber/30";
    case "warning":
    case "degraded":
      return "text-threat-orange bg-threat-orange/10 border-threat-orange/30";
    case "failed":
    case "critical":
    case "P1":
      return "text-threat-red bg-threat-red/10 border-threat-red/30";
    case "extreme":
    case "P0":
      return "text-threat-purple bg-threat-purple/10 border-threat-purple/30";
    case "completed":
    case "P4":
    default:
      return "text-text-muted bg-surface border-border";
  }
}

export default function StatusBadge({
  status,
  size = "md",
}: StatusBadgeProps): React.ReactElement {
  const colorClasses = getStatusClasses(status);
  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-px" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`border rounded-full font-label uppercase tracking-wide font-semibold inline-flex items-center ${colorClasses} ${sizeClasses}`}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block mr-1" />
      )}
      {status}
    </span>
  );
}
