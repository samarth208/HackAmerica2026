// Read DESIGN.md and CLAUDE.md before modifying.

import React, { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import AppShell from "@/components/AppShell";

// ─── Stub factory ─────────────────────────────────────────────────────────────
function stub(name: string) {
  return lazy(() =>
    Promise.resolve({
      default: () => (
        <div className="p-8 text-text-primary font-ui">{name} — coming soon</div>
      ),
    })
  );
}

// ─── Real page implementations ────────────────────────────────────────────────
const DashboardPage          = lazy(() => import("@/pages/DashboardPage"));
const TrainingJobsPage       = lazy(() => import("@/pages/TrainingJobsPage"));
const TrainingRunDetailPage  = lazy(() => import("@/pages/TrainingRunDetailPage"));
const AlertsPage             = lazy(() => import("@/pages/AlertsPage"));
const AlertDetailPage        = lazy(() => import("@/pages/AlertDetailPage"));
const ModelRegistryPage      = lazy(() => import("@/pages/ModelRegistryPage"));
const ModelDetailPage        = lazy(() => import("@/pages/ModelDetailPage"));
const ModelComparisonView    = lazy(() =>
  import("@/features/models/ModelComparisonView").then((m) => ({ default: m.ModelComparisonView }))
);
const AgentChatPage          = lazy(() => import("@/pages/AgentChatPage"));
const InferenceDashboardPage = lazy(() => import("@/pages/InferenceDashboardPage"));
const DataPipelinesPage      = lazy(() => import("@/pages/DataPipelinesPage"));
const PipelineDetailPage     = lazy(() => import("@/pages/PipelineDetailPage"));

// ─── Stubs for pages not yet implemented ──────────────────────────────────────
const SettingsPage           = stub("SettingsPage");

// ─── Router ───────────────────────────────────────────────────────────────────
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/",                           element: <Suspense><DashboardPage /></Suspense> },
      { path: "/training",                   element: <Suspense><TrainingJobsPage /></Suspense> },
      { path: "/training/:runId",            element: <Suspense><TrainingRunDetailPage /></Suspense> },
      { path: "/models",                     element: <Suspense><ModelRegistryPage /></Suspense> },
      { path: "/models/compare",             element: <Suspense><ModelComparisonView /></Suspense> },
      { path: "/models/:modelId",            element: <Suspense><ModelDetailPage /></Suspense> },
      { path: "/inference",                  element: <Suspense><InferenceDashboardPage /></Suspense> },
      { path: "/alerts",                     element: <Suspense><AlertsPage /></Suspense> },
      { path: "/alerts/:alertId",            element: <Suspense><AlertDetailPage /></Suspense> },
      { path: "/data-pipelines",             element: <Suspense><DataPipelinesPage /></Suspense> },
      { path: "/data-pipelines/:pipelineId", element: <Suspense><PipelineDetailPage /></Suspense> },
      { path: "/agent",                      element: <Suspense><AgentChatPage /></Suspense> },
      { path: "/settings",                   element: <Suspense><SettingsPage /></Suspense> },
    ],
  },
]);
