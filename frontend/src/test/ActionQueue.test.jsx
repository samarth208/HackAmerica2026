// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ActionQueue from "../components/ActionQueue";
import { actionCards5, sortedIds } from "./fixtures/actionFixtures";

// DESIGN.md token hex values — converted to rgb() because jsdom normalizes
// inline style colors to rgb format when reading back via .style.backgroundColor
function rgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
const THREAT_RED    = rgb("#ef4444");
const THREAT_PURPLE = rgb("#8b5cf6");
const THREAT_GREEN  = rgb("#10b981");
const THREAT_AMBER  = rgb("#f59e0b");

// ─── fetch mock ───────────────────────────────────────────────────────────────
function mockFetchOk() {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
}
function mockFetchFail() {
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFetchOk();
});

// ─── helpers ──────────────────────────────────────────────────────────────────
function badge(type) {
  return screen
    .getAllByTestId("action-badge")
    .find((el) => el.dataset.actionType === type);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ActionQueue", () => {
  it("renders without crashing with empty actionCards", () => {
    render(<ActionQueue actionCards={[]} />);
    expect(screen.getByTestId("action-queue")).toBeInTheDocument();
  });

  it("shows empty state when actionCards is []", () => {
    render(<ActionQueue actionCards={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No active recommendations"
    );
    expect(screen.queryAllByTestId("action-card")).toHaveLength(0);
  });

  describe("sort by confidence DESC", () => {
    it("renders cards in descending confidence order", () => {
      render(<ActionQueue actionCards={actionCards5} />);
      const cards = screen.getAllByTestId("action-card");
      expect(cards).toHaveLength(actionCards5.length);

      // Each card's rationale maps uniquely to a fixture card — find position
      const renderedIds = cards.map((card) => {
        const rationale = card.querySelector("[data-testid='rationale']").textContent;
        return actionCards5.find((c) => c.rationale === rationale)?.id;
      });
      expect(renderedIds).toEqual(sortedIds);
    });
  });

  describe("card content", () => {
    it("renders action_type badge for each card", () => {
      render(<ActionQueue actionCards={actionCards5} />);
      expect(screen.getAllByTestId("action-badge")).toHaveLength(
        actionCards5.length
      );
    });

    it("renders confidence % in font-data (JetBrains Mono)", () => {
      render(<ActionQueue actionCards={[actionCards5[1]]} />); // confidence 0.91
      const conf = screen.getByTestId("confidence");
      expect(conf).toHaveTextContent("91% confidence");
      expect(conf).toHaveClass("font-data");
    });

    it("renders time_sensitivity indicator", () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />); // high
      expect(screen.getByTestId("time-sensitivity")).toBeInTheDocument();
    });

    it("renders rationale text", () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />);
      expect(screen.getByTestId("rationale")).toHaveTextContent(
        actionCards5[0].rationale
      );
    });
  });

  describe("badge colors match action_type (DESIGN.md tokens)", () => {
    beforeEach(() => {
      render(<ActionQueue actionCards={actionCards5} />);
    });

    it("reposition → threat-red", () => {
      expect(badge("reposition").style.backgroundColor).toBe(THREAT_RED);
    });

    it("seismic_alert → threat-purple", () => {
      expect(badge("seismic_alert").style.backgroundColor).toBe(THREAT_PURPLE);
    });

    it("ember_dispatch → threat-green", () => {
      expect(badge("ember_dispatch").style.backgroundColor).toBe(THREAT_GREEN);
    });

    it("evacuate → threat-amber", () => {
      expect(badge("evacuate").style.backgroundColor).toBe(THREAT_AMBER);
    });
  });

  describe("time_sensitivity colors (DESIGN.md tokens)", () => {
    it("high → threat-red text", () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />); // high
      expect(screen.getByTestId("time-sensitivity").style.color).toBe(THREAT_RED);
    });

    it("medium → threat-amber text", () => {
      render(<ActionQueue actionCards={[actionCards5[2]]} />); // medium
      expect(screen.getByTestId("time-sensitivity").style.color).toBe(THREAT_AMBER);
    });

    it("low → threat-green text", () => {
      render(<ActionQueue actionCards={[actionCards5[4]]} />); // low
      expect(screen.getByTestId("time-sensitivity").style.color).toBe(THREAT_GREEN);
    });
  });

  describe("API actions", () => {
    it("Approve fires PATCH /api/action-cards/{id} with status approved", async () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />);
      fireEvent.click(screen.getByText("Approve"));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/action-cards/${actionCards5[0].id}`,
          expect.objectContaining({
            method: "PATCH",
            body:   JSON.stringify({ status: "approved" }),
          })
        );
      });
    });

    it("Dismiss fires PATCH /api/action-cards/{id} with status dismissed", async () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />);
      fireEvent.click(screen.getByText("Dismiss"));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/action-cards/${actionCards5[0].id}`,
          expect.objectContaining({
            method: "PATCH",
            body:   JSON.stringify({ status: "dismissed" }),
          })
        );
      });
    });

    it("removes card from stack after successful Approve", async () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />);
      expect(screen.getByTestId("action-card")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Approve"));
      await waitFor(() => {
        expect(screen.queryByTestId("action-card")).not.toBeInTheDocument();
      });
    });

    it("removes card from stack after successful Dismiss", async () => {
      render(<ActionQueue actionCards={[actionCards5[0]]} />);
      expect(screen.getByTestId("action-card")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Dismiss"));
      await waitFor(() => {
        expect(screen.queryByTestId("action-card")).not.toBeInTheDocument();
      });
    });

    it("does NOT remove card when fetch returns ok=false", async () => {
      mockFetchFail();
      render(<ActionQueue actionCards={[actionCards5[0]]} />);

      fireEvent.click(screen.getByText("Approve"));
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      // Card should still be present
      expect(screen.getByTestId("action-card")).toBeInTheDocument();
    });

    it("shows empty state after all cards are approved", async () => {
      const single = [actionCards5[0]];
      render(<ActionQueue actionCards={single} />);

      fireEvent.click(screen.getByText("Approve"));
      await waitFor(() => {
        expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      });
    });
  });
});
