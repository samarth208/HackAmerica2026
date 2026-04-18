// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EventFeed from "../components/EventFeed";

// ─── Color helper ─────────────────────────────────────────────────────────────
// jsdom normalizes inline style colors to rgb() when read back via .style.
// Use this helper to convert DESIGN.md hex tokens for assertions.
function rgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// TOKEN.textMuted from DESIGN.md / EventFeed.jsx
const TEXT_MUTED = rgb("#6b7280"); // → "rgb(107, 114, 128)"

// ─── Seed-entry state tests ───────────────────────────────────────────────────

describe("EventFeed seed entry", () => {
  it("seed entry renders on mount when eventLog=[]", () => {
    render(<EventFeed />);
    // At least one event-entry must exist even though no real events were passed
    const entries = screen.getAllByTestId("event-entry");
    expect(entries.length).toBeGreaterThan(0);
  });

  it("seed entry description is 'Session started. Awaiting events...'", () => {
    render(<EventFeed />);
    const description = screen.getByTestId("event-description");
    expect(description.textContent).toBe("Session started. Awaiting events...");
  });

  it("seed entry category dot has data-category='system'", () => {
    render(<EventFeed />);
    const dot = screen.getByTestId("event-dot");
    expect(dot).toHaveAttribute("data-category", "system");
  });

  it("seed entry dot color matches text-muted token (rgb(107, 114, 128))", () => {
    render(<EventFeed />);
    const dot = screen.getByTestId("event-dot");
    expect(dot.style.backgroundColor).toBe(TEXT_MUTED);
  });

  it("seed entry is NOT in eventLog prop (it is display-only)", () => {
    // The component contract: the seed comes from internal useState, not from
    // the prop. Pass an empty array and verify the prop was never mutated —
    // the seed description still appears while the prop length remains 0.
    const eventLog = [];
    render(<EventFeed eventLog={eventLog} />);

    // Seed description is visible …
    expect(screen.getByTestId("event-description").textContent).toBe(
      "Session started. Awaiting events..."
    );
    // … but the original array was never touched
    expect(eventLog).toHaveLength(0);
  });

  it("seed entry is replaced when real eventLog entries arrive", () => {
    const realEntry = {
      id:          "e1",
      timestamp:   new Date().toISOString(),
      category:    "fire",
      description: "Real event",
    };

    render(<EventFeed eventLog={[realEntry]} />);

    // Real event is shown
    expect(screen.getByText("Real event")).toBeInTheDocument();

    // Seed text must NOT appear
    expect(
      screen.queryByText("Session started. Awaiting events...")
    ).toBeNull();
  });

  it("seed entry does NOT appear when eventLog already has entries on mount", () => {
    const realEntry = {
      id:          "e1",
      timestamp:   new Date().toISOString(),
      category:    "fire",
      description: "Real event",
    };

    render(<EventFeed eventLog={[realEntry]} />);

    // Exactly one entry rendered (the real one)
    const entries = screen.getAllByTestId("event-entry");
    expect(entries).toHaveLength(1);

    // And it is the real entry, not the seed
    expect(entries[0].querySelector("[data-testid='event-description']").textContent).toBe(
      "Real event"
    );
  });
});
