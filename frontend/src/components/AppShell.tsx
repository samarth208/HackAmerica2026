// Read DESIGN.md and CLAUDE.md before modifying.
import React, {
  useEffect,
  useState,
  useCallback,
  Suspense,
} from "react";
import { Outlet, useMatches } from "react-router-dom";
import { Bell } from "lucide-react";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { useClusterStore } from "@/stores/clusterStore";
import {
  useNotificationsStore,
  selectUnreadCount,
} from "@/stores/notificationsStore";

function SkeletonLoader(): React.ReactElement {
  return (
    <div className="p-6 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-8 bg-surface rounded animate-pulse w-full" />
      ))}
    </div>
  );
}

export default function AppShell(): React.ReactElement {
  const clusterHealth = useClusterStore((s) => s.clusterHealth);
  const unreadCount = useNotificationsStore(selectUnreadCount);

  const [cmdOpen, setCmdOpen] = useState<boolean>(false);

  // Start cluster polling on mount
  useEffect(() => {
    const stopPolling = useClusterStore.getState().startPolling();
    return stopPolling;
  }, []);

  // Global ⌘K / Ctrl+K listener
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Breadcrumbs
  const matches = useMatches();
  const breadcrumbs: string[] = React.useMemo((): string[] => {
    if (!matches.length) return ["Dashboard"];
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch) return ["Dashboard"];
    const segments = lastMatch.pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1));
    if (!segments.length) return ["Dashboard"];
    return segments;
  }, [matches]);

  // Cluster health dot styling
  const healthDotClass =
    clusterHealth === "critical"
      ? "bg-threat-red animate-pulse"
      : clusterHealth === "degraded"
      ? "bg-threat-amber"
      : clusterHealth === "healthy"
      ? "bg-threat-green"
      : "bg-text-muted";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* TopBar */}
        <header className="h-topbar bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
          {/* LEFT: breadcrumbs */}
          <nav className="flex items-center">
            {breadcrumbs.map((segment, index) => (
              <React.Fragment key={segment + index}>
                {index > 0 && (
                  <span className="text-text-muted mx-1">/</span>
                )}
                <span
                  className={`font-label text-sm ${
                    index === breadcrumbs.length - 1
                      ? "text-text-primary"
                      : "text-text-muted"
                  }`}
                >
                  {segment}
                </span>
              </React.Fragment>
            ))}
          </nav>

          {/* CENTER: cluster status dot */}
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${healthDotClass}`} />
            <span className="font-label text-xs text-text-muted capitalize">
              {clusterHealth}
            </span>
          </div>

          {/* RIGHT: bell + avatar */}
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <Bell
                size={18}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-threat-red text-white rounded-full text-xs w-4 h-4 flex items-center justify-center font-data">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>

            {/* User avatar */}
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-label text-xs text-white font-medium">
              AI
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-bg">
          <Suspense fallback={<SkeletonLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
