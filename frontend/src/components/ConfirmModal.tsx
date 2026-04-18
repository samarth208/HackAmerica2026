// Read DESIGN.md and CLAUDE.md before modifying.

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  consequences?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequences,
  confirmLabel,
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus the panel when it opens
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (!panelRef.current) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.closest('[aria-hidden="true"]'));

        if (focusable.length === 0) return;

        const first: HTMLElement = focusable[0]!;
        const last: HTMLElement = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            document.activeElement === panelRef.current
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            document.activeElement === panelRef.current
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function handleBackdropMouseDown(e: MouseEvent) {
      // Only close if the mousedown target is the backdrop itself, not the panel
      if (e.target === backdropRef.current) {
        onClose();
      }
    }

    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    panel?.addEventListener("keydown", handleKeyDown);
    backdrop?.addEventListener("mousedown", handleBackdropMouseDown);

    return () => {
      panel?.removeEventListener("keydown", handleKeyDown);
      backdrop?.removeEventListener("mousedown", handleBackdropMouseDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-label text-lg text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50 shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        <p className="font-ui text-sm text-text-muted mt-2">{description}</p>

        {consequences && (
          <div className="bg-threat-red/10 border border-threat-red/20 rounded p-3 mt-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-threat-red shrink-0 mt-0.5" />
            <p className="text-threat-red text-sm font-ui">{consequences}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="border border-border text-text-muted hover:text-text-primary rounded px-4 py-2 font-ui text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded px-4 py-2 font-ui text-sm text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
              danger
                ? "bg-threat-red hover:bg-threat-red/80"
                : "bg-accent hover:bg-accent/80"
            }`}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              (confirmLabel ?? "Confirm")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
