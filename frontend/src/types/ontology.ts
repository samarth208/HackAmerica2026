// Read DESIGN.md and CLAUDE.md before modifying.

import { z } from "zod";

// ─── Alert ────────────────────────────────────────────────────────────────────

export const AlertSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["P1", "P2", "P3", "P4"]),
  status: z.enum(["open", "acknowledged", "resolved"]),
  source: z.string(),
  linkedNodeId: z.string().optional(),
  linkedIncidentId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  message: z.string(),
});

export type Alert = z.infer<typeof AlertSchema>;

// ─── ModelVersion ─────────────────────────────────────────────────────────────

export const ModelVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  status: z.enum(["staging", "production", "archived", "training"]),
  architecture: z.string(),
  paramCount: z.number(),
  datasetVersion: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  evalScores: z.object({
    mmlu: z.number().optional(),
    hellaswag: z.number().optional(),
    gsm8k: z.number().optional(),
    domainSpecific: z.number().optional(),
    toolCallAccuracy: z.number().optional(),
  }),
});

export type ModelVersion = z.infer<typeof ModelVersionSchema>;

// ─── TrainingRun ──────────────────────────────────────────────────────────────

export const TrainingRunSchema = z.object({
  id: z.string(),
  modelArchitecture: z.string(),
  status: z.enum(["running", "completed", "failed", "queued"]),
  gpuCount: z.number(),
  maxSteps: z.number(),
  currentStep: z.number(),
  currentLoss: z.number().optional(),
  valLoss: z.number().optional(),
  learningRate: z.number(),
  runName: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  datasetVersion: z.string(),
});

export type TrainingRun = z.infer<typeof TrainingRunSchema>;

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export const PipelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["healthy", "degraded", "failed", "running"]),
  lastRunAt: z.string(),
  nextRunAt: z.string().optional(),
  upstreamSources: z.array(z.string()),
  downstreamTargets: z.array(z.string()),
});

export type Pipeline = z.infer<typeof PipelineSchema>;

// ─── GpuNode ──────────────────────────────────────────────────────────────────

export const GpuNodeSchema = z.object({
  nodeId: z.string(),
  gpuIndex: z.number(),
  utilizationPct: z.number(),
  temperatureC: z.number(),
  vramUsedGb: z.number(),
  vramTotalGb: z.number(),
  powerW: z.number(),
});

export type GpuNode = z.infer<typeof GpuNodeSchema>;

// ─── ClusterOverview ──────────────────────────────────────────────────────────

export const ClusterOverviewSchema = z.object({
  totalNodes: z.number(),
  healthyNodes: z.number(),
  activeTrainingRuns: z.number(),
  alertCounts: z.object({
    p1: z.number(),
    p2: z.number(),
    p3: z.number(),
    p4: z.number(),
  }),
  avgGpuUtilization: z.number(),
});

export type ClusterOverview = z.infer<typeof ClusterOverviewSchema>;
