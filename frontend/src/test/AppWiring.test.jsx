// Read DESIGN.md and CLAUDE.md before modifying.
// Tests App.jsx state wiring: WebSocket messages → state → child component props.
// Strategy: mock browser WebSocket API (real useWebSocket hook), mock children
// to expose received props as JSON data-attributes.

import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "../App";
import {
  MockWebSocket,
  wsMessages,
  wsActionCard2,
  wsEventLog101,
} from "./fixtures/websocketFixtures";

// ─── Mock child components (expose props as data-attributes) ──────────────────
vi.mock("../components/MapPanel", () => ({
  default: ({ seismicGrid, fireHotspots, emberRisk, crews, layerVisibility }) => (
    <div
      data-testid="map-panel"
      data-seismic-grid={JSON.stringify(seismicGrid)}
      data-fire-hotspots={JSON.stringify(fireHotspots)}
      data-ember-risk={JSON.stringify(emberRisk)}
      data-crews={JSON.stringify(crews)}
      data-layer-visibility={JSON.stringify(layerVisibility)}
    />
  ),
}));

vi.mock("../components/TopBar", () => ({
  default: ({ counters }) => (
    <div data-testid="top-bar" data-counters={JSON.stringify(counters)} />
  ),
}));

vi.mock("../components/ActionQueue", () => ({
  default: ({ actionCards, muted }) => (
    <div
      data-testid="action-queue"
      data-cards={JSON.stringify(actionCards)}
      data-muted={String(muted)}
    />
  ),
}));

vi.mock("../components/EventFeed", () => ({
  default: ({ eventLog }) => (
    <div data-testid="event-feed" data-log={JSON.stringify(eventLog)} />
  ),
}));

