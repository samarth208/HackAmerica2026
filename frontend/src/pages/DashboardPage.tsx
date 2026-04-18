// Read DESIGN.md and CLAUDE.md before modifying.
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AlertOctagon, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { getClusterOverview, getGpuTelemetry } from "@/api/metrics";
import { MetricCard } from "@/components";

// mirror of DESIGN.md tokens for recharts — recharts requires actual color values
const COLORS = {
  accent:  "#3b82f6",  // token: accent
  amber:   "#f59e0b",  // token: threat-amber
  red:     "#ef4444",  // token: threat-red
  green:   "#10b981",  // token: threat-green
  muted:   "#64748b",  // token: text-muted
  grid:    "#1e2d40",  // token: border
  surface: "#0e1223",  // token: surface
} as const;

const SYSTEMS = [
  { name: "API Gateway",      healthy: true },
  { name: "Feature Store",    healthy: true },
  { name: "Inference Engine", healthy: true },
  { name: "Training Cluster", healthy: true },
] as const;

export default function DashboardPage(): React.ReactElement {
  const navigate = useNavigate();

  const clusterQuery = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: getClusterOverview,
    refetchInterval: 30_000,
  });

  const gpuQuery = useQuery({
    queryKey: ["gpu-overview"],
    queryFn: () =>
      getGpuTelemetry("cluster", {
        from: new Date(Date.now() - 3_600_000),
        to: new Date(),
      }),
    refetchInterval: 60_000,
  });

  function refetchAll(): void {
    void clusterQuery.refetch();
    void gpuQuery.refetch();
  }

  const gpuSparkline: number[] = useMemo(() => {
    const data = gpuQuery.data ?? [];
    if (!data.length) return [];
    const buckets = new Map<string, number[]>();
    for (const pt of data) {
      const ts = pt.timestamp;
      if (!buckets.has(ts)) buckets.set(ts, []);
      buckets.get(ts)!.push(pt.utilizationPct);
    }
    const sorted = Array.from(buckets.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return sorted
      .slice(-20)
      .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [gpuQuery.data]);

  const gpuChartData = useMemo(() => {
    const data = gpuQuery.data ?? [];
    const buckets = new Map<string, number[]>();
    for (const pt of data) {
      if (!buckets.has(pt.timestamp)) buckets.set(pt.timestamp, []);
      buckets.get(pt.timestamp)!.push(pt.utilizationPct);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ts, vals]) => ({
        time: format(new Date(ts), "HH:mm"),
        util: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      }));
  }, [gpuQuery.data]);

  const p1Count = clusterQuery.data?.alertCounts.p1 ?? 0;

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ROW 1 — P1 alert banner */}
      {p1Count > 0 && (
        <div className="bg-threat-red/10 border border-threat-red/30 rounded-xl p-4 flex items-center gap-4">
          <AlertOctagon size={20} className="text-threat-red animate-pulse shrink-0" />
          <span className="font-label text-sm text-threat-red uppercase tracking-wide">
            {p1Count} P1 ALERT{p1Count > 1 ? "S" : ""} REQUIRE IMMEDIATE ATTENTION
          </span>
          <button
            onClick={() => navigate("/alerts")}
            className="ml-auto bg-threat-red text-white text-xs px-3 py-1.5 rounded font-ui hover:bg-threat-red/80 transition-colors shrink-0"
          >
            View Alerts →
          </button>
        </div>
      )}

      {/* ROW 2 — Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-label text-xl text-text-primary">Operations Dashboard</h1>
          <p className="font-data text-xs text-text-muted mt-0.5">
            Last updated {formatDistanceToNow(new Date(), { addSuffix: true })}
          </p>
        </div>
        <button
          onClick={refetchAll}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors font-label text-xs"
        >
          <RefreshCw size={13} className={clusterQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ROW 3 — KPI cards */}
      <div className="grid grid-cols-5 gap-4">
        {clusterQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface border border-border rounded-lg animate-pulse" />
          ))
        ) : (
          <>
            <MetricCard
              data-testid="kpi-p1-alerts"
              label="P1 Alerts"
              value={clusterQuery.data?.alertCounts.p1 ?? "—"}
              className={p1Count > 0 ? "bg-threat-red/5 border-threat-red/20" : undefined}
            />
            <MetricCard
              data-testid="kpi-p2-alerts"
              label="P2 Alerts"
              value={clusterQuery.data?.alertCounts.p2 ?? "—"}
            />
            <MetricCard
              data-testid="kpi-gpu-util"
              label="GPU Util"
              value={(clusterQuery.data?.avgGpuUtilization ?? 0).toFixed(1)}
              unit="%"
              sparkline={gpuSparkline}
            />
            <MetricCard
              data-testid="kpi-active-runs"
              label="Active Runs"
              value={clusterQuery.data?.activeTrainingRuns ?? "—"}
            />
            <MetricCard
              data-testid="kpi-cluster"
              label="Cluster"
              value={clusterQuery.data ? "Healthy" : "Unknown"}
              trend="neutral"
            />
          </>
        )}
      </div>

      {/* ROW 4 — GPU chart full width */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="font-label text-xs text-text-muted uppercase tracking-wide mb-3">
          GPU Cluster Utilization
        </p>
        {gpuQuery.isLoading ? (
          <div className="h-[200px] bg-bg rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={gpuChartData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="time"
                stroke={COLORS.muted}
                tick={{ fill: COLORS.muted, fontSize: 10, fontFamily: "Fira Code" }}
              />
              <YAxis
                domain={[0, 100]}
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
              <Area
                type="monotone"
                dataKey="util"
                stroke={COLORS.accent}
                fill="url(#gpuGrad)"
                strokeWidth={2}
                dot={false}
                name="GPU Util %"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ROW 5 — Bottom 3-column */}
      <div className="grid grid-cols-3 gap-6">
        {/* Col 1 — Training summary */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="font-label text-sm text-text-muted uppercase tracking-wide">
            Training Jobs
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="font-data text-2xl text-accent">
                {clusterQuery.data?.activeTrainingRuns ?? 0}
              </p>
              <p className="font-label text-xs text-text-muted">Running</p>
            </div>
            <div className="text-center">
              <p className="font-data text-2xl text-threat-amber">0</p>
              <p className="font-label text-xs text-text-muted">Queued</p>
            </div>
            <div className="text-center">
              <p className="font-data text-2xl text-threat-red">0</p>
              <p className="font-label text-xs text-text-muted">Failed</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/training")}
            className="text-accent text-xs font-ui mt-3 hover:underline block"
          >
            View Training →
          </button>
        </div>

        {/* Col 2 — Models summary */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="font-label text-sm text-text-muted uppercase tracking-wide">
            Models
          </p>
          <p className="font-data text-3xl text-accent mt-2">2</p>
          <p className="font-label text-xs text-text-muted">in production</p>
          <p className="font-data text-sm text-threat-amber mt-1">Staging: 3</p>
          <button
            onClick={() => navigate("/models")}
            className="text-accent text-xs font-ui mt-3 hover:underline block"
          >
            View Models →
          </button>
        </div>

        {/* Col 3 — System health */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-2">
            System Health
          </p>
          <div className="space-y-1">
            {SYSTEMS.map((sys) => (
              <div key={sys.name} className="flex items-center gap-2 py-1.5">
                {sys.healthy ? (
                  <CheckCircle2 size={14} className="text-threat-green shrink-0" />
                ) : (
                  <XCircle size={14} className="text-threat-red shrink-0" />
                )}
                <span className="font-ui text-sm text-text-primary flex-1">
                  {sys.name}
                </span>
                <span
                  className={`font-data text-xs ${
                    sys.healthy ? "text-threat-green" : "text-threat-red"
                  }`}
                >
                  {sys.healthy ? "healthy" : "degraded"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
