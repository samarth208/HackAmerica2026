// Read DESIGN.md and CLAUDE.md before modifying.
import { RefreshCw, Bell, User } from "lucide-react";

const TABS = [
  { key: "hotspots",  label: "Hotspots"  },
  { key: "crews",     label: "Crews"     },
  { key: "damage",    label: "Damage"    },
  { key: "shelters",  label: "Shelters"  },
  { key: "hospitals", label: "Hospitals" },
];

// ─── NavTab ───────────────────────────────────────────────────────────────────
function NavTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`font-label uppercase tracking-widest text-xs font-medium px-3 py-1 relative transition-colors focus:outline-none ${
        active ? "text-text-primary" : "text-text-muted"
      }`}
      style={{ background: "transparent", border: "none", cursor: "pointer", paddingBottom: 4 }}
      data-testid={`nav-tab-${label.toLowerCase()}`}
      data-active={active}
    >
      {label}
      {active && (
        <span
          className="absolute bottom-0 left-3 right-3 bg-threat-orange rounded-sm"
          style={{ height: 2 }}
        />
      )}
    </button>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
export default function TopBar({ activeTab = "damage", onTabChange }) {
  return (
    <div className="h-topbar w-full bg-surface border-b border-border flex items-center px-4 shrink-0 gap-4">

      {/* Brand */}
      <span className="font-brand font-bold tracking-widest uppercase text-text-primary shrink-0"
        style={{ fontSize: 17 }}>
        AEGIS
      </span>

      {/* Tab Nav */}
      <div className="flex items-center gap-1 ml-2">
        {TABS.map(({ key, label }) => (
          <NavTab
            key={key}
            label={label}
            active={activeTab === key}
            onClick={() => onTabChange?.(key)}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Right icon buttons */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center justify-center rounded text-text-muted border border-border transition-colors hover:text-text-primary"
          style={{ width: 28, height: 28, background: "transparent", cursor: "pointer" }}
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
        <button
          className="flex items-center justify-center rounded text-text-muted border border-border transition-colors hover:text-text-primary"
          style={{ width: 28, height: 28, background: "transparent", cursor: "pointer" }}
          title="Notifications"
        >
          <Bell size={13} />
        </button>
        <button
          className="flex items-center justify-center rounded-full bg-threat-red text-white"
          style={{ width: 28, height: 28, border: "none", cursor: "pointer" }}
          title="Profile"
        >
          <User size={13} />
        </button>
      </div>
    </div>
  );
}
