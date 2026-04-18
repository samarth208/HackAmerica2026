// Read DESIGN.md and CLAUDE.md before modifying.

import { z, ZodSchema } from "zod";
import { fetchWithRetry } from "./fetchWithRetry";
import { ApiError } from "./errors";

// ── NodeHealthFeatures ────────────────────────────────────────────────────────

export const NodeHealthFeaturesSchema: ZodSchema = z.object({
  nodeId: z.string(),
  cpuPct: z.number(),
  memPct: z.number(),
  diskPct: z.number(),
  networkMbps: z.number(),
  timestamp: z.string(),
});

export type NodeHealthFeatures = z.infer<typeof NodeHealthFeaturesSchema>;

// ── ModelPerformanceFeatures ──────────────────────────────────────────────────

export const ModelPerformanceFeaturesSchema: ZodSchema = z.object({
  modelId: z.string(),
  p50LatencyMs: z.number(),
  p95LatencyMs: z.number(),
  p99LatencyMs: z.number(),
  requestsPerSec: z.number(),
  errorRate: z.number(),
  timestamp: z.string(),
});

export type ModelPerformanceFeatures = z.infer<
  typeof ModelPerformanceFeaturesSchema
>;

// ── TrainingRunFeatures ───────────────────────────────────────────────────────

export const TrainingRunFeaturesSchema: ZodSchema = z.object({
  runId: z.string(),
  tokensPerSec: z.number(),
  mfu: z.number(),
  gpuHoursUsed: z.number(),
  timestamp: z.string(),
});

export type TrainingRunFeatures = z.infer<typeof TrainingRunFeaturesSchema>;

// ── API functions ─────────────────────────────────────────────────────────────

export async function getNodeHealthFeatures(
  nodeId: string
): Promise<NodeHealthFeatures> {
  return fetchWithRetry<NodeHealthFeatures>(
    `/api/features/nodes/${nodeId}/health`,
    NodeHealthFeaturesSchema
  );
}

export async function getModelPerformanceFeatures(
  modelId: string
): Promise<ModelPerformanceFeatures> {
  return fetchWithRetry<ModelPerformanceFeatures>(
    `/api/features/models/${modelId}/performance`,
    ModelPerformanceFeaturesSchema
  );
}

export async function getTrainingRunFeatures(
  runId: string
): Promise<TrainingRunFeatures> {
  return fetchWithRetry<TrainingRunFeatures>(
    `/api/features/training-runs/${runId}/features`,
    TrainingRunFeaturesSchema
  );
}

// Re-export ApiError so callers can catch it without a separate import.
export { ApiError };
