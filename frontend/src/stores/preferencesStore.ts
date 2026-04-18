// Read DESIGN.md and CLAUDE.md before modifying.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreferencesState {
  defaultTimeRange: "1h" | "6h" | "24h" | "7d" | "30d";
  defaultModelId: string | null;
  sidebarCollapsed: boolean;
  tablePageSize: 25 | 50 | 100;
  setDefaultTimeRange: (range: "1h" | "6h" | "24h" | "7d" | "30d") => void;
  setDefaultModelId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTablePageSize: (size: 25 | 50 | 100) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultTimeRange: "24h",
      defaultModelId: null,
      sidebarCollapsed: false,
      tablePageSize: 25,

      setDefaultTimeRange: (range: "1h" | "6h" | "24h" | "7d" | "30d"): void => {
        set({ defaultTimeRange: range });
      },

      setDefaultModelId: (id: string | null): void => {
        set({ defaultModelId: id });
      },

      toggleSidebar: (): void => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (v: boolean): void => {
        set({ sidebarCollapsed: v });
      },

      setTablePageSize: (size: 25 | 50 | 100): void => {
        set({ tablePageSize: size });
      },
    }),
    { name: "aegis-prefs" }
  )
);
