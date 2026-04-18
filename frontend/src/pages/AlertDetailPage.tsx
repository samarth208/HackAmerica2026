// Read DESIGN.md and CLAUDE.md before modifying.

import React from "react";
import { useParams } from "react-router-dom";
import AlertDetailContent from "@/features/alerts/AlertDetailContent";

export default function AlertDetailPage(): React.ReactElement {
  const { alertId } = useParams<{ alertId: string }>();

  return (
    <div className="h-full bg-bg">
      <AlertDetailContent alertId={alertId!} />
    </div>
  );
}
