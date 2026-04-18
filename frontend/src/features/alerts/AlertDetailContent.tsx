// Read DESIGN.md and CLAUDE.md before modifying.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  AlertOctagon,
  Server,
  Play,
} from "lucide-react";
import { getNodeHealthFeatures } from "@/api/featureStore";
import { chat } from "@/api/inference";
import type { ChatMessage } from "@/api/inference";
import { StatusBadge, EmptyState, ConfirmModal } from "@/components";
import AlertFeedbackModal from "./AlertFeedbackModal";

type AnalysisState = "idle" | "loading" | "streaming" | "complete" | "error";

// ─── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ pct }: { pct: number }): React.ReactElement {
  const color =
    pct >= 70
      ? "bg-threat-green"
      : pct >= 40
      ? "bg-threat-amber"
      : "bg-threat-red";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-data text-xs text-text-muted">{pct}%</span>
    </div>
  );
}

// ─── Analysis text renderer ────────────────────────────────────────────────────
function AnalysisRenderer({
  text,
  alertId,
  onExecuteAction,
}: {
  text: string;
  alertId: string;
  onExecuteAction: (action: string) => void;
}): React.ReactElement {
  // Extract confidence percentage
  const confMatch = text.match(/(\d{1,3})%/);
  const confidence = confMatch ? parseInt(confMatch[1]!, 10) : null;

  // Split into lines for rendering
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Bold headers (**text**)
        if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
          return (
            <p key={i} className="font-label text-xs text-text-muted uppercase tracking-wide mt-3 first:mt-0">
              {trimmed.replace(/\*\*/g, "")}
            </p>
          );
        }

        // Confidence line
        if (confidence !== null && trimmed.includes(`${confidence}%`)) {
          return (
            <div key={i}>
              <p className="font-ui text-sm text-text-primary">{trimmed}</p>
              <ConfidenceBar pct={confidence} />
            </div>
          );
        }

        // Numbered action items
        const actionMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (actionMatch) {
          const actionText = actionMatch[2]!;
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="font-data text-xs text-text-muted mt-0.5 shrink-0">
                {actionMatch[1]}.
              </span>
              <p className="font-ui text-sm text-text-primary flex-1">{actionText}</p>
              <button
                onClick={() => onExecuteAction(actionText)}
                className="shrink-0 flex items-center gap-1 bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 rounded px-2 py-1 font-ui text-xs transition-colors"
              >
                <Play size={10} /> Execute
              </button>
            </div>
          );
        }

        // Bullet points
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return (
            <p key={i} className="font-ui text-sm text-text-primary pl-3 before:content-['·'] before:mr-2 before:text-text-muted">
              {trimmed.slice(2)}
            </p>
          );
        }

        // Default paragraph
        return (
          <p key={i} className="font-ui text-sm text-text-primary">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
interface AlertDetailContentProps {
  alertId: string;
}

export default function AlertDetailContent({
  alertId,
}: AlertDetailContentProps): React.ReactElement {
  const alertQuery = useQuery({
    queryKey: ["alert", alertId],
    queryFn: (): Promise<never> => Promise.reject(new Error("Alerts unavailable")),
    retry: false,
  });

  const alert = alertQuery.data;

  const featuresQuery = useQuery({
    queryKey: ["alert-features", alertId, alert?.linkedNodeId],
    queryFn: () => getNodeHealthFeatures(alert!.linkedNodeId!),
    enabled: !!alert?.linkedNodeId,
  });

  // ─── AI Analysis state ───────────────────────────────────────────────────────
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [executeActionText, setExecuteActionText] = useState<string | null>(null);
  const [execConfirmOpen, setExecConfirmOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const startAnalysis = useCallback(async (): Promise<void> => {
    if (!alert) return;

    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalysisState("loading");
    setAnalysisText("");
    setFeedback(null);
    const newId = crypto.randomUUID();
    setAnalysisId(newId);

    const systemMsg: ChatMessage = {
      role: "system",
      content: `You are an operations AI analyst. Analyze this alert and provide:
1. Root cause hypothesis (2-3 sentences)
2. Confidence percentage
3. Evidence (bullet points)
4. Recommended actions (numbered, each actionable)
5. Note any similar past incident patterns
Format your response in these exact sections.`,
    };

    const contextData = {
      alert,
      nodeFeatures: featuresQuery.data ?? null,
    };

    const userMsg: ChatMessage = {
      role: "user",
      content: `Alert context:\n${JSON.stringify(contextData, null, 2)}\n\nPlease analyze this alert.`,
    };

    try {
      const generator = chat([systemMsg, userMsg], "default", controller.signal);
      let first = true;
      for await (const token of generator) {
        if (controller.signal.aborted) break;
        if (first) {
          setAnalysisState("streaming");
          first = false;
        }
        setAnalysisText((prev) => prev + token);
      }
      if (!controller.signal.aborted) {
        setAnalysisState("complete");
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("[AlertDetailContent] Analysis failed:", err);
        setAnalysisState("error");
      }
    }
  }, [alert, featuresQuery.data]);

  // Auto-start analysis when alert loads
  useEffect(() => {
    if (alert && analysisState === "idle") {
      void startAnalysis();
    }
  }, [alert, analysisState, startAnalysis]);

  // Reset when alertId changes
  useEffect(() => {
    setAnalysisState("idle");
    setAnalysisText("");
    setFeedback(null);
    abortControllerRef.current?.abort();
  }, [alertId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function handleFeedbackUp(): void {
    setFeedback("up");
  }

  function handleFeedbackDown(): void {
    setFeedback("down");
    setFeedbackModalOpen(true);
  }

  function handleExecuteAction(): void {
    setExecConfirmOpen(false);
    setExecuteActionText(null);
  }

  // ─── Loading / error ─────────────────────────────────────────────────────────
  if (alertQuery.isLoading) {
    return (
      <div className="p-5 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-surface rounded animate-pulse w-full" />
        ))}
      </div>
    );
  }

  if (alertQuery.isError || !alert) {
    return (
      <div className="h-full flex items-center justify-center p-5">
        <EmptyState
          icon={AlertOctagon}
          title="Failed to load alert"
          description={
            alertQuery.error instanceof Error
              ? alertQuery.error.message
              : "Unknown error"
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-5">
      {/* SECTION 1 — Alert metadata */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="font-label text-base text-text-primary mb-3">{alert.title}</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge status={alert.severity} />
          <span className="font-data text-xs text-text-muted">{alert.source}</span>
          <StatusBadge status={alert.status} />
        </div>
        <p className="font-data text-xs text-text-muted">
          Created {format(new Date(alert.createdAt), "MMM d, HH:mm")} ·{" "}
          Updated {formatDistanceToNow(new Date(alert.updatedAt), { addSuffix: true })}
        </p>
        {alert.message && (
          <p className="font-ui text-sm text-text-muted mt-2 border-t border-border pt-2">
            {alert.message}
          </p>
        )}
        {alert.linkedNodeId && (
          <div className="mt-2 flex items-center gap-1">
            <Server size={12} className="text-text-muted" />
            <span className="font-data text-xs text-accent">
              Node {alert.linkedNodeId}
            </span>
          </div>
        )}
      </div>

      {/* SECTION 2 — AI Analysis */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label text-xs text-text-muted uppercase tracking-wide">
            AI Analysis
          </span>
          <button
            data-testid="regenerate-analysis"
            onClick={() => {
              setAnalysisState("idle");
              void startAnalysis();
            }}
            disabled={analysisState === "loading" || analysisState === "streaming"}
            className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-40 font-label text-xs"
          >
            <RefreshCw
              size={12}
              className={analysisState === "loading" || analysisState === "streaming" ? "animate-spin" : ""}
            />
            Regenerate
          </button>
        </div>

        {analysisState === "loading" && (
          <div className="space-y-2">
            <div className="h-4 bg-bg rounded animate-pulse w-full" />
            <div className="h-4 bg-bg rounded animate-pulse w-4/5" />
            <div className="h-4 bg-bg rounded animate-pulse w-3/5" />
            <p className="font-ui text-sm text-text-muted mt-2">Analyzing alert…</p>
          </div>
        )}

        {(analysisState === "streaming" || analysisState === "complete") && (
          <>
            <AnalysisRenderer
              text={analysisText}
              alertId={alertId}
              onExecuteAction={(action) => {
                setExecuteActionText(action);
                setExecConfirmOpen(true);
              }}
            />

            {/* Streaming cursor */}
            {analysisState === "streaming" && (
              <span className="inline-block w-1 h-4 bg-accent animate-pulse ml-0.5 rounded-sm" />
            )}

            {/* Feedback row */}
            {analysisState === "complete" && (
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
                <span className="font-ui text-xs text-text-muted">Was this helpful?</span>
                <button
                  onClick={handleFeedbackUp}
                  className={`transition-colors ${feedback === "up" ? "text-threat-green" : "text-text-muted hover:text-threat-green"}`}
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={handleFeedbackDown}
                  className={`transition-colors ${feedback === "down" ? "text-threat-red" : "text-text-muted hover:text-threat-red"}`}
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </>
        )}

        {analysisState === "error" && (
          <EmptyState
            icon={AlertOctagon}
            title="Analysis failed"
            description="Could not analyze this alert"
            action={{ label: "Try again", onClick: () => void startAnalysis() }}
          />
        )}
      </div>

      {/* SECTION 3 — Related objects */}
      {(alert.linkedNodeId || alert.linkedIncidentId) && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="font-label text-xs text-text-muted uppercase tracking-wide mb-3">
            Related Objects
          </p>
          <div className="flex flex-wrap gap-2">
            {alert.linkedNodeId && (
              <div className="flex items-center gap-1.5 bg-bg border border-border rounded px-2 py-1">
                <Server size={12} className="text-text-muted" />
                <span className="font-data text-xs text-text-primary">
                  Node {alert.linkedNodeId}
                </span>
                <span className="font-label text-xs text-text-muted ml-1">
                  {/* TODO: link to node page */}
                </span>
              </div>
            )}
            {alert.linkedIncidentId && (
              <div className="flex items-center gap-1.5 bg-bg border border-border rounded px-2 py-1">
                <AlertOctagon size={12} className="text-text-muted" />
                <span className="font-data text-xs text-text-primary">
                  Incident {alert.linkedIncidentId}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execute action confirm */}
      <ConfirmModal
        open={execConfirmOpen}
        onClose={() => { setExecConfirmOpen(false); setExecuteActionText(null); }}
        onConfirm={handleExecuteAction}
        title="Execute Recommended Action"
        description={executeActionText ?? ""}
        confirmLabel="Execute"
      />

      {/* Feedback modal */}
      <AlertFeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        alertId={alertId}
        analysisId={analysisId}
      />
    </div>
  );
}
