// Shared fixtures for phase-5 loading/error/empty-state tests.

// ─── Fixed reference time ─────────────────────────────────────────────────────
// Tests that check sync-dot age should:
//   vi.useFakeTimers(); vi.setSystemTime(REFERENCE_NOW);
// then pass one of the TS_* values as the "last updated" timestamp.
export const REFERENCE_NOW = 1_700_000_000_000; // fixed ms epoch
export const TS_30S_AGO    = REFERENCE_NOW - 30_000;   // → threat-green  (<60s)
export const TS_90S_AGO    = REFERENCE_NOW - 90_000;   // → threat-amber  (60–180s)
export const TS_200S_AGO   = REFERENCE_NOW - 200_000;  // → threat-red    (>180s)

// ─── useWebSocket mock return values ─────────────────────────────────────────
// Usage: vi.mock("../hooks/useWebSocket", () => ({ default: () => wsConnectedMock }))
export const wsConnectedMock    = { messagesByType: {}, connected: true  };
export const wsDisconnectedMock = { messagesByType: {}, connected: false };

// ─── Layer prop variants ──────────────────────────────────────────────────────
export const emptyLayerProps = {
  fireHotspots: [],
  emberRisk:    [],
  crews:        [],
  shelters:     [],
  hospitals:    [],
  seismicGrid:  null,
};

export const populatedLayerProps = {
  fireHotspots: [
    { coordinates: [[34.07, -118.26], [34.08, -118.24], [34.06, -118.22]], label: "Test Fire Zone" },
  ],
  emberRisk: [
    { lat: 34.09, lng: -118.20, intensity: 0.7, radius: 12 },
  ],
  crews: [
    { lat: 34.05, lng: -118.24, crew_id: "C1", status: "available" },
  ],
  shelters: [
    { lat: 34.10, lng: -118.30, name: "Shelter A" },
  ],
  hospitals: [
    { lat: 34.06, lng: -118.22, name: "Hospital B" },
  ],
  seismicGrid: {
    epicenter: [34.2, -118.53],
    features: [
      {
        type: "Feature",
        properties: { damage_prob: 0.8 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-118.54, 34.19], [-118.52, 34.19],
            [-118.52, 34.21], [-118.54, 34.21],
            [-118.54, 34.19],
          ]],
        },
      },
    ],
  },
};

// ─── Counter update fixture ───────────────────────────────────────────────────
export const counterUpdate = {
  hotspots:       5,
  crewsActive:    3,
  damageZones:    2,
  sheltersCap:    0,
  hospitalsAlert: 1,
};
