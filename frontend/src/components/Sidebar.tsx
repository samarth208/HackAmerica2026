// Read DESIGN.md and CLAUDE.md before modifying.
import React, { useEffect } from "react";
import { useLocation, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Brain,
  Database,
  Zap,
  Bell,
  GitBranch,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useClusterStore } from "@/stores/clusterStore";
import {
  useNotificationsStore,
  selectUnreadCount,
} from "@/stores/notificationsStore";
import { usePreferencesStore } from "@/stores/preferencesStore";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/" },
  { icon: Brain,           label: "Training",  to: "/training" },
  { icon: Database,        label: "Models",    to: "/models" },
  { icon: Zap,             label: "Inference", to: "/inference" },
  { icon: Bell,            label: "Alerts",    to: "/alerts" },
  { icon: GitBranch,       label: "Pipelines", to: "/data-pipelines" },
  { icon: MessageSquare,   label: "Agent",     to: "/agent" },
  { icon: Settings,        label: "Settings",  to: "/settings" },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

export default function Sidebar(): React.ReactElement {
  const collapsed = usePreferencesStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePreferencesStore((s) => s.toggleSidebar);
  const clusterHealth = useClusterStore((s) => s.clusterHealth);
  const alertCounts = useClusterStore((s) => s.alertCounts);
  const startPolling = useClusterStore((s) => s.startPolling);
  const unreadCount = useNotificationsStore(selectUnreadCount);
  const { pathname } = useLocation();

  useEffect(() => {
    const stop = startPolling();
    return stop;
  }, [startPolling]);

  const healthDotColor =
    clusterHealth === "critical"
      ? "bg-threat-red"
      : clusterHealth === "degraded"
      ? "bg-threat-amber"
      : clusterHealth === "healthy"
      ? "bg-threat-green"
      : "bg-text-muted";

  const healthTextColor =
    clusterHealth === "critical"
      ? "text-threat-red"
      : clusterHealth === "degraded"
      ? "text-threat-amber"
      : clusterHealth === "healthy"
      ? "text-threat-green"
      : "text-text-muted";

  const healthLabel =
    clusterHealth === "critical"
      ? `P1: ${alertCounts.p1}`
      : clusterHealth === "degraded"
      ? `P2: ${alertCounts.p2}`
      : clusterHealth === "healthy"
      ? "All clear"
      : "Unknown";

  const badgeLabel = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <aside
      className={`flex flex-col h-full bg-surface border-r border-border transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* Brand header */}
      <div
        className={`flex items-center gap-2 px-3 py-4 border-b border-border ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        {/* Icon placeholder */}
        <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center shrink-0">
          <span className="text-accent font-data text-xs font-bold">A</span>
        </div>
        {!collapsed && (
          <span className="font-ui font-semibold text-text-primary text-sm tracking-wide">
            AEGIS
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item: NavItem) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.to);
          const isBell = item.to === "/alerts";

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`relative flex items-center gap-3 py-2 rounded transition-colors font-label text-sm
                ${collapsed ? "justify-center px-0 mx-0" : "px-3 mx-2"}
                ${
                  active
                    ? "bg-accent/10 text-accent border-l-2 border-accent"
                    : "text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
                }
                my-0.5
              `}
            >
              <span className="relative shrink-0">
                <Icon size={18} />
                {isBell && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-threat-red text-bg flex items-center justify-center font-data text-[9px] leading-none px-0.5">
                    {badgeLabel}
                  </span>
                )}
              </span>
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Cluster health badge */}
      <div
        className={`border-t border-border py-2 ${
          collapsed ? "flex justify-center px-0" : "px-3"
        }`}
      >
        {collapsed ? (
          <span
            className={`w-2 h-2 rounded-full inline-block ${healthDotColor}`}
            title={healthLabel}
          />
        ) : (
          <div className="flex items-center">
            <span
              className={`w-2 h-2 rounded-full inline-block mr-2 shrink-0 ${healthDotColor}`}
            />
            <span className={`font-data text-xs ${healthTextColor}`}>
              {healthLabel}
            </span>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-border pt-2 pb-2">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center py-1.5 text-text-muted hover:text-text-primary hover:bg-surface transition-colors rounded"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
