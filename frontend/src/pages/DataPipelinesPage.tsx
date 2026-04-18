// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import type { Pipeline } from "@/types/ontology";
import { StatusBadge, MetricCard, EmptyState } from "@/components";
import DataTable, { type ColumnDef } from "@/components/DataTable";

export const MOCK_PIPELINES: Pipeline[] = [
  { id: "pl-001", name: "feature-ingestion",    status: "healthy",  lastRunAt: new Date(Date.now() - 1_800_000).toISOString(), nextRunAt: new Date(Date.now() + 1_800_000).toISOString(), upstreamSources: ["raw-events", "user-signals"],        downstreamTargets: ["feature-store"] },
  { id: "pl-002", name: "model-eval-pipeline",  status: "running",  lastRunAt: new Date(Date.now() -   600_000).toISOString(), nextRunAt: new Date(Date.now() + 5_400_000).toISOString(), upstreamSources: ["model-registry"],                    downstreamTargets: ["eval-results", "metrics-db"] },
  { id: "pl-003", name: "alert-aggregator",     status: "degraded", lastRunAt: new Date(Date.now() - 3_600_000).toISOString(), nextRunAt: new Date(Date.now() + 1_200_000).toISOString(), upstreamSources: ["metrics-db", "log-streams"],          downstreamTargets: ["alert-store"] },
  { id: "pl-004", name: "training-data-prep",   status: "healthy",  lastRunAt: new Date(Date.now() - 7_200_000).toISOString(), nextRunAt: new Date(Date.now() + 3_600_000).toISOString(), upstreamSources: ["raw-data-lake", "labels-store"],      downstreamTargets: ["training-dataset"] },
  { id: "pl-005", name: "inference-logging",    status: "healthy",  lastRunAt: new Date(Date.now() -   900_000).toISOString(), nextRunAt: new Date(Date.now() +   900_000).toISOString(), upstreamSources: ["inference-engine"],                   downstreamTargets: ["log-store", "metrics-db"] },
  { id: "pl-006", name: "lineage-tracker",      status: "failed",   lastRunAt: new Date(Date.now() - 10_800_000).toISOString(),                                                            upstreamSources: ["model-registry", "training-dataset"], downstreamTargets: ["lineage-db"] },
  { id: "pl-007", name: "dataset-validator",    status: "healthy",  lastRunAt: new Date(Date.now() - 2_700_000).toISOString(), nextRunAt: new Date(Date.now() + 2_700_000).toISOString(), upstreamSources: ["raw-data-lake"],                      downstreamTargets: ["validated-dataset"] },
  { id: "pl-008", name: "metric-rollup",        status: "running",  lastRunAt: new Date(Date.now() -   300_000).toISOString(), nextRunAt: new Date(Date.now() + 3_300_000).toISOString(), upstreamSources: ["metrics-db"],                         downstreamTargets: ["rollup-store", "dashboard-api"] },
  { id: "pl-009", name: "red-team-runner",      status: "healthy",  lastRunAt: new Date(Date.now() - 14_400_000).toISOString(), nextRunAt: new Date(Date.now() + 7_200_000).toISOString(), upstreamSources: ["model-registry", "red-team-cases"],  downstreamTargets: ["red-team-results"] },
  { id: "pl-010", name: "model-registry-sync",  status: "degraded", lastRunAt: new Date(Date.now() - 5_400_000).toISOString(), nextRunAt: new Date(Date.now() + 1_800_000).toISOString(), upstreamSources: ["model-store"],                        downstreamTargets: ["registry-api", "lineage-db"] },
];

const healthy  = MOCK_PIPELINES.filter(p => p.status === "healthy").length;
const running  = MOCK_PIPELINES.filter(p => p.status === "running").length;
const degraded = MOCK_PIPELINES.filter(p => p.status === "degraded").length;
const failed   = MOCK_PIPELINES.filter(p => p.status === "failed").length;

const COLUMNS: ColumnDef<Pipeline>[] = [
  {
    key: "name",
    header: "Pipeline",
    render: (_, row) => (
      <span className="font-ui text-sm text-accent hover:underline cursor-pointer">{row.name}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (v) => <StatusBadge status={v as string} />,
  },
  {
    key: "lastRunAt",
    header: "Last Run",
    render: (v) => (
      <span className="font-data text-xs text-text-muted">
        {formatDistanceToNow(new Date(v as string), { addSuffix: true })}
      </span>
    ),
  },
  {
    key: "nextRunAt",
    header: "Next Run",
    render: (v) => (
      <span className="font-data text-xs text-text-muted">
        {v ? formatDistanceToNow(new Date(v as string), { addSuffix: true }) : "—"}
      </span>
    ),
  },
  {
    key: "upstreamSources",
    header: "Upstream",
    render: (v) => (
      <span className="bg-bg border border-border rounded px-1.5 py-0.5 font-data text-xs text-text-muted">
        {(v as string[]).length}
      </span>
    ),
  },
  {
    key: "downstreamTargets",
    header: "Downstream",
    render: (v) => (
      <span className="bg-bg border border-border rounded px-1.5 py-0.5 font-data text-xs text-text-muted">
        {(v as string[]).length}
      </span>
    ),
  },
];

export default function DataPipelinesPage(): React.ReactElement {
  const navigate = useNavigate();
  const { data: pipelines = MOCK_PIPELINES } = useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => MOCK_PIPELINES,
    staleTime: Infinity,
  });

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <h1 className="font-label text-xl text-text-primary">Data Pipelines</h1>

      {/* Status summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard data-testid="kpi-healthy"  label="Healthy"  value={healthy}  />
        <MetricCard data-testid="kpi-running"  label="Running"  value={running}  />
        <MetricCard data-testid="kpi-degraded" label="Degraded" value={degraded} />
        <MetricCard data-testid="kpi-failed"   label="Failed"   value={failed}   />
      </div>

      {/* Table */}
      <DataTable
        data={pipelines}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        onRowClick={(row) => navigate("/data-pipelines/" + row.id)}
        pageSize={10}
      />
    </div>
  );
}
