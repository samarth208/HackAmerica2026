// Read DESIGN.md and CLAUDE.md before modifying.
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import MapPanel from "../components/MapPanel";
import MapLegend from "../components/MapLegend";
import { mapFixtures, allLayersTrue, allLayersFalse } from "./fixtures/mapFixtures";

// ─── DESIGN.md token values used in assertions ────────────────────────────────
const THREAT_RED   = "#ef4444";
const THREAT_GREEN = "#10b981";
const THREAT_AMBER = "#f59e0b";
const ACCENT       = "#3b82f6";

const ESRI_SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// ─── Mock leaflet ─────────────────────────────────────────────────────────────
vi.mock("leaflet", () => {
  const divIcon = vi.fn((opts) => ({ __html: opts.html, options: opts }));
  const mockLayerGroup = {
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
  };
  const layerGroup = vi.fn(() => mockLayerGroup);
  const geoJSONLayer = { setStyle: vi.fn().mockReturnThis() };
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

// Import after mocking so we get the spy references
import * as colorScale from "../utils/colorScale";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderPanel(layerVisibility = allLayersTrue, overrides = {}) {
  return render(
    <MapPanel
      {...mapFixtures}
      layerVisibility={layerVisibility}
      {...overrides}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MapPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderPanel();
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("uses ESRI satellite tile URL", () => {
    renderPanel();
    const tile = screen.getByTestId("tile-layer");
    expect(tile).toHaveAttribute("data-url", ESRI_SAT_URL);
  });

  describe("layer visibility — all on", () => {
    it("renders fire polygons when firePerimeter=true", () => {
      renderPanel();
      expect(screen.getAllByTestId("fire-polygon")).toHaveLength(
        mapFixtures.fireHotspots.length
      );
    });

    it("renders ember circle markers when emberRisk=true", () => {
      renderPanel();
      // All circle-markers includes both ember + crew — filter by mock color prefix
      const all = screen.getAllByTestId("circle-marker");
      const emberOnes = all.filter((el) =>
        el.dataset.fillColor?.startsWith("#emb-")
      );
      expect(emberOnes).toHaveLength(mapFixtures.emberRisk.length);
    });

    it("renders crew circle markers when crews=true", () => {
      renderPanel();
      const all = screen.getAllByTestId("circle-marker");
      const crewOnes = all.filter((el) =>
        [THREAT_GREEN, THREAT_AMBER, THREAT_RED].includes(el.dataset.fillColor)
      );
      expect(crewOnes).toHaveLength(mapFixtures.crews.length);
    });

    it("renders infrastructure markers when infrastructure=true", () => {
      renderPanel();
      expect(screen.getAllByTestId("marker")).toHaveLength(
        mapFixtures.shelters.length + mapFixtures.hospitals.length
      );
    });
  });

  describe("layer visibility — all off", () => {
    it("hides fire polygons when firePerimeter=false", () => {
      renderPanel(allLayersFalse);
      expect(screen.queryAllByTestId("fire-polygon")).toHaveLength(0);
    });

    it("hides circle markers when emberRisk+crews=false", () => {
      renderPanel(allLayersFalse);
      expect(screen.queryAllByTestId("circle-marker")).toHaveLength(0);
    });

    it("hides infrastructure markers when infrastructure=false", () => {
      renderPanel(allLayersFalse);
      expect(screen.queryAllByTestId("marker")).toHaveLength(0);
    });
  });

  describe("individual layer toggling", () => {
    it("shows only firePerimeter when only firePerimeter=true", () => {
      renderPanel({ ...allLayersFalse, firePerimeter: true });
      expect(screen.getAllByTestId("fire-polygon")).toHaveLength(
        mapFixtures.fireHotspots.length
      );
      expect(screen.queryAllByTestId("circle-marker")).toHaveLength(0);
      expect(screen.queryAllByTestId("marker")).toHaveLength(0);
    });

    it("shows only ember markers when only emberRisk=true", () => {
      renderPanel({ ...allLayersFalse, emberRisk: true });
      const emberOnes = screen
        .getAllByTestId("circle-marker")
        .filter((el) => el.dataset.fillColor?.startsWith("#emb-"));
      expect(emberOnes).toHaveLength(mapFixtures.emberRisk.length);
      expect(screen.queryAllByTestId("fire-polygon")).toHaveLength(0);
    });

    it("shows only crew markers when only crews=true", () => {
      renderPanel({ ...allLayersFalse, crews: true });
      const crewOnes = screen
        .getAllByTestId("circle-marker")
        .filter((el) =>
          [THREAT_GREEN, THREAT_AMBER, THREAT_RED].includes(el.dataset.fillColor)
        );
      expect(crewOnes).toHaveLength(mapFixtures.crews.length);
    });

    it("shows only infrastructure markers when only infrastructure=true", () => {
      renderPanel({ ...allLayersFalse, infrastructure: true });
      expect(screen.getAllByTestId("marker")).toHaveLength(
        mapFixtures.shelters.length + mapFixtures.hospitals.length
      );
      expect(screen.queryAllByTestId("fire-polygon")).toHaveLength(0);
    });
  });

  describe("firePerimeter colors", () => {
    it("renders fire polygons with threat-red fill", () => {
      renderPanel();
      const polygons = screen.getAllByTestId("fire-polygon");
      polygons.forEach((p) => {
        expect(p).toHaveAttribute("data-fill-color", THREAT_RED);
        expect(p).toHaveAttribute("data-color", THREAT_RED);
      });
    });
  });

  describe("crew marker colors", () => {
    it("available crew uses threat-green", () => {
      renderPanel();
      const all = screen.getAllByTestId("circle-marker");
      const crewColors = all
        .map((el) => el.dataset.fillColor)
        .filter((c) => [THREAT_GREEN, THREAT_AMBER, THREAT_RED].includes(c));

      expect(crewColors).toContain(THREAT_GREEN);   // available
      expect(crewColors).toContain(THREAT_AMBER);   // deployed
      expect(crewColors).toContain(THREAT_RED);     // unavailable
    });

    it("each crew status maps to its correct DESIGN.md token color", () => {
      renderPanel();
      const all = screen.getAllByTestId("circle-marker");
      const crewMarkers = all.filter((el) =>
        [THREAT_GREEN, THREAT_AMBER, THREAT_RED].includes(el.dataset.fillColor)
      );
      // fixtures: C1=available(green), C2=deployed(amber), C3=unavailable(red)
      expect(crewMarkers[0]).toHaveAttribute("data-fill-color", THREAT_GREEN);
      expect(crewMarkers[1]).toHaveAttribute("data-fill-color", THREAT_AMBER);
      expect(crewMarkers[2]).toHaveAttribute("data-fill-color", THREAT_RED);
    });
  });

  describe("seismicDamage — colorScale.damageColor", () => {
    it("calls damageColor() for each seismic cell (not hardcoded hex)", () => {
      renderPanel();
      const probs = mapFixtures.seismicGrid.features.map(
        (f) => f.properties.damage_prob
      );
      probs.forEach((prob) => {
        expect(colorScale.damageColor).toHaveBeenCalledWith(prob);
      });
    });

    it("does not call damageColor when seismicDamage layer is hidden", () => {
      renderPanel({ ...allLayersFalse, seismicDamage: false });
      expect(colorScale.damageColor).not.toHaveBeenCalled();
    });
  });

  describe("infrastructure marker colors", () => {
    it("shelter markers use accent color (#3b82f6)", () => {
      renderPanel();
      const markers = screen.getAllByTestId("marker");
      // Fixtures: 2 shelters first, then 2 hospitals (map order)
      const shelterMarkers = markers.slice(0, mapFixtures.shelters.length);
      shelterMarkers.forEach((m) => {
        expect(m.dataset.iconHtml).toContain(ACCENT);
      });
    });

    it("hospital markers use threat-red with '+' label", () => {
      renderPanel();
      const markers = screen.getAllByTestId("marker");
      const hospitalMarkers = markers.slice(mapFixtures.shelters.length);
      hospitalMarkers.forEach((m) => {
        expect(m.dataset.iconHtml).toContain(THREAT_RED);
        expect(m.dataset.iconHtml).toContain("+");
      });
    });
  });
});

// ─── MapLegend tests ──────────────────────────────────────────────────────────

describe("MapLegend", () => {
  it("renders 5 layer rows", () => {
    render(
      <MapLegend layerVisibility={allLayersTrue} onToggle={() => {}} />
    );
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(5);
  });

  it("calls onToggle with the correct layer key when a switch is clicked", () => {
    const onToggle = vi.fn();
    render(
      <MapLegend layerVisibility={allLayersTrue} onToggle={onToggle} />
    );
    const switches = screen.getAllByRole("switch");

    // LAYERS order in MapLegend: firePerimeter, emberRisk, seismicDamage, crews, infrastructure
    fireEvent.click(switches[0]);
    expect(onToggle).toHaveBeenCalledWith("firePerimeter");

    fireEvent.click(switches[1]);
    expect(onToggle).toHaveBeenCalledWith("emberRisk");

    fireEvent.click(switches[2]);
    expect(onToggle).toHaveBeenCalledWith("seismicDamage");

    fireEvent.click(switches[3]);
    expect(onToggle).toHaveBeenCalledWith("crews");

    fireEvent.click(switches[4]);
    expect(onToggle).toHaveBeenCalledWith("infrastructure");
  });

  it("toggle aria-checked reflects layerVisibility prop", () => {
    const { rerender } = render(
      <MapLegend
        layerVisibility={{ ...allLayersTrue, firePerimeter: false }}
        onToggle={() => {}}
      />
    );
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
    expect(switches[1]).toHaveAttribute("aria-checked", "true");

    rerender(
      <MapLegend layerVisibility={allLayersTrue} onToggle={() => {}} />
    );
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
  });
});
