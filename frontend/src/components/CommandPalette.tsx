// Read DESIGN.md and CLAUDE.md before modifying.
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  LayoutDashboard,
  Brain,
  Database,
  Zap,
  Bell,
  GitBranch,
  MessageSquare,
  Settings,
  AlertOctagon,
  type LucideIcon,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface RecentAction {
  label: string;
  path: string;
  timestamp: number;
}

const NAV_ROUTES = [
  { label: "Dashboard",      path: "/",               icon: LayoutDashboard },
  { label: "Training Jobs",  path: "/training",       icon: Brain },
  { label: "Model Registry", path: "/models",         icon: Database },
  { label: "Inference",      path: "/inference",      icon: Zap },
  { label: "Alerts",         path: "/alerts",         icon: Bell },
  { label: "Pipelines",      path: "/data-pipelines", icon: GitBranch },
  { label: "Agent Chat",     path: "/agent",          icon: MessageSquare },
  { label: "Settings",       path: "/settings",       icon: Settings },
] as const;

function loadRecentActions(): RecentAction[] {
  try {
    const raw = localStorage.getItem("aegis-recent-actions");
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentAction[]).slice(0, 5);
  } catch {
    return [];
  }
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);

  // Load recents on mount
  useEffect(() => {
    setRecentActions(loadRecentActions());
  }, []);

  // Reset state and focus when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setRecentActions(loadRecentActions());
      // Defer focus so the element is visible
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Reset selectedIndex when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const filteredRoutes = useMemo(
    () =>
      NAV_ROUTES.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  // displayRoutes: filtered when querying, full list when empty
  const displayRoutes = query ? filteredRoutes : NAV_ROUTES;

  // allItems in keyboard-navigation order: recents (when empty) then routes
  const allItems: Array<{ label: string; path: string }> = useMemo(() => {
    if (query) {
      return filteredRoutes.map((r) => ({ label: r.label, path: r.path }));
    }
    return [
      ...recentActions.map((r) => ({ label: r.label, path: r.path })),
      ...NAV_ROUTES.map((r) => ({ label: r.label, path: r.path })),
    ];
  }, [query, filteredRoutes, recentActions]);

  const selectItem = useCallback(
    (path: string, label: string): void => {
      const recent: RecentAction = { label, path, timestamp: Date.now() };
      const existing = recentActions.filter((r) => r.path !== path);
      const updated = [recent, ...existing].slice(0, 5);
      localStorage.setItem("aegis-recent-actions", JSON.stringify(updated));
      setRecentActions(updated);
      navigate(path);
      onClose();
    },
    [navigate, onClose, recentActions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const item = allItems[selectedIndex];
          if (item) {
            selectItem(item.path, item.label);
          }
          break;
        }
        case "Escape":
          onClose();
          break;
      }
    },
    [allItems, selectedIndex, selectItem, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search routes, alerts, models…"
            className="flex-1 bg-transparent text-text-primary font-ui text-base outline-none placeholder:text-text-muted"
          />
          <kbd className="bg-bg border border-border text-text-muted text-xs px-1.5 py-0.5 rounded font-data">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {/* Recent actions section — only when query is empty and recents exist */}
          {!query && recentActions.length > 0 && (
            <>
              <p className="font-label text-xs text-text-muted uppercase px-3 pt-3 pb-1">
                Recent
              </p>
              {recentActions.map((item, i) => {
                const globalIndex = i;
                const isSelected = selectedIndex === globalIndex;
                return (
                  <div
                    key={item.path + item.timestamp}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                      isSelected ? "bg-accent/10" : "hover:bg-accent/10"
                    }`}
                    onClick={() => selectItem(item.path, item.label)}
                  >
                    <AlertOctagon size={16} className="text-text-muted" />
                    <span className="font-ui text-sm text-text-primary flex-1">
                      {item.label}
                    </span>
                    <span className="font-data text-xs text-text-muted">
                      {item.path}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {/* Routes section */}
          <p className="font-label text-xs text-text-muted uppercase px-3 pt-3 pb-1">
            {query ? "Results" : "Routes"}
          </p>
          {displayRoutes.map((route, i) => {
            const globalIndex = (!query ? recentActions.length : 0) + i;
            const isSelected = selectedIndex === globalIndex;
            const Icon = route.icon as LucideIcon;
            return (
              <div
                key={route.path}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                  isSelected ? "bg-accent/10" : "hover:bg-accent/10"
                }`}
                onClick={() => selectItem(route.path, route.label)}
              >
                <Icon size={16} className="text-text-muted" />
                <span className="font-ui text-sm text-text-primary flex-1">
                  {route.label}
                </span>
                <span className="font-data text-xs text-text-muted">
                  {route.path}
                </span>
              </div>
            );
          })}

          {query && filteredRoutes.length === 0 && (
            <p className="text-center font-ui text-sm text-text-muted py-8">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2 flex gap-4 text-xs font-label text-text-muted">
          <span>↑↓ navigate</span>
          <span>↩ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
