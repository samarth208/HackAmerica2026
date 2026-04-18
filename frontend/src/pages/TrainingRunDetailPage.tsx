// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { Activity } from "lucide-react";

export default function TrainingRunDetailPage(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Activity size={40} className="text-text-muted mx-auto mb-3" />
        <p className="font-label text-base text-text-primary">Training run details unavailable</p>
        <p className="font-ui text-sm text-text-muted mt-1">
          ML training platform is not configured.
        </p>
      </div>
    </div>
  );
}
