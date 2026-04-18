// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import TopBar from "../components/TopBar";
import {
  REFERENCE_NOW,
  counterUpdate,
} from "./fixtures/stateFixtures";

// ─── Color helpers ────────────────────────────────────────────────────────────
function rgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const MUTED = rgb("#6b7280"); // "rgb(107, 114, 128)"
const GREEN = rgb("#10b981"); // "rgb(16, 185, 129)"
const AMBER = rgb("#f59e0b"); // "rgb(245, 158, 11)"
const RED   = rgb("#ef4444"); // "rgb(239, 68, 68)"

// ─── Counter label → testid mapping ──────────────────────────────────────────
const COUNTER_TESTIDS = [
  "counter-hotspots",
  "counter-crews-active",
  "counter-damage-zones",
  "counter-shelters-cap",
  "counter-hosp.-alert",
];

function getAllSyncDots() {
  return screen.getAllByTestId("sync-dot");
}

import { act } from "react";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TopBar counter display", () => {
  it("all 5 counters show '—' before first counter_update", () => {
    render(<TopBar counters={{}} />);
    COUNTER_TESTIDS.forEach((testId) => {
      const cell = screen.getByTestId(testId);
      // The value span is the last span inside the cell's flex row
      const valueSpan = cell.querySelector(".font-data");
      expect(valueSpan).not.toBeNull();
      expect(valueSpan.textContent).toBe("—");
    });
  });

  it("counters render correct values after counter_update", () => {
    render(<TopBar counters={counterUpdate} />);

    const hotspots = screen.getByTestId("counter-hotspots").querySelector(".font-data");
    expect(hotspots.textContent).toBe("5");

    const crewsActive = screen.getByTestId("counter-crews-active").querySelector(".font-data");
    expect(crewsActive.textContent).toBe("3");

    const damageZones = screen.getByTestId("counter-damage-zones").querySelector(".font-data");
    expect(damageZones.textContent).toBe("2");

    const sheltersCap = screen.getByTestId("counter-shelters-cap").querySelector(".font-data");
    expect(sheltersCap.textContent).toBe("0");

    const hospitalsAlert = screen.getByTestId("counter-hosp.-alert").querySelector(".font-data");
    expect(hospitalsAlert.textContent).toBe("1");
  });
});

describe("TopBar sync-dot colors — no update", () => {
  it("sync dot is text-muted color before any update", () => {
    render(<TopBar counters={{}} />);
    const dots = getAllSyncDots();
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => {
      expect(dot.style.backgroundColor).toBe(MUTED);
    });
  });
});

describe("TopBar sync-dot colors — with fake timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sync dot is threat-green when update is 30s ago", () => {
    vi.setSystemTime(REFERENCE_NOW);
    const { rerender } = render(<TopBar counters={{}} />);
    // Trigger useEffect that records Date.now() = REFERENCE_NOW
    rerender(<TopBar counters={counterUpdate} />);

    const dots = getAllSyncDots();
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => {
      expect(dot.style.backgroundColor).toBe(GREEN);
    });
  });

  it("sync dot is threat-amber when update is 90s ago", () => {
    vi.setSystemTime(REFERENCE_NOW);
    const { rerender } = render(<TopBar counters={{}} />);
    act(() => {
      rerender(<TopBar counters={counterUpdate} />);
    });

    // Advance time to 90s after the update, then trigger the internal tick
    act(() => {
      vi.setSystemTime(REFERENCE_NOW + 90_000);
      vi.advanceTimersByTime(10_000);
    });

    // Force a re-render to pick up new dot colors
    rerender(<TopBar counters={counterUpdate} />);

    const dots = getAllSyncDots();
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => {
      expect(dot.style.backgroundColor).toBe(AMBER);
    });
  });

  it("sync dot is threat-red when update is 200s ago", () => {
    vi.setSystemTime(REFERENCE_NOW);
    const { rerender } = render(<TopBar counters={{}} />);
    act(() => {
      rerender(<TopBar counters={counterUpdate} />);
    });

    act(() => {
      vi.setSystemTime(REFERENCE_NOW + 200_000);
      vi.advanceTimersByTime(10_000);
    });

    rerender(<TopBar counters={counterUpdate} />);

    const dots = getAllSyncDots();
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => {
      expect(dot.style.backgroundColor).toBe(RED);
    });
  });

  it("each counter tracks its own timestamp independently", () => {
    vi.setSystemTime(REFERENCE_NOW);
    // Use a stable object reference so rerender doesn't re-trigger useEffect
    const hotspotOnlyCounters = { hotspots: 5 };
    const { rerender } = render(<TopBar counters={{}} />);

    // Only provide hotspots — others remain unset
    act(() => {
      rerender(<TopBar counters={hotspotOnlyCounters} />);
    });

    // Advance to 90s later → hotspots should be amber, others still muted
    // Use same object reference to avoid re-triggering useEffect
    act(() => {
      vi.setSystemTime(REFERENCE_NOW + 90_000);
      vi.advanceTimersByTime(10_000);
    });
    // Rerender with the same object reference — useEffect won't fire again
    // because React sees the same counters reference (stable object)
    rerender(<TopBar counters={hotspotOnlyCounters} />);

    const hotspotsCell = screen.getByTestId("counter-hotspots");
    const hotspotsDot = hotspotsCell.querySelector("[data-testid='sync-dot']");
    expect(hotspotsDot.style.backgroundColor).toBe(AMBER);

    // All other counter cells should have muted dots (no timestamp recorded)
    const otherTestIds = COUNTER_TESTIDS.filter((id) => id !== "counter-hotspots");
    otherTestIds.forEach((testId) => {
      const cell = screen.getByTestId(testId);
      const dot = cell.querySelector("[data-testid='sync-dot']");
      expect(dot.style.backgroundColor).toBe(MUTED);
    });
  });
});

describe("TopBar — no hardcoded hex in class attributes", () => {
  it("no #hex values appear in className attributes of rendered output", () => {
    const { container } = render(<TopBar counters={counterUpdate} />);
    // Walk all elements and check that no className contains a raw hex color
    const allElements = container.querySelectorAll("*");
    const hexInClassPattern = /#[0-9a-fA-F]{3,6}/;
    allElements.forEach((el) => {
      const className = el.getAttribute("class") || "";
      expect(hexInClassPattern.test(className)).toBe(false);
    });
  });
});
