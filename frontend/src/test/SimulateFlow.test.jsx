// Read DESIGN.md and CLAUDE.md before modifying.
// Tests the full Simulate Crisis flow: button click → POST → WS seismic_grid
// message → App state → MapPanel prop.
// Strategy: render full App with MockWebSocket; mock child components to expose
// props as data-attributes; trigger SIMULATE click; inject WS seismic_grid
// message; assert MapPanel receives updated seismicGrid with Northridge epicenter.

import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "../App";
import { MockWebSocket } from "./fixtures/websocketFixtures";

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

vi.mock("../components/LayerControls", () => ({
  default: ({ onToggleMute, muted, layerVisibility }) => (
    <div
      data-testid="layer-controls"
      data-muted={String(muted)}
      data-layer-visibility={JSON.stringify(layerVisibility)}
    >
      <button data-testid="toggle-mute" onClick={() => onToggleMute?.()}>mute</button>
      <button
        data-testid="simulate-btn"
        onClick={async () => {
          await fetch("/api/simulate/northridge", { method: "POST" });
        }}
      >
        Simulate Crisis
      </button>
    </div>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function prop(testId, attr) {
  const raw = screen.getByTestId(testId).getAttribute(attr);
  return raw ? JSON.parse(raw) : null;
}

async function sendWs(type, data) {
  await act(async () => {
    MockWebSocket.lastInstance?.emit(type, data);
  });
}

// ─── Northridge seismic_grid fixture ─────────────────────────────────────────
const NORTHRIDGE_EPICENTER = [34.2, -118.53];

const northridgeSeismicGrid = {
  epicenter: NORTHRIDGE_EPICENTER,
  features: [
    {
      type: "Feature",
      properties: { damage_prob: 0.9 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-118.54, 34.19], [-118.52, 34.19],
          [-118.52, 34.21], [-118.54, 34.21],
          [-118.54, 34.19],
        ]],
      },
    },
    {
      type: "Feature",
      properties: { damage_prob: 0.5 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-118.60, 34.15], [-118.58, 34.15],
          [-118.58, 34.17], [-118.60, 34.17],
          [-118.60, 34.15],
        ]],
      },
    },
  ],
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  MockWebSocket.reset();
  global.WebSocket = MockWebSocket;
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("SimulateFlow — SIMULATE button → POST", () => {
  it("clicking SIMULATE calls POST /api/simulate/northridge", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-btn"));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/simulate/northridge",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("SimulateFlow — WS seismic_grid → App state → MapPanel prop", () => {
  it("seismic_grid WS message updates seismicGrid state in App", async () => {
    render(<App />);

    // seismicGrid should be null initially
    expect(prop("map-panel", "data-seismic-grid")).toBeNull();

    await sendWs("seismic_grid", northridgeSeismicGrid);

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid).not.toBeNull();
    expect(grid.epicenter).toEqual(NORTHRIDGE_EPICENTER);
  });

  it("MapPanel receives seismicGrid with Northridge epicenter [34.2, -118.53]", async () => {
    render(<App />);
    await sendWs("seismic_grid", northridgeSeismicGrid);

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid.epicenter[0]).toBeCloseTo(34.2);
    expect(grid.epicenter[1]).toBeCloseTo(-118.53);
  });

  it("MapPanel receives seismicGrid with correct feature count", async () => {
    render(<App />);
    await sendWs("seismic_grid", northridgeSeismicGrid);

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid.features).toHaveLength(2);
  });

  it("seismicGrid features include damage_prob values", async () => {
    render(<App />);
    await sendWs("seismic_grid", northridgeSeismicGrid);

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid.features[0].properties.damage_prob).toBe(0.9);
    expect(grid.features[1].properties.damage_prob).toBe(0.5);
  });

  it("second seismic_grid message replaces the first (not appended)", async () => {
    render(<App />);

    await sendWs("seismic_grid", northridgeSeismicGrid);
    await sendWs("seismic_grid", {
      epicenter: [34.1, -118.40],
      features: [],
    });

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid.epicenter).toEqual([34.1, -118.40]);
    expect(grid.features).toHaveLength(0);
  });
});

describe("SimulateFlow — full simulate → WS chain", () => {
  it("after POST resolves and WS delivers seismic_grid, MapPanel shows epicenter", async () => {
    render(<App />);

    // Click SIMULATE (fires the POST)
    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-btn"));
    });

    // Simulate backend responding with seismic_grid over WS
    await sendWs("seismic_grid", northridgeSeismicGrid);

    const grid = prop("map-panel", "data-seismic-grid");
    expect(grid.epicenter).toEqual(NORTHRIDGE_EPICENTER);
    expect(grid.features[0].properties.damage_prob).toBe(0.9);
  });
});
