// Read DESIGN.md and CLAUDE.md before modifying.

import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Attachment = {
  type: "alert" | "model";
  id: string;
  label: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContextAttachmentPickerProps {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContextAttachmentPicker({
  attachments,
  onChange,
}: ContextAttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  function removeAttachment(type: Attachment["type"], id: string) {
    onChange(attachments.filter((a) => !(a.type === type && a.id === id)));
  }

  return (
    <div className="relative inline-block" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-label text-text-muted transition-colors hover:border-accent/30 hover:text-text-primary"
        aria-label="Attach context"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {attachments.length > 0 ? (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent/20 px-1 font-data text-[10px] text-accent">
            {attachments.length}
          </span>
        ) : (
          <span>+ Context</span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-border bg-bg shadow-lg">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border p-2.5">
              {attachments.map((att) => (
                <span
                  key={`${att.type}-${att.id}`}
                  className="flex max-w-full items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-label text-accent"
                >
                  <span className="truncate">{att.label}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.type, att.id)}
                    className="ml-0.5 shrink-0 text-accent hover:text-text-primary"
                    aria-label={`Remove ${att.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="px-3 py-4 text-center">
            <p className="text-xs font-label text-text-muted">
              No context sources available.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
