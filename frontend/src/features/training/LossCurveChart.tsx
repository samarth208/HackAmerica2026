// Read DESIGN.md and CLAUDE.md before modifying.

import React, { useMemo } from "react";
import { Download } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  Brush,
} from "recharts";

// mirror of DESIGN.md tokens for recharts — recharts requires actual color values
const COLORS = {
  trainLoss: "#3b82f6",    // token: accent
  valLoss: "#f59e0b",      // token: threat-amber
  checkpoint: "#10b981",   // token: threat-green
  grid: "#1e2d40",         // token: border
  axis: "#64748b",         // token: text-muted
  surface: "#0e1223",      // token: surface
  border: "#1e2d40",       // token: border
} as const;

export type TrainingProgressPoint = {
  step: number;
  trainLoss: number;
  valLoss?: number;
  tokensPerSec: number;
  mfu: number;
  timestamp: string;
};

interface LossCurveChartProps {
  data: TrainingProgressPoint[];
  checkpointSteps?: number[];
  className?: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
}): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 font-data text-xs">
      <p className="text-text-muted mb-1">step {label?.toLocaleString()}</p>
      {payload.map(entry => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value.toFixed(4)}
        </p>
      ))}
    </div>
  );
}

function CustomLegend(): React.ReactElement {
  return (
    <div className="flex items-center gap-4 justify-center mt-1">
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.trainLoss }} />
        <span className="font-label text-xs text-text-muted">Train Loss</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.valLoss }} />
        <span className="font-label text-xs text-text-muted">Val Loss</span>
      </div>
    </div>
  );
}

function BestLabel({ viewBox }: { viewBox?: { x: number; y: number } }): React.ReactElement | null {
  if (!viewBox) return null;
  return (
    <text x={viewBox.x} y={viewBox.y - 8} textAnchor="middle" fill={COLORS.valLoss} fontSize={10} fontFamily="Fira Code">
      Best
    </text>
  );
}

function exportCsv(data: TrainingProgressPoint[]): void {
  const headers = "step,trainLoss,valLoss,tokensPerSec,mfu,timestamp";
  const rows = data.map(d =>
    `${d.step},${d.trainLoss},${d.valLoss ?? ""},${d.tokensPerSec},${d.mfu},${d.timestamp}`
  ).join("\n");
  const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "loss-curve.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function LossCurveChart({ data, checkpointSteps, className }: LossCurveChartProps): React.ReactElement {
  const isLarge = data.length > 10_000;
  // TODO: switch to canvas renderer above 10k points (react-chartjs-2 with canvas) — recharts SVG degrades past this threshold

  const bestValLoss = useMemo(() => {
    const withVal = data.filter(d => d.valLoss != null);
    if (!withVal.length) return null;
    return withVal.reduce((best, d) => (d.valLoss! < best.valLoss! ? d : best));
  }, [data]);

  const defaultBrushStart = Math.max(0, data.length - 1000);

  return (
    <div className={`bg-surface border border-border rounded-lg p-4 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-label text-xs text-text-muted uppercase tracking-wide">Loss Curve</span>
        <button
          onClick={() => exportCsv(data)}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors font-label text-xs"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
          <XAxis
            dataKey="step"
            stroke={COLORS.axis}
            tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: "Fira Code" }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            stroke={COLORS.axis}
            tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: "Fira Code" }}
            tickFormatter={(v: number) => v < 0.01 ? v.toExponential(1) : v.toFixed(3)}
            allowDataKey={true}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />

          {/* Checkpoint reference lines */}
          {(checkpointSteps ?? []).map(step => (
            <ReferenceLine
              key={step}
              x={step}
              stroke={COLORS.checkpoint}
              strokeDasharray="4 2"
              label={{ value: "ckpt", position: "top", fill: COLORS.checkpoint, fontSize: 9, fontFamily: "Fira Code" }}
            />
          ))}

          {/* Best val loss annotation */}
          {bestValLoss && (
            <ReferenceDot
              x={bestValLoss.step}
              y={bestValLoss.valLoss}
              r={4}
              fill={COLORS.valLoss}
              stroke="none"
              label={<BestLabel />}
            />
          )}

          <Line
            type="monotone"
            dataKey="trainLoss"
            stroke={COLORS.trainLoss}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={!isLarge}
            name="Train Loss"
          />
          <Line
            type="monotone"
            dataKey="valLoss"
            stroke={COLORS.valLoss}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={!isLarge}
            name="Val Loss"
          />

          <Brush
            dataKey="step"
            height={24}
            stroke={COLORS.grid}
            fill={COLORS.surface}
            travellerWidth={6}
            startIndex={defaultBrushStart}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
