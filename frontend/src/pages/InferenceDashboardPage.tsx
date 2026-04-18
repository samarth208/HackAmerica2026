// Read DESIGN.md and CLAUDE.md before modifying.

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
  Legend,
} from "recharts";

import { getModels } from "@/api/inference";
import { getInferenceSla } from "@/api/metrics";
import { getModelPerformanceFeatures } from "@/api/featureStore";
import { MetricCard, SkeletonLoader, EmptyState } from "@/components";
import TimeRangePicker from "@/components/TimeRangePicker";

// mirror of DESIGN.md tokens for recharts — recharts requires actual color values
const COLORS = {
  accent:  "#3b82f6",  // token: accent
  amber:   "#f59e0b",  // token: threat-amber
  red:     "#ef4444",  // token: threat-red
  muted:   "#64748b",  // token: text-muted
  grid:    "#1e2d40",  // token: border
  surface: "#0e1223",  // token: surface
} as const;

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function SlaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 font-data text-xs">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map(e => (
        <p key={e.name} style={{ color: e.color }}>
          {e.name}: {e.value.toFixed(1)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function InferenceDashboardPage(): React.ReactElement {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 86_400_000),
    to: new Date(),
  });
  const [slaTimeValue, setSlaTimeValue] = useState<
    "1h" | "6h" | "24h" | "7d" | "30d" | "custom"
  >("24h");

  // ── Queries ────────────────────────────────────────────────────────────────

  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });

  // Auto-select first model once loaded
  useEffect(() => {
    if (
      modelsQuery.data &&
      modelsQuery.data.length > 0 &&
      selectedModelId === null
    ) {
      setSelectedModelId(modelsQuery.data[0]!.id);
    }
  }, [modelsQuery.data, selectedModelId]);

  const slaQuery = useQuery({
    queryKey: [
      "inference-sla",
      selectedModelId,
      timeRange.from.toISOString(),
      timeRange.to.toISOString(),
    ],
    queryFn: () => getInferenceSla(selectedModelId!, timeRange),
    enabled: !!selectedModelId,
    refetchInterval: 30_000,
  });

  const perfQuery = useQuery({
    queryKey: ["model-perf", selectedModelId],
    queryFn: () => getModelPerformanceFeatures(selectedModelId!),
    enabled: !!selectedModelId,
    refetchInterval: 15_000,
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleTimeRangeChange(
    val: "1h" | "6h" | "24h" | "7d" | "30d" | "custom",
    custom?: { from: Date; to: Date }
  ): void {
    setSlaTimeValue(val);
    if (val === "custom" && custom) {
      setTimeRange(custom);
      return;
    }
    const msMap: Record<string, number> = {
      "1h":  3_600_000,
      "6h":  21_600_000,
      "24h": 86_400_000,
      "7d":  604_800_000,
      "30d": 2_592_000_000,
    };
    const ms = msMap[val] ?? 86_400_000;
    setTimeRange({ from: new Date(Date.now() - ms), to: new Date() });
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const slaChartData = (slaQuery.data ?? []).map(pt => ({
    time: format(new Date(pt.timestamp), "HH:mm"),
    p50:  pt.p50Ms,
    p95:  pt.p95Ms,
    p99:  pt.p99Ms,
    rps:  pt.requestsPerSec,
    err:  pt.errorRate,
  }));

  const errorRate = perfQuery.data?.errorRate ?? 0;
  const errorRateHigh = errorRate > 0.01; // >1%

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="font-label text-xl text-text-primary flex-1">
          Inference Dashboard
        </h1>

        {/* Model selector */}
        <select
          value={selectedModelId ?? ""}
          onChange={e => setSelectedModelId(e.target.value || null)}
          disabled={modelsQuery.isLoading}
          className="bg-bg border border-border text-text-primary font-ui text-sm rounded px-3 py-1.5 outline-none focus:border-accent disabled:opacity-50"
        >
          {modelsQuery.isLoading && (
            <option value="">Loading models…</option>
          )}
          {(modelsQuery.data ?? []).map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <TimeRangePicker value={slaTimeValue} onChange={handleTimeRangeChange} />
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        {perfQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))
        ) : (
          <>
            <MetricCard
              label="p50 Latency"
              value={perfQuery.data?.p50LatencyMs?.toFixed(0) ?? "—"}
              unit="ms"
            />
            <MetricCard
              label="p95 Latency"
              value={perfQuery.data?.p95LatencyMs?.toFixed(0) ?? "—"}
              unit="ms"
            />
            <MetricCard
              label="p99 Latency"
              value={perfQuery.data?.p99LatencyMs?.toFixed(0) ?? "—"}
              unit="ms"
            />
            {errorRateHigh ? (
              <MetricCard
                label="Error Rate"
                value={
                  perfQuery.data?.errorRate != null
                    ? (perfQuery.data.errorRate * 100).toFixed(2)
                    : "—"
                }
                unit="%"
                className="bg-threat-red/5 border-threat-red/20"
              />
            ) : (
              <MetricCard
                label="Error Rate"
                value={
                  perfQuery.data?.errorRate != null
                    ? (perfQuery.data.errorRate * 100).toFixed(2)
                    : "—"
                }
                unit="%"
              />
            )}
            <MetricCard
              label="Req/sec"
              value={perfQuery.data?.requestsPerSec?.toFixed(1) ?? "—"}
            />
          </>
        )}
      </div>

      {/* ── SLA latency chart ─────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-4">
          Latency Percentiles Over Time
        </p>
        {slaQuery.isLoading ? (
          <div className="h-[280px] bg-bg rounded animate-pulse" />
        ) : slaChartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center">
            <EmptyState
              icon={Activity}
              title="No data for selected range"
              description="Try a wider time range"
            />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={slaChartData}
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="time"
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
              />
              <YAxis
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
                unit="ms"
              />
              <Tooltip content={<SlaTooltip />} />
              <Legend
                wrapperStyle={{
                  fontFamily: "Lato",
                  fontSize: 11,
                  color: COLORS.muted,
                }}
              />
              <ReferenceLine
                y={500}
                stroke={COLORS.red}
                strokeDasharray="4 4"
                label={{
                  value: "SLA 500ms",
                  position: "insideTopRight",
                  fill: COLORS.muted,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={COLORS.accent}
                strokeWidth={1.5}
                dot={false}
                name="p50"
              />
              <Line
                type="monotone"
                dataKey="p95"
                stroke={COLORS.amber}
                strokeWidth={1.5}
                dot={false}
                name="p95"
              />
              <Line
                type="monotone"
                dataKey="p99"
                stroke={COLORS.red}
                strokeWidth={1.5}
                dot={false}
                name="p99"
              />
              <Brush
                height={20}
                stroke={COLORS.grid}
                fill={COLORS.surface}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Bottom row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left — RPS chart */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-3">
            Requests per Second
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={slaChartData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={COLORS.accent}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="95%"
                    stopColor={COLORS.accent}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="time"
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
              />
              <YAxis
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.grid}`,
                  fontFamily: "Fira Code",
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="rps"
                stroke={COLORS.accent}
                fill="url(#rpsGrad)"
                strokeWidth={2}
                dot={false}
                name="req/s"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right — Error rate chart */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-3">
            Error Rate (%)
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={slaChartData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={COLORS.red}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="95%"
                    stopColor={COLORS.red}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="time"
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
              />
              <YAxis
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.grid}`,
                  fontFamily: "Fira Code",
                  fontSize: 11,
                }}
              />
              <ReferenceLine
                y={1}
                stroke={COLORS.amber}
                strokeDasharray="3 3"
                label={{ value: "1% threshold", fontSize: 10, fill: COLORS.muted }}
              />
              <Area
                type="monotone"
                dataKey="err"
                stroke={COLORS.red}
                fill="url(#errGrad)"
                strokeWidth={2}
                dot={false}
                name="error %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
