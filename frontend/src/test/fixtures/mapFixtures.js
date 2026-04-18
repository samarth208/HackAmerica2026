// Mock data for MapPanel tests.

export const mapFixtures = {
  fireHotspots: [
    {
      coordinates: [
        [34.07, -118.26],
        [34.08, -118.24],
        [34.06, -118.22],
      ],
      label: "Fire Zone Alpha",
    },
    {
      coordinates: [
        [34.04, -118.28],
        [34.05, -118.25],
        [34.03, -118.23],
      ],
      label: "Fire Zone Beta",
    },
  ],

  emberRisk: [
    { lat: 34.09, lng: -118.20, intensity: 0.3, radius: 10 },
    { lat: 34.10, lng: -118.21, intensity: 0.65, radius: 14 },
    { lat: 34.11, lng: -118.19, intensity: 0.9, radius: 18 },
  ],

  seismicGrid: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { damage_prob: 0.1 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-118.30, 34.00], [-118.29, 34.00],
            [-118.29, 34.01], [-118.30, 34.01], [-118.30, 34.00],
          ]],
        },
      },
      {
        type: "Feature",
        properties: { damage_prob: 0.4 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-118.29, 34.00], [-118.28, 34.00],
            [-118.28, 34.01], [-118.29, 34.01], [-118.29, 34.00],
          ]],
        },
      },
      {
        type: "Feature",
        properties: { damage_prob: 0.7 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-118.28, 34.00], [-118.27, 34.00],
            [-118.27, 34.01], [-118.28, 34.01], [-118.28, 34.00],
          ]],
        },
      },
      {
        type: "Feature",
        properties: { damage_prob: 0.95 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-118.27, 34.00], [-118.26, 34.00],
            [-118.26, 34.01], [-118.27, 34.01], [-118.27, 34.00],
          ]],
        },
      },
    ],
  },

  crews: [
    { lat: 34.05, lng: -118.24, crew_id: "C1", status: "available" },
    { lat: 34.06, lng: -118.25, crew_id: "C2", status: "deployed" },
    { lat: 34.04, lng: -118.23, crew_id: "C3", status: "unavailable" },
  ],

  shelters: [
    { lat: 34.02, lng: -118.20, name: "Shelter A" },
    { lat: 34.03, lng: -118.22, name: "Shelter B" },
  ],

  hospitals: [
    { lat: 34.07, lng: -118.27, name: "LA General" },
    { lat: 34.05, lng: -118.30, name: "Cedar-Sinai" },
  ],
};

export const allLayersTrue = {
  firePerimeter:  true,
  emberRisk:      true,
  seismicDamage:  true,
  crews:          true,
  infrastructure: true,
};

export const allLayersFalse = {
  firePerimeter:  false,
  emberRisk:      false,
  seismicDamage:  false,
  crews:          false,
  infrastructure: false,
};
