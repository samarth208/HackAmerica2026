// Read DESIGN.md and CLAUDE.md before modifying.

import { z } from "zod";
import { fetchWithRetry } from "./fetchWithRetry";
import { ApiError } from "./errors";
import {
  type GpuNode,
  GpuNodeSchema,
  type ClusterOverview,
  ClusterOverviewSchema,
} from "@/types/ontology";

// Re-export imported types so callers can import everything from this module.
export type { GpuNode, ClusterOverview };

// ─── TimeRange ────────────────────────────────────────────────────────────────

export type TimeRange = {
  from: Date;
  to: Date;
};

// ─── GpuTelemetryPoint ────────────────────────────────────────────────────────

export const GpuTelemetryPointSchema = z.object({
  timestamp: z.string(),
  nodeId: z.string(),
  gpuIndex: z.number(),
  utilizationPct: z.number(),
  temperatureC: z.number(),
  vramUsedGb: z.number(),
  powerW: z.number(),
});

export type GpuTelemetryPoint = z.infer<typeof GpuTelemetryPointSchema>;

// ─── TrainingProgressPoint ────────────────────────────────────────────────────

export const TrainingProgressPointSchema = z.object({
  step: z.number(),
  trainLoss: z.number(),
  valLoss: z.number().optional(),
  tokensPerSec: z.number(),
  mfu: z.number(),
  timestamp: z.string(),
});

export type TrainingProgressPoint = z.infer<typeof TrainingProgressPointSchema>;

// ─── InferenceSlaPoint ────────────────────────────────────────────────────────

export const InferenceSlaPointSchema = z.object({
  timestamp: z.string(),
  modelId: z.string(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  errorRate: z.number(),
  requestsPerSec: z.number(),
});

export type InferenceSlaPoint = z.infer<typeof InferenceSlaPointSchema>;

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * GET /api/metrics/gpu-telemetry/{nodeId}?from=ISO&to=ISO
 */
export async function getGpuTelemetry(
  nodeId: string,
  timeRange: TimeRange
): Promise<GpuTelemetryPoint[]> {
  const url = new URL(
    `/api/metrics/gpu-telemetry/${encodeURIComponent(nodeId)}`,
    window.location.origin
  );
  url.searchParams.set("from", timeRange.from.toISOString());
  url.searchParams.set("to", timeRange.to.toISOString());

  return fetchWithRetry(url.toString(), z.array(GpuTelemetryPointSchema));
}

/**
 * GET /api/metrics/cluster/overview
 */
export async function getClusterOverview(): Promise<ClusterOverview> {
  return fetchWithRetry(
    "/api/metrics/cluster/overview",
    ClusterOverviewSchema
  );
}

/**
 * GET /api/metrics/inference-sla/{modelId}?from=ISO&to=ISO
 */
export async function getInferenceSla(
  modelId: string,
  timeRange: TimeRange
): Promise<InferenceSlaPoint[]> {
  const url = new URL(
    `/api/metrics/inference-sla/${encodeURIComponent(modelId)}`,
    window.location.origin
  );
  url.searchParams.set("from", timeRange.from.toISOString());
  url.searchParams.set("to", timeRange.to.toISOString());

  return fetchWithRetry(url.toString(), z.array(InferenceSlaPointSchema));
}

/**
 * GET /api/metrics/training-runs/{runId}/progress
 */
export async function getTrainingProgress(
  runId: string
): Promise<TrainingProgressPoint[]> {
  return fetchWithRetry(
    `/api/metrics/training-runs/${encodeURIComponent(runId)}/progress`,
    z.array(TrainingProgressPointSchema)
  );
}

// Ensure ApiError is importable from this module for callers that handle errors inline.
export { ApiError };
