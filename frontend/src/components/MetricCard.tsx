// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  sparkline?: number[];
}

function TrendIcon({ trend }: { trend: "up" | "down" | "neutral" }): React.ReactElement {
  if (trend === "up") {
    return <TrendingUp size={14} className="text-threat-green" />;
  }
  if (trend === "down") {
    return <TrendingDown size={14} className="text-threat-red" />;
  }
  return <Minus size={14} className="text-text-muted" />;
}

function Sparkline({ values }: { values: number[] }): React.ReactElement {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 80;
    const y = 24 - ((v - min) / range) * 24;
    return `${x},${y}`;
  });

  return (
    <svg width={80} height={24} className="mt-2 block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-accent"
      />
    </svg>
  );
}

export default function MetricCard({
  label,
  value,
  unit,
  trend,
  sparkline,
  className,
  ...rest
}: MetricCardProps): React.ReactElement {
  return (
    <div className={`bg-surface border border-border rounded-lg p-4 ${className ?? ""}`} {...rest}>
      <p className="text-xs font-label text-text-muted uppercase tracking-wide mb-2">
        {label}
      </p>
      <div className="flex items-end gap-1">
        <span className="text-xl font-data text-text-data">{value}</span>
        {unit && (
          <span className="text-xs font-label text-text-muted mb-1">{unit}</span>
        )}
        {trend && (
          <span className="ml-auto mb-1">
            <TrendIcon trend={trend} />
          </span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
    </div>
  );
}
