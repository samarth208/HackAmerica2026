// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      {Icon && <Icon size={40} className="text-text-muted" />}
      <p className="text-base font-label text-text-primary">{title}</p>
      {description && (
        <p className="text-sm font-ui text-text-muted max-w-xs text-center">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="bg-accent hover:bg-accent/80 text-white rounded px-4 py-2 text-sm font-ui transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
