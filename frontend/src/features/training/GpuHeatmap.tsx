// Read DESIGN.md and CLAUDE.md before modifying.

import React from "react";
import type { GpuNode } from "@/types";

interface GpuHeatmapProps {
  nodes: GpuNode[];
  onCellClick: (node: GpuNode) => void;
  className?: string;
}

// Color stops for GPU utilization (0%→100%)
// 0%: hsl(220,15%,18%), 25%: hsl(160,60%,35%), 50%: hsl(45,90%,45%), 75%: hsl(25,90%,50%), 100%: hsl(0,85%,55%)
function interpolateColor(pct: number): string {
  const stops = [
    { at: 0,   h: 220, s: 15, l: 18 },
    { at: 25,  h: 160, s: 60, l: 35 },
    { at: 50,  h: 45,  s: 90, l: 45 },
    { at: 75,  h: 25,  s: 90, l: 50 },
    { at: 100, h: 0,   s: 85, l: 55 },
  ];
  const clamped = Math.max(0, Math.min(100, pct));
  // Find surrounding stops
  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i]!.at && clamped <= stops[i + 1]!.at) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }
  const t = lo.at === hi.at ? 0 : (clamped - lo.at) / (hi.at - lo.at);
  const h = Math.round(lo.h + t * (hi.h - lo.h));
  const s = Math.round(lo.s + t * (hi.s - lo.s));
  const l = Math.round(lo.l + t * (hi.l - lo.l));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export default function GpuHeatmap({ nodes, onCellClick, className }: GpuHeatmapProps) {
  // Build lookup map keyed by "{rowIndex}-{gpuIndex}"
  // rowIndex is the numeric part of nodeId modulo 8; gpuIndex is the column
  const nodeMap = new Map<string, GpuNode>();
  for (const node of nodes) {
    const rowIndex = parseInt(node.nodeId.replace(/\D/g, ""), 10) % 8;
    nodeMap.set(`${rowIndex}-${node.gpuIndex}`, node);
  }

  return (
    <div className={`${className ?? ""}`}>
      {/* Column labels row */}
      <div className="flex items-center mb-1">
        <div className="w-8" /> {/* spacer for row labels */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
          <div key={j} className="w-10 text-center font-data text-xs text-text-muted">
            G{j}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div
        aria-label="GPU utilization heatmap, 8 nodes × 8 GPUs"
        role="grid"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center mb-0.5">
            <div className="w-8 font-data text-xs text-text-muted pr-1 text-right">N{i}</div>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
              const node = nodeMap.get(`${i}-${j}`);
              if (!node) {
                return (
                  <div
                    key={j}
                    className="w-10 h-10 rounded flex items-center justify-center font-data text-xs text-text-muted opacity-30 mx-0.5"
                    // Dynamic color via interpolation — cannot use static Tailwind classes
                    style={{ background: "hsl(220,15%,18%)" }}
                  >
                    –
                  </div>
                );
              }
              return (
                <div
                  key={j}
                  role="gridcell"
                  aria-label={`Node ${i} GPU ${j}: ${node.utilizationPct}% utilization`}
                  title={`Node ${node.nodeId} · GPU ${node.gpuIndex}\n${node.utilizationPct}% util · ${node.temperatureC}°C`}
                  onClick={() => onCellClick(node)}
                  className="w-10 h-10 rounded mx-0.5 cursor-pointer transition-transform duration-200 hover:scale-110 hover:z-10 hover:ring-1 hover:ring-white/20 relative"
                  // Dynamic color via interpolation — cannot use static Tailwind classes
                  style={{ background: interpolateColor(node.utilizationPct) }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3">
        <div
          className="h-2 rounded"
          // Dynamic color via interpolation — cannot use static Tailwind classes
          style={{
            width: 200,
            background:
              "linear-gradient(to right, hsl(220,15%,18%), hsl(160,60%,35%), hsl(45,90%,45%), hsl(25,90%,50%), hsl(0,85%,55%))",
          }}
        />
        <div
          className="flex justify-between font-data text-xs text-text-muted mt-1"
          style={{ width: 200 }}
        >
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
