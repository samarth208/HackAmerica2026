// Read DESIGN.md and CLAUDE.md before modifying.
import React from "react";
import { AlertOctagon } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertOctagon size={48} className="text-threat-red" />
        <p className="font-label text-lg text-text-primary">
          Something went wrong
        </p>
        <p className="font-data text-sm text-text-muted max-w-md text-center">
          {this.state.error?.message ?? "An unexpected error occurred"}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-accent hover:bg-accent/80 text-white rounded px-4 py-2 font-ui text-sm transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => {
            const subject = encodeURIComponent("AEGIS Error Report");
            const body = encodeURIComponent(
              `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack}`
            );
            window.location.href = `mailto:support@aegis.internal?subject=${subject}&body=${body}`;
          }}
          className="border border-border text-text-muted hover:text-text-primary rounded px-4 py-2 font-ui text-sm transition-colors"
        >
          Report issue
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
