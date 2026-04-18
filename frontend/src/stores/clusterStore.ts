// Read DESIGN.md and CLAUDE.md before modifying.
import { create } from "zustand";
import { getClusterOverview } from "@/api/metrics";
import type { ClusterOverview } from "@/types";

interface ClusterState {
  clusterHealth: "healthy" | "degraded" | "critical" | "unknown";
  alertCounts: { p1: number; p2: number; p3: number; p4: number };
  activeTrainingRuns: number;
  avgGpuUtilization: number;
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
  refreshClusterHealth: () => Promise<void>;
  startPolling: () => () => void;
}

function deriveClusterHealth(
  alertCounts: ClusterOverview["alertCounts"]
): ClusterState["clusterHealth"] {
  if (alertCounts.p1 > 0) return "critical";
  if (alertCounts.p2 > 0) return "degraded";
  return "healthy";
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusterHealth: "unknown",
  alertCounts: { p1: 0, p2: 0, p3: 0, p4: 0 },
  activeTrainingRuns: 0,
  avgGpuUtilization: 0,
  lastUpdated: null,
  isLoading: false,
  error: null,

  refreshClusterHealth: async (): Promise<void> => {
    set({ isLoading: true });
    try {
      const overview: ClusterOverview = await getClusterOverview();
      set({
        clusterHealth: deriveClusterHealth(overview.alertCounts),
        alertCounts: overview.alertCounts,
        activeTrainingRuns: overview.activeTrainingRuns,
        avgGpuUtilization: overview.avgGpuUtilization,
        lastUpdated: new Date(),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        error: message,
        isLoading: false,
        clusterHealth: "unknown",
      });
    }
  },

  startPolling: (): (() => void) => {
    void get().refreshClusterHealth();
    const intervalId = setInterval((): void => {
      void get().refreshClusterHealth();
    }, 30000);
    return (): void => clearInterval(intervalId);
  },
}));
