// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import MapPanel from "../components/MapPanel";
import MapErrorBoundary from "../components/MapErrorBoundary";
import { emptyLayerProps, populatedLayerProps } from "./fixtures/stateFixtures";

// ─── Mock leaflet ─────────────────────────────────────────────────────────────
vi.mock("leaflet", () => {
  const divIcon = vi.fn((opts) => ({ __html: opts.html, options: opts }));
  const mockLayerGroup = {
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
  };
  const layerGroup = vi.fn(() => mockLayerGroup);
  const geoJSONLayer = {
    setStyle: vi.fn().mockReturnThis(),
    on: vi.fn(),
    getElement: vi.fn(() => null),
  };
  const geoJSON = vi.fn(() => geoJSONLayer);
  return { default: { divIcon, layerGroup, geoJSON }, divIcon, layerGroup, geoJSON };
});

// ─── Mock react-leaflet ───────────────────────────────────────────────────────
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }) => (
    <div data-testid="tile-layer" data-url={url} />
  ),
  Polygon: ({ pathOptions, children }) => (
    <div
      data-testid="fire-polygon"
      data-color={pathOptions?.color}
      data-fill-color={pathOptions?.fillColor}
    >
      {children}
    </div>
  ),
  CircleMarker: ({ pathOptions, children }) => (
    <div
      data-testid="circle-marker"
      data-fill-color={pathOptions?.fillColor}
    >
      {children}
    </div>
  ),
  Marker: ({ icon, children }) => (
    <div data-testid="marker" data-icon-html={icon?.__html ?? ""}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  }),
  GeoJSON: () => <div data-testid="geojson" />,
}));

// ─── Mock colorScale ──────────────────────────────────────────────────────────
vi.mock("../utils/colorScale", () => ({
  damageColor: vi.fn((prob) => `#dmg-${prob}`),
  emberColor:  vi.fn((intensity) => `#emb-${intensity}`),
  default: {
    damageColor: vi.fn((prob) => `#dmg-${prob}`),
    emberColor:  vi.fn((intensity) => `#emb-${intensity}`),
  },
}));

// ─── Default layerVisibility (all on) ─────────────────────────────────────────
const allLayersTrue = {
  firePerimeter:  true,
  emberRisk:      true,
  seismicDamage:  true,
  crews:          true,
  infrastructure: true,
};

// ─── ThrowingChild — always throws on render ──────────────────────────────────
function ThrowingChild() {
  throw new Error("Simulated Leaflet render failure");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MapPanel — empty state overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty state overlay renders when all layer props are empty", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        layerVisibility={allLayersTrue}
      />
    );
    expect(
      screen.getByText("Awaiting pipeline data...")
    ).toBeInTheDocument();
  });

  it("empty state span has class font-data and text-text-muted", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        layerVisibility={allLayersTrue}
      />
    );
    const span = screen.getByText("Awaiting pipeline data...");
    expect(span).toHaveClass("font-data");
    expect(span).toHaveClass("text-text-muted");
  });

  it("empty state overlay is not rendered when fireHotspots has data", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        fireHotspots={populatedLayerProps.fireHotspots}
        layerVisibility={allLayersTrue}
      />
    );
    expect(
      screen.queryByText("Awaiting pipeline data...")
    ).toBeNull();
  });

  it("empty state overlay is not rendered when seismicGrid has data", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        seismicGrid={populatedLayerProps.seismicGrid}
        layerVisibility={allLayersTrue}
      />
    );
    expect(
      screen.queryByText("Awaiting pipeline data...")
    ).toBeNull();
  });
});

describe("MapErrorBoundary", () => {
  // Suppress React's own error logging for expected boundary catches
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders fallback when child throws", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild />
      </MapErrorBoundary>
    );
    expect(
      screen.getByText("Map error — check console")
    ).toBeInTheDocument();
  });

  it("MapErrorBoundary calls console.error on componentDidCatch", () => {
    render(
      <MapErrorBoundary>
        <ThrowingChild />
      </MapErrorBoundary>
    );
    // console.error is called both by React's error boundary internals and
    // by componentDidCatch — verify at least one call contains our boundary prefix.
    const calls = consoleErrorSpy.mock.calls;
    const boundaryCall = calls.find(
      (args) =>
        typeof args[0] === "string" &&
        args[0].includes("[MapErrorBoundary]")
    );
    expect(boundaryCall).toBeDefined();
  });
});

describe("MapPanel — seismic pulse keyframe injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pulse animation keyframe is injected into document head", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        layerVisibility={allLayersTrue}
      />
    );
    expect(document.head.innerHTML).toContain("seismic-pulse");
  });

  it("pulse animation iteration count is 1 (via 'forwards' shorthand)", () => {
    render(
      <MapPanel
        {...emptyLayerProps}
        layerVisibility={allLayersTrue}
      />
    );
    // The injected style uses: animation: seismic-pulse 600ms ease-out 1 forwards
    expect(document.head.innerHTML).toContain("600ms ease-out 1 forwards");
  });
});
