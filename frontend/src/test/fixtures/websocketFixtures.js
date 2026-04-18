// Mock data and utilities for WebSocket wiring tests.

// ─── MockWebSocket ────────────────────────────────────────────────────────────
// Drop-in browser WebSocket replacement.
// Tests call lastInstance.emit(type, data) to simulate server messages.
export class MockWebSocket {
  static instances = [];
  static lastInstance = null;

  constructor(url) {
    this.url   = url;
    this.readyState = 1; // OPEN
    this.onopen    = null;
    this.onmessage = null;
    this.onclose   = null;
    this.onerror   = null;
    MockWebSocket.instances.push(this);
    MockWebSocket.lastInstance = this;
  }

  close() { this.readyState = 3; }

  /** Simulate a typed message arriving from the server. */
  emit(type, data) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) });
  }

  static reset() {
    MockWebSocket.instances  = [];
    MockWebSocket.lastInstance = null;
  }
}

// ─── Single-message fixtures ──────────────────────────────────────────────────
export const wsMessages = {
  seismic_grid: {
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

  fire_hotspots: [
    { coordinates: [[34.07, -118.26], [34.08, -118.24], [34.06, -118.22]], label: "WS Fire Zone Alpha" },
  ],

  ember_risk: [
    { lat: 34.09, lng: -118.20, intensity: 0.75, radius: 14 },
    { lat: 34.10, lng: -118.21, intensity: 0.40, radius: 10 },
  ],

  crew_update: [
    { lat: 34.05, lng: -118.24, crew_id: "WS-C1", status: "available" },
    { lat: 34.06, lng: -118.25, crew_id: "WS-C2", status: "deployed"  },
  ],

  action_card: {
    id:               "ws-ac-1",
    action_type:      "seismic_alert",
    resource_id:      "hospital-1",
    zone_id:          "z1",
    confidence:       0.87,
    rationale:        "WS action — seismic surge protocol",
    time_sensitivity: "high",
    created_at:       "2024-01-15T10:00:00.000Z",
  },

  event_log: {
    id:          "ws-ev-1",
    timestamp:   "2024-01-15T10:30:00.000Z",
    category:    "seismic",
    description: "M4.2 WS seismic event detected",
  },

  counter_update: {
    hotspots:       5,
    crewsActive:    3,
    damageZones:    2,
    sheltersCap:    0,
    hospitalsAlert: 1,
  },
};

// Second action_card for append test
export const wsActionCard2 = {
  id:               "ws-ac-2",
  action_type:      "evacuate",
  resource_id:      "zone-b",
  zone_id:          "z2",
  confidence:       0.91,
  rationale:        "WS second card — evacuation order",
  time_sensitivity: "high",
  created_at:       "2024-01-15T10:01:00.000Z",
};

// 101-entry event log for 100-cap test
export const wsEventLog101 = Array.from({ length: 101 }, (_, i) => ({
  id:          `ws-bulk-${i}`,
  timestamp:   new Date(Date.now() - i * 60_000).toISOString(),
  category:    ["fire", "seismic", "crew", "system"][i % 4],
  description: `WS bulk event ${101 - i}`,
}));
