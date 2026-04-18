// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { GitBranch, HardDrive, Database } from "lucide-react";
import { ReactFlow, Background, Controls, type Node, type Edge, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Pipeline } from "@/types/ontology";
import { StatusBadge, EmptyState } from "@/components";
import DataTable, { type ColumnDef } from "@/components/DataTable";
import { MOCK_PIPELINES } from "./DataPipelinesPage";

// mirror of DESIGN.md tokens for recharts — recharts requires actual color values
const COLORS = {
  accent:  "#3b82f6",  // token: accent
  grid:    "#1e2d40",  // token: border
  surface: "#0e1223",  // token: surface
} as const;

type RunRow = { id: string; status: string; started: string; duration: string; records: string };

function buildMockRuns(pipelineId: string): RunRow[] {
  return Array.from({ length: 10 }, (_, i) => {
    const isRunning = i === 0;
    const isFailed  = i === 2;
    const status = isRunning ? "running" : isFailed ? "failed" : "completed";
    const startedMs = Date.now() - (i + 1) * 3_600_000;
    const durationSec = 30 + (i * 47) % 450;
    const records = 1000 + (i * 7919) % 499_000;
    return {
      id: `${pipelineId}-run-${String(i + 1).padStart(3, "0")}`,
      status,
      started: new Date(startedMs).toISOString(),
      duration: isRunning ? "in progress" : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`,
      records: isRunning ? "—" : records.toLocaleString(),
    };
  });
}

const RUN_COLS: ColumnDef<RunRow>[] = [
  { key: "id",       header: "Run ID",   render: (v) => <span className="font-data text-xs text-text-muted">{v as string}</span> },
  { key: "status",   header: "Status",   render: (v) => <StatusBadge status={v as string} /> },
  { key: "started",  header: "Started",  render: (v) => <span className="font-data text-xs text-text-muted">{formatDistanceToNow(new Date(v as string), { addSuffix: true })}</span> },
  { key: "duration", header: "Duration", render: (v) => <span className="font-data text-xs text-text-data">{v as string}</span> },
  { key: "records",  header: "Records",  render: (v) => <span className="font-data text-xs text-text-data">{v as string}</span> },
];

const NODE_STYLE: React.CSSProperties = {
  background: "#0e1223",
  border: "1px solid #1e2d40",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#f0f4f8",
  fontFamily: "Lato",
  fontSize: 11,
  minWidth: 120,
};

function buildLineageGraph(pipeline: Pipeline): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const yStep = 80;
  const centerY = Math.max(pipeline.upstreamSources.length, pipeline.downstreamTargets.length) * yStep / 2;

  // Upstream source nodes
  pipeline.upstreamSources.forEach((src, i) => {
    nodes.push({
      id: `up-${i}`,
      position: { x: 0, y: i * yStep },
      data: { label: <><HardDrive size={11} style={{ display: "inline", marginRight: 4 }} />{src}</> },
      style: { ...NODE_STYLE, border: "1px solid rgba(59,130,246,0.4)" },
    });
    edges.push({ id: `e-up-${i}`, source: `up-${i}`, target: "center", style: { stroke: COLORS.accent, strokeWidth: 1.5 }, animated: true });
  });

  // Center pipeline node
  nodes.push({
    id: "center",
    position: { x: 220, y: centerY - 20 },
    data: { label: <><GitBranch size={11} style={{ display: "inline", marginRight: 4 }} />{pipeline.name}</> },
    style: { ...NODE_STYLE, border: "1px solid #3b82f6" },
  });

  // Downstream target nodes
  pipeline.downstreamTargets.forEach((tgt, i) => {
    nodes.push({
      id: `down-${i}`,
      position: { x: 440, y: i * yStep },
      data: { label: <><Database size={11} style={{ display: "inline", marginRight: 4 }} />{tgt}</> },
      style: { ...NODE_STYLE, border: "1px solid rgba(16,185,129,0.4)" },
    });
    edges.push({ id: `e-down-${i}`, source: "center", target: `down-${i}`, style: { stroke: COLORS.accent, strokeWidth: 1.5 }, animated: true });
  });

  return { nodes, edges };
}

export default function PipelineDetailPage(): React.ReactElement {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const navigate = useNavigate();

  const pipeline = MOCK_PIPELINES.find(p => p.id === pipelineId);

  if (!pipeline) {
    return (
      <div className="p-6">
        <EmptyState
          icon={GitBranch}
          title="Pipeline not found"
          description={`No pipeline with id "${pipelineId}"`}
          action={{ label: "Back", onClick: () => navigate(-1) }}
        />
      </div>
    );
  }

  const runs = buildMockRuns(pipeline.id);
  const lineage = buildLineageGraph(pipeline);

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header card */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-label text-xl text-text-primary">{pipeline.name}</h1>
          <StatusBadge status={pipeline.status} />
        </div>
        <p className="font-data text-xs text-text-muted">
          Last run: {formatDistanceToNow(new Date(pipeline.lastRunAt), { addSuffix: true })}
          {pipeline.nextRunAt && ` · Next run: ${formatDistanceToNow(new Date(pipeline.nextRunAt), { addSuffix: true })}`}
        </p>
      </div>

      {/* Run History */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-4">Run History</p>
        <DataTable data={runs} columns={RUN_COLS} rowKey={(r) => r.id} pageSize={10} />
      </div>

      {/* Lineage diagram */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <p className="font-label text-sm text-text-muted uppercase tracking-wide mb-4">Data Lineage</p>
        <div className="h-[260px] bg-bg rounded-xl border border-border overflow-hidden">
          <ReactFlow nodes={lineage.nodes} edges={lineage.edges} fitView nodesDraggable>
            <Background variant={BackgroundVariant.Dots} color="#1e2d40" />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
