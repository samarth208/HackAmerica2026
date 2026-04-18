// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EventFeed from "../components/EventFeed";
import {
  eventLog15,
  eventLog15Shuffled,
  eventLog101,
} from "./fixtures/actionFixtures";

// DESIGN.md token hex values — converted to rgb() because jsdom normalizes
// inline style colors to rgb format when reading back via .style.backgroundColor
function rgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
const THREAT_ORANGE = rgb("#f97316");
const THREAT_RED    = rgb("#ef4444");
const THREAT_GREEN  = rgb("#10b981");
const TEXT_MUTED    = rgb("#6b7280");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EventFeed", () => {
  it("renders without crashing with empty eventLog", () => {
    render(<EventFeed eventLog={[]} />);
    expect(screen.getByTestId("event-feed")).toBeInTheDocument();
  });

  it("renders correct number of entries", () => {
    render(<EventFeed eventLog={eventLog15} />);
    expect(screen.getAllByTestId("event-entry")).toHaveLength(15);
  });

  it("caps render list at 100 even when eventLog exceeds 100", () => {
    render(<EventFeed eventLog={eventLog101} />);
    expect(screen.getAllByTestId("event-entry")).toHaveLength(100);
  });

  describe("newest entry appears at top", () => {
    it("sorts by timestamp DESC — newest first when input is oldest-first", () => {
      // eventLog15Shuffled is reversed (oldest at index 0)
      render(<EventFeed eventLog={eventLog15Shuffled} />);
      const entries = screen.getAllByTestId("event-entry");
      const firstTimestamp = entries[0]
        .querySelector("[data-testid='event-timestamp']")
        .textContent;
      const lastTimestamp = entries[entries.length - 1]
        .querySelector("[data-testid='event-timestamp']")
        .textContent;
      // Newest (largest ISO string) should come first
      expect(firstTimestamp >= lastTimestamp).toBe(true);
    });

    it("first rendered entry matches the event with the latest timestamp", () => {
      render(<EventFeed eventLog={eventLog15Shuffled} />);
      const entries = screen.getAllByTestId("event-entry");
      const firstDescription = entries[0]
        .querySelector("[data-testid='event-description']")
        .textContent;
      // eventLog15[0] is the newest (index 0 of the sorted original array)
      expect(firstDescription).toBe(eventLog15[0].description);
    });
  });

  describe("entry content", () => {
    it("renders a dot, timestamp, and description per entry", () => {
      render(<EventFeed eventLog={[eventLog15[0]]} />);
      expect(screen.getByTestId("event-dot")).toBeInTheDocument();
      expect(screen.getByTestId("event-timestamp")).toBeInTheDocument();
      expect(screen.getByTestId("event-description")).toBeInTheDocument();
    });

    it("timestamp is rendered in font-data class (JetBrains Mono)", () => {
      render(<EventFeed eventLog={[eventLog15[0]]} />);
      expect(screen.getByTestId("event-timestamp")).toHaveClass("font-data");
    });

    it("description is rendered in font-ui class (Inter)", () => {
      render(<EventFeed eventLog={[eventLog15[0]]} />);
      expect(screen.getByTestId("event-description")).toHaveClass("font-ui");
    });
  });

  describe("category dot colors (DESIGN.md tokens)", () => {
    function dotForCategory(category) {
      const entry = eventLog15.find((e) => e.category === category);
      render(<EventFeed eventLog={[entry]} />);
      return screen.getByTestId("event-dot");
    }

    it("fire → threat-orange dot", () => {
      expect(dotForCategory("fire").style.backgroundColor).toBe(THREAT_ORANGE);
    });

    it("seismic → threat-red dot", () => {
      expect(dotForCategory("seismic").style.backgroundColor).toBe(THREAT_RED);
    });

    it("crew → threat-green dot", () => {
      expect(dotForCategory("crew").style.backgroundColor).toBe(THREAT_GREEN);
    });

    it("system → text-muted dot", () => {
      expect(dotForCategory("system").style.backgroundColor).toBe(TEXT_MUTED);
    });
  });

  describe("auto-scroll to top on new entry", () => {
    it("sets scrollTop to 0 when eventLog length increases", () => {
      const { rerender } = render(<EventFeed eventLog={eventLog15} />);

      const feed = screen.getByTestId("event-feed");
      let trackedScrollTop = 500; // simulate being scrolled down
      Object.defineProperty(feed, "scrollTop", {
        get: () => trackedScrollTop,
        set: (v) => { trackedScrollTop = v; },
        configurable: true,
      });

      const newEntry = {
        id:          "ev-new",
        timestamp:   new Date().toISOString(),
        category:    "system",
        description: "New incoming event",
      };

      rerender(<EventFeed eventLog={[newEntry, ...eventLog15]} />);
      expect(trackedScrollTop).toBe(0);
    });

    it("does NOT scroll when eventLog length stays the same", () => {
      const { rerender } = render(<EventFeed eventLog={eventLog15} />);

      const feed = screen.getByTestId("event-feed");
      let trackedScrollTop = 500;
      Object.defineProperty(feed, "scrollTop", {
        get: () => trackedScrollTop,
        set: (v) => { trackedScrollTop = v; },
        configurable: true,
      });

      // Rerender with same length (different content)
      rerender(<EventFeed eventLog={[...eventLog15]} />);
      expect(trackedScrollTop).toBe(500); // unchanged
    });
  });
});
