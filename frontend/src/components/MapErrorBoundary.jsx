// Read DESIGN.md and CLAUDE.md before modifying.
import { Component } from "react";

export default class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[MapErrorBoundary] Leaflet render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-bg">
          <span className="text-text-muted font-data text-xs uppercase tracking-widest">
            Map error — check console
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
