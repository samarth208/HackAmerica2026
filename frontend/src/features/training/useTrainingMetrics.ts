// Read DESIGN.md and CLAUDE.md before modifying.
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTrainingProgress } from "@/api/metrics";
import type { TrainingProgressPoint } from "@/types";

export type ConnectionStatus = "connecting" | "live" | "paused" | "error";
export type TrendDirection = "improving" | "stalling" | "diverging";

export interface TrainingMetricsResult {
  metrics: TrainingProgressPoint[];
  connectionStatus: ConnectionStatus;
  latestStep: number;
  isLive: boolean;
  rollingAvgLoss: number | null;
  trend: TrendDirection | null;
  eta: Date | null;
}

export function useTrainingMetrics(runId: string): TrainingMetricsResult {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [wsEvents, setWsEvents] = useState<TrainingProgressPoint[]>([]);

  const query = useQuery({
    queryKey: ["training-progress", runId],
    queryFn: () => getTrainingProgress(runId),
    refetchInterval: connectionStatus === "live" ? false : 10_000,
    staleTime: 8_000,
  });

  useEffect(() => {
    setConnectionStatus("paused");
    setWsEvents([]);
  }, [runId]);

  const metrics = useMemo<TrainingProgressPoint[]>(() => {
    const historical = query.data ?? [];
    const combined = [...historical];

    for (const wsPoint of wsEvents) {
      const idx = combined.findIndex((p) => p.step === wsPoint.step);
      if (idx >= 0) {
        combined[idx] = wsPoint;
      } else {
        combined.push(wsPoint);
      }
    }

    return combined.sort((a, b) => a.step - b.step);
  }, [query.data, wsEvents]);

  const rollingAvgLoss = useMemo<number | null>(() => {
    if (metrics.length < 5) return null;
    const last100 = metrics.slice(-100);
    const sum = last100.reduce((acc, p) => acc + p.trainLoss, 0);
    return sum / last100.length;
  }, [metrics]);

  const trend = useMemo<TrendDirection | null>(() => {
    if (metrics.length < 10) return null;
    const last50 = metrics.slice(-50);
    const n = last50.length;
    const sumX = last50.reduce((acc, _, i) => acc + i, 0);
    const sumY = last50.reduce((acc, p) => acc + p.trainLoss, 0);
    const sumXY = last50.reduce((acc, p, i) => acc + i * p.trainLoss, 0);
    const sumX2 = last50.reduce((acc, _, i) => acc + i * i, 0);
    const slope =
      (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope < -0.001) return "improving";
    if (slope > 0.001) return "diverging";
    return "stalling";
  }, [metrics]);

  const eta = useMemo<Date | null>(() => {
    if (metrics.length < 10) return null;
    const last10 = metrics.slice(-10);
    const latest = last10[last10.length - 1];
    if (!latest) return null;
    const avgTps =
      last10.reduce((acc, p) => acc + p.tokensPerSec, 0) / last10.length;
    if (avgTps <= 0) return null;
    const first = last10[0];
    if (!first) return null;
    const elapsed =
      (new Date(latest.timestamp).getTime() -
        new Date(first.timestamp).getTime()) /
      1000;
    if (elapsed <= 0) return null;
    const stepsPerSec = (latest.step - first.step) / elapsed;
    if (stepsPerSec <= 0) return null;
    // maxSteps not available in this hook; caller provides it if needed
    return null;
  }, [metrics]);

  return {
    metrics,
    connectionStatus,
    latestStep: metrics.at(-1)?.step ?? 0,
    isLive: connectionStatus === "live",
    rollingAvgLoss,
    trend,
    eta,
  };
}
