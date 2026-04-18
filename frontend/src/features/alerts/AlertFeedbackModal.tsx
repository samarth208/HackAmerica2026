// Read DESIGN.md and CLAUDE.md before modifying.
import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AlertFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  alertId: string;
  analysisId: string;
}

const ISSUES = [
  "Root cause is incorrect",
  "Recommended actions are not applicable",
  "Missing important context",
  "Analysis is too generic",
  "Other",
] as const;
type Issue = typeof ISSUES[number];

export default function AlertFeedbackModal({
  open,
  onClose,
}: AlertFeedbackModalProps): React.ReactElement | null {
  const [selected, setSelected] = useState<Set<Issue>>(new Set());
  const [otherText, setOtherText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setOtherText("");
    }
  }, [open]);

  async function handleSubmit(): Promise<void> {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 200));
    setLoading(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="font-label text-base text-text-primary">Help us improve</h2>
        <p className="font-ui text-sm text-text-muted mt-1">What was wrong with this analysis?</p>

        <div className="flex flex-col gap-3 mt-4">
          {ISSUES.map(issue => (
            <label key={issue} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(issue)}
                onChange={() => {
                  setSelected(prev => {
                    const next = new Set(prev);
                    next.has(issue) ? next.delete(issue) : next.add(issue);
                    return next;
                  });
                }}
                className="mt-0.5 accent-accent"
              />
              <span className="font-ui text-sm text-text-primary">{issue}</span>
            </label>
          ))}
        </div>

        {selected.has("Other") && (
          <textarea
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            placeholder="Tell us more…"
            rows={3}
            className="mt-3 w-full bg-bg border border-border text-text-primary font-ui text-sm rounded p-2 outline-none focus:border-accent resize-none"
          />
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="border border-border text-text-muted hover:text-text-primary rounded px-4 py-2 font-ui text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={loading || selected.size === 0}
            className="bg-accent hover:bg-accent/80 text-white rounded px-4 py-2 font-ui text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
