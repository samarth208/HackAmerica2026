// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ActionQueue from "../components/ActionQueue";

const sampleCard = {
  id: "ac-1",
  action_type: "evacuate",
  resource_id: "zone-a",
  zone_id: "z1",
  confidence: 0.85,
  rationale: "Test rationale",
  time_sensitivity: "high",
  created_at: "2024-01-15T10:00:00.000Z",
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("ActionQueue empty-state", () => {
  it("empty state renders when actionCards=[]", () => {
    render(<ActionQueue actionCards={[]} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("empty state contains ShieldAlert icon", () => {
    const { getByTestId } = render(<ActionQueue actionCards={[]} />);
    const emptyState = getByTestId("empty-state");
    expect(emptyState.querySelector("svg")).toBeInTheDocument();
  });

  it("empty state text is 'No active recommendations'", () => {
    render(<ActionQueue actionCards={[]} />);
    expect(screen.getByText("No active recommendations")).toBeInTheDocument();
  });

  it("empty state text span has class font-body", () => {
    render(<ActionQueue actionCards={[]} />);
    const span = screen.getByText("No active recommendations");
    expect(span).toHaveClass("font-body");
  });

  it("empty state text span has class text-sm", () => {
    render(<ActionQueue actionCards={[]} />);
    const span = screen.getByText("No active recommendations");
    expect(span).toHaveClass("text-sm");
  });

  it("empty state wrapper has inline color style", () => {
    const { getByTestId } = render(<ActionQueue actionCards={[]} />);
    expect(getByTestId("empty-state")).toHaveStyle({ color: "#94a3b8" });
  });

  it("empty state wrapper has flex items-center justify-center flex-1", () => {
    const { getByTestId } = render(<ActionQueue actionCards={[]} />);
    const emptyState = getByTestId("empty-state");
    expect(emptyState).toHaveClass("flex");
    expect(emptyState).toHaveClass("items-center");
    expect(emptyState).toHaveClass("justify-center");
    expect(emptyState).toHaveClass("flex-1");
  });

  it("empty state is not rendered when actionCards has entries", () => {
    render(<ActionQueue actionCards={[sampleCard]} />);
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });
});