// LayerControls mock exposes muted + layerVisibility and provides buttons to
// invoke the toggle callbacks so we can test the handlers.
vi.mock("../components/LayerControls", () => ({
  default: ({ onToggleLayer, onToggleMute, muted, layerVisibility }) => (
    <div
      data-testid="layer-controls"
      data-muted={String(muted)}
      data-layer-visibility={JSON.stringify(layerVisibility)}
    >
      <button data-testid="toggle-fire"  onClick={() => onToggleLayer?.("firePerimeter")}>fire</button>
      <button data-testid="toggle-ember" onClick={() => onToggleLayer?.("emberRisk")}>ember</button>
      <button data-testid="toggle-seismic" onClick={() => onToggleLayer?.("seismicDamage")}>seismic</button>
      <button data-testid="toggle-mute"  onClick={() => onToggleMute?.()}>mute</button>
    </div>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Read a JSON data-attribute from a rendered mock component. */
function prop(testId, attr) {
  const raw = screen.getByTestId(testId).getAttribute(attr);
  return raw ? JSON.parse(raw) : null;
}

/** Simulate receiving a typed WS message and flush React updates. */
async function sendWs(type, data) {
  await act(async () => {
    MockWebSocket.lastInstance?.emit(type, data);
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  MockWebSocket.reset();
  global.WebSocket = MockWebSocket;
  global.fetch     = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("App — WebSocket connection", () => {
  it("useWebSocket connects to backend WebSocket on mount", () => {
    render(<App />);
    expect(MockWebSocket.lastInstance).not.toBeNull();
    expect(MockWebSocket.lastInstance?.url).toMatch(/^ws/);
  });
});

describe("App — replace-semantics messages", () => {
  it("seismic_grid replaces seismicGrid state and flows to MapPanel", async () => {
    render(<App />);
    await sendWs("seismic_grid", wsMessages.seismic_grid);
    expect(prop("map-panel", "data-seismic-grid")).toMatchObject({
      epicenter: [34.2, -118.53],
    });
  });

  it("fire_hotspots replaces fireHotspots and flows to MapPanel", async () => {
    render(<App />);
    await sendWs("fire_hotspots", wsMessages.fire_hotspots);
    const hs = prop("map-panel", "data-fire-hotspots");
    expect(hs).toHaveLength(wsMessages.fire_hotspots.length);
    expect(hs[0].label).toBe("WS Fire Zone Alpha");
  });

  it("ember_risk replaces emberRisk and flows to MapPanel", async () => {
    render(<App />);
    await sendWs("ember_risk", wsMessages.ember_risk);
    const risk = prop("map-panel", "data-ember-risk");
    expect(risk).toHaveLength(wsMessages.ember_risk.length);
    expect(risk[0].intensity).toBe(0.75);
  });

  it("crew_update replaces crews and flows to MapPanel", async () => {
    render(<App />);
    await sendWs("crew_update", wsMessages.crew_update);
    const crews = prop("map-panel", "data-crews");
    expect(crews).toHaveLength(wsMessages.crew_update.length);
    expect(crews[0].crew_id).toBe("WS-C1");
  });

  it("counter_update replaces counters and flows to TopBar", async () => {
    render(<App />);
    await sendWs("counter_update", wsMessages.counter_update);
    expect(prop("top-bar", "data-counters")).toMatchObject(wsMessages.counter_update);
  });
});

describe("App — action_card: append semantics", () => {
  it("first action_card populates actionCards array", async () => {
    render(<App />);
    await sendWs("action_card", wsMessages.action_card);
    const cards = prop("action-queue", "data-cards");
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("ws-ac-1");
  });

  it("second action_card appends — does NOT replace the first", async () => {
    render(<App />);
    await sendWs("action_card", wsMessages.action_card);
    await sendWs("action_card", wsActionCard2);
    const cards = prop("action-queue", "data-cards");
    expect(cards).toHaveLength(2);
    expect(cards[0].id).toBe("ws-ac-1");
    expect(cards[1].id).toBe("ws-ac-2");
  });
});

describe("App — event_log: prepend semantics", () => {
  it("event_log prepends newest entry to eventLog (does not replace)", async () => {
    render(<App />);
    const e1 = { id: "e1", timestamp: "2024-01-15T10:00:00Z", category: "fire",   description: "first"  };
    const e2 = { id: "e2", timestamp: "2024-01-15T11:00:00Z", category: "crew",   description: "second" };
    await sendWs("event_log", e1);
    await sendWs("event_log", e2);
    const log = prop("event-feed", "data-log");
    expect(log[0].id).toBe("e2"); // most recent prepended
    expect(log[1].id).toBe("e1");
  });

  it("eventLog is capped at 100 entries after prepend of 101-entry batch", async () => {
    render(<App />);
    await sendWs("event_log", wsEventLog101);
    expect(prop("event-feed", "data-log")).toHaveLength(100);
  });
});

describe("App — layerVisibility state", () => {
  it("defaults to all 5 layers true", () => {
    render(<App />);
    expect(prop("map-panel", "data-layer-visibility")).toEqual({
      firePerimeter:  true,
      emberRisk:      true,
      seismicDamage:  true,
      crews:          true,
      infrastructure: true,
    });
  });

  it("onToggleLayer flips exactly one layer, leaves the other 4 unchanged", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("toggle-fire"));
    const lv = prop("layer-controls", "data-layer-visibility");
    expect(lv.firePerimeter).toBe(false);
    expect(lv.emberRisk).toBe(true);
    expect(lv.seismicDamage).toBe(true);
    expect(lv.crews).toBe(true);
    expect(lv.infrastructure).toBe(true);
  });

  it("toggling the same layer twice returns it to true", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("toggle-fire"));
    fireEvent.click(screen.getByTestId("toggle-fire"));
    expect(prop("layer-controls", "data-layer-visibility").firePerimeter).toBe(true);
  });

  it("toggling different layers affects each independently", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("toggle-fire"));
    fireEvent.click(screen.getByTestId("toggle-ember"));
    const lv = prop("layer-controls", "data-layer-visibility");
    expect(lv.firePerimeter).toBe(false);
    expect(lv.emberRisk).toBe(false);
    expect(lv.seismicDamage).toBe(true);
  });
});

describe("App — muted state", () => {
  it("muted defaults to false in LayerControls and ActionQueue", () => {
    render(<App />);
    expect(screen.getByTestId("layer-controls").dataset.muted).toBe("false");
    expect(screen.getByTestId("action-queue").dataset.muted).toBe("false");
  });

  it("onToggleMute flips muted to true", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("toggle-mute"));
    expect(screen.getByTestId("layer-controls").dataset.muted).toBe("true");
  });

  it("onToggleMute flips muted back to false on second click", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("toggle-mute"));
    fireEvent.click(screen.getByTestId("toggle-mute"));
    expect(screen.getByTestId("layer-controls").dataset.muted).toBe("false");
  });
});
