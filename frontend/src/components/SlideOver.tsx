// Read DESIGN.md and CLAUDE.md before modifying.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}

const WIDTH_MAP: Record<NonNullable<SlideOverProps["width"]>, string> = {
  sm: "320px",
  md: "480px",
  lg: "640px",
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function SlideOver({
  open,
  onClose,
  title,
  children,
  width = "md",
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const widthPx = WIDTH_MAP[width];

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
          if (document.activeElement === first || document.activeElement === panelRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || document.activeElement === panelRef.current) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    const panel = panelRef.current;
    panel?.addEventListener("keydown", handleKeyDown);
    return () => panel?.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{ width: widthPx }}
        className={`fixed top-0 right-0 h-full z-50 bg-surface border-l border-border flex flex-col transition-transform duration-300 ease-in-out outline-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="h-topbar flex items-center justify-between px-4 border-b border-border shrink-0">
          <span className="font-label text-text-primary">{title}</span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}
