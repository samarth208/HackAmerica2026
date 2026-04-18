// Read DESIGN.md and CLAUDE.md before modifying.
// Tests the disconnected banner rendered inline in App.jsx.
// The banner appears when useWebSocket returns connected=false.

import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "../App";
import useWebSocket from "../hooks/useWebSocket";
import { wsConnectedMock, wsDisconnectedMock } from "./fixtures/stateFixtures";

// ─── Mock useWebSocket ────────────────────────────────────────────────────────
// Wrap in vi.fn() so per-test overrides via mockReturnValue work.
// Default to connected so most tests start from a clean baseline.
vi.mock("../hooks/useWebSocket", () => ({ default: vi.fn(() => wsConnectedMock) }));

// ─── Mock child components ────────────────────────────────────────────────────
vi.mock("../components/TopBar", () => ({
  default: () => <div data-testid="top-bar" />,
}));

vi.mock("../components/MapPanel", () => ({
  default: () => <div data-testid="map-panel" />,
}));

vi.mock("../components/ActionQueue", () => ({
  default: () => <div data-testid="action-queue" />,
}));

vi.mock("../components/EventFeed", () => ({
  default: () => <div data-testid="event-feed" />,
}));

vi.mock("../components/LayerControls", () => ({
  default: () => <div data-testid="layer-controls" />,
}));

// ─── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  // Reset to connected by default before each test
  vi.mocked(useWebSocket).mockReturnValue(wsConnectedMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DisconnectBanner", () => {
  it("banner is NOT rendered when connected=true", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsConnectedMock);
    render(<App />);
    expect(screen.queryByText("⚠ Disconnected — reconnecting...")).toBeNull();
  });

  it("banner renders when connected=false", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsDisconnectedMock);
    render(<App />);
    expect(screen.getByText("⚠ Disconnected — reconnecting...")).toBeInTheDocument();
  });

  it("banner text content is '⚠ Disconnected — reconnecting...'", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsDisconnectedMock);
    render(<App />);
    const span = screen.getByText("⚠ Disconnected — reconnecting...");
    expect(span.textContent).toBe("⚠ Disconnected — reconnecting...");
  });

  it("banner wrapper div has class bg-threat-amber", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsDisconnectedMock);
    render(<App />);
    const span = screen.getByText("⚠ Disconnected — reconnecting...");
    const wrapper = span.closest("div");
    expect(wrapper).toHaveClass("bg-threat-amber");
  });

  it("banner text span has class text-bg", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsDisconnectedMock);
    render(<App />);
    const span = screen.getByText("⚠ Disconnected — reconnecting...");
    expect(span).toHaveClass("text-bg");
  });

  it("banner disappears when connected flips back to true", () => {
    vi.mocked(useWebSocket).mockReturnValue(wsDisconnectedMock);
    const { rerender } = render(<App />);
    expect(screen.getByText("⚠ Disconnected — reconnecting...")).toBeInTheDocument();

    vi.mocked(useWebSocket).mockReturnValue(wsConnectedMock);
    rerender(<App />);
    expect(screen.queryByText("⚠ Disconnected — reconnecting...")).toBeNull();
  });
});
