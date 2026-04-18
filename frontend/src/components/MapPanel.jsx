// Read DESIGN.md and CLAUDE.md before modifying.
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import * as colorScale from "../utils/colorScale";
import MapErrorBoundary from "./MapErrorBoundary";

// ─── DESIGN.md token constants (never use hex inline below) ───────────────────
const TOKEN = {
  threatGreen:  "#f8fafc",
  threatAmber:  "#ef4444",
  threatOrange: "#ef4444",
  threatRed:    "#ef4444",
  threatPurple: "#a855f7",
  accent:       "#2563eb",
  bg:           "#020617",
  surface:      "#0e1223",
  border:       "#334155",
  textPrimary:  "#f8fafc",
  textMuted:    "#94a3b8",
};

const MAP_CENTER  = [34.048, -118.235];
const MAP_ZOOM    = 12;
const MAP_MIN_ZOOM = 6;   // zoom 6 ≈ all of California visible
// California bounding box with padding so the view never shows the world
const CA_BOUNDS   = [[31.5, -125.5], [43.0, -113.0]];

// ESRI World Imagery — satellite tiles, free, no API key required
const TILE_URL  = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR = "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

// Static demo impact zone — irregular blob centered on downtown LA (Mag 7.2 event)
const DEMO_IMPACT_ZONE = [
  [34.092, -118.272],
  [34.100, -118.255],
  [34.103, -118.237],
  [34.100, -118.220],
  [34.090, -118.210],
  [34.076, -118.205],
  [34.062, -118.208],
  [34.050, -118.218],
  [34.040, -118.232],
  [34.037, -118.248],
  [34.040, -118.264],
  [34.050, -118.276],
  [34.062, -118.282],
  [34.076, -118.281],
  [34.092, -118.272],
];

// ─── MapResizer — calls invalidateSize on mount so Leaflet detects flex height ─
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    // Defer one tick so the flex container has its final dimensions
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// ─── Seismic cell pulse animation ─────────────────────────────────────────────
// Injected once; uses no hardcoded colors — opacity only.
const PULSE_STYLE_ID = "aegis-seismic-pulse";
if (typeof document !== "undefined" && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes seismic-pulse {
      from { opacity: 0.4; }
      to   { opacity: 1;   }
    }
    .seismic-cell-appear {
      animation: seismic-pulse 600ms ease-out 1 forwards;
    }
  `;
  document.head.appendChild(style);
}

// ─── Crew status → color ──────────────────────────────────────────────────────
function crewColor(status) {
  switch (status) {
    case "available":   return TOKEN.accent;
    case "deployed":    return TOKEN.threatAmber;
    case "unavailable": return TOKEN.threatRed;
    default:            return TOKEN.textMuted;
  }
}

// ─── Square DivIcon for infrastructure markers ────────────────────────────────
function squareIcon(color, label = "") {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border:2px solid ${TOKEN.textPrimary};
      display:flex;align-items:center;justify-content:center;
      font-size:8px;color:${TOKEN.textPrimary};font-weight:700;
    ">${label}</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ─── Geometry helpers ──────────────────────────────────────────────────────────
function polygonCentroid(geometry) {
  const coords = geometry.coordinates[0]; // outer ring
  const n = coords.length;
  const lng = coords.reduce((s, c) => s + c[0], 0) / n;
  const lat = coords.reduce((s, c) => s + c[1], 0) / n;
  return [lat, lng]; // [lat, lng] like Leaflet expects
}

function euclideanDist([lat1, lng1], [lat2, lng2]) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
}

// ─── Seismic animation controller ─────────────────────────────────────────────
// Animates cells outward from seismicGrid.epicenter [lat, lng] if provided,
// otherwise falls back to array-index order.
function SeismicLayer({ seismicGrid, visible }) {
  const map = useMap();
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (!map || !seismicGrid?.features?.length) return;

    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    } else {
      layerGroupRef.current = L.layerGroup().addTo(map);
    }

    if (!visible) {
      layerGroupRef.current.clearLayers();
      return;
    }

    const epicenter = seismicGrid.epicenter ?? null; // [lat, lng] or null

    // Sort features nearest→farthest from epicenter so cells ripple outward
    const sorted = epicenter
      ? [...seismicGrid.features].sort((a, b) => {
          const ca = polygonCentroid(a.geometry);
          const cb = polygonCentroid(b.geometry);
          return euclideanDist(ca, epicenter) - euclideanDist(cb, epicenter);
        })
      : seismicGrid.features;

    sorted.forEach((feature, i) => {
      const prob = feature.properties?.damage_prob ?? 0;
      const color = colorScale.damageColor(prob);

      const layer = L.geoJSON(feature, {
        style: {
          fillColor:   color,
          fillOpacity: 0.5 + prob * 0.35,
          color:       color,
          weight:      0.5,
          opacity:     0.6,
        },
        onEachFeature: (_feat, featureLayer) => {
          // Add pulse class to each SVG path element on creation
          featureLayer.on("add", () => {
            featureLayer.getElement?.()?.classList.add("seismic-cell-appear");
          });
        },
      });

      // Start hidden; reveal with staggered delay (50 ms per rank from epicenter)
      layer.setStyle({ fillOpacity: 0, opacity: 0 });

      setTimeout(() => {
        layer.setStyle({ fillOpacity: 0.5 + prob * 0.35, opacity: 0.6 });
        layerGroupRef.current?.addLayer(layer);
      }, i * 50);
    });

    return () => {
      layerGroupRef.current?.clearLayers();
    };
  }, [map, seismicGrid, visible]);

  return null;
}

// ─── Damage circle layer — individual cells from WebSocket damage_cell stream ──
function DamageCircleLayer({ damageCells = [], visible }) {
  if (!visible || damageCells.length === 0) return null;
  return damageCells.map((cell, i) => {
    const color = colorScale.damageColor(cell.damage_prob ?? 0);
    return (
      <CircleMarker
        key={`dmg-${i}`}
        center={[cell.lat, cell.lng]}
        radius={5}
        pathOptions={{
          color:       color,
          fillColor:   color,
          fillOpacity: 0.65,
          weight:      0,
        }}
      />
    );
  });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MapPanel({
  fireHotspots   = [],
  emberRisk      = [],
  seismicGrid    = null,
  damageCells    = [],
  crews          = [],
  shelters       = [],
  hospitals      = [],
  onToggleLayer,
  layerVisibility = {
    firePerimeter:  true,
    emberRisk:      true,
    seismicDamage:  true,
    crews:          true,
    infrastructure: true,
  },
}) {
  return (
    <div className="w-full h-full relative">

      <MapErrorBoundary>
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        minZoom={MAP_MIN_ZOOM}
        maxBounds={CA_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ width: "100%", height: "100%", background: TOKEN.bg }}
        zoomControl={true}
      >
        {/* Fix: call invalidateSize after flex layout settles */}
        <MapResizer />

        {/* Dark basemap */}
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} />

        {/* Demo impact zone — always visible, matches Mag 7.2 scenario */}
        <Polygon
          positions={DEMO_IMPACT_ZONE}
          pathOptions={{
            color:       TOKEN.threatRed,
            fillColor:   TOKEN.threatRed,
            fillOpacity: 0.22,
            weight:      2,
            opacity:     0.7,
          }}
        />

        {/* 1. Fire perimeter */}
        {layerVisibility.firePerimeter &&
          fireHotspots.map((hotspot, i) => (
            <Polygon
              key={`fire-${i}`}
              positions={hotspot.coordinates}
              pathOptions={{
                color:       TOKEN.threatRed,
                fillColor:   TOKEN.threatRed,
                fillOpacity: 0.3,
                weight:      1.5,
              }}
            >
              {hotspot.label && <Popup>{hotspot.label}</Popup>}
            </Polygon>
          ))}

        {/* 2. Ember risk */}
        {layerVisibility.emberRisk &&
          emberRisk.map((point, i) => (
            <CircleMarker
              key={`ember-${i}`}
              center={[point.lat, point.lng]}
              radius={point.radius ?? 12}
              pathOptions={{
                color:       colorScale.emberColor(point.intensity ?? 0.5),
                fillColor:   colorScale.emberColor(point.intensity ?? 0.5),
                fillOpacity: 0.4 + (point.intensity ?? 0.5) * 0.4,
                weight:      0,
              }}
            />
          ))}

        {/* 3. Seismic damage — animated GeoJSON polygons */}
        <SeismicLayer
          seismicGrid={seismicGrid}
          visible={layerVisibility.seismicDamage}
        />

        {/* 3b. Live damage cells — individual circles from WebSocket stream */}
        <DamageCircleLayer
          damageCells={damageCells}
          visible={layerVisibility.seismicDamage}
        />

        {/* 4. Crews */}
        {layerVisibility.crews &&
          crews.map((crew, i) => (
            <CircleMarker
              key={`crew-${i}`}
              center={[crew.lat, crew.lng]}
              radius={8}
              pathOptions={{
                color:       TOKEN.textPrimary,
                fillColor:   crewColor(crew.status),
                fillOpacity: 1,
                weight:      2,
              }}
            >
              <Popup>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                  {crew.crew_id} — {crew.status}
                </span>
              </Popup>
            </CircleMarker>
          ))}

        {/* 5. Infrastructure — shelters + hospitals */}
        {layerVisibility.infrastructure && <>
          {shelters.map((s, i) => (
            <Marker
              key={`shelter-${i}`}
              position={[s.lat, s.lng]}
              icon={squareIcon(TOKEN.accent)}
            >
              <Popup>{s.name ?? `Shelter ${i + 1}`}</Popup>
            </Marker>
          ))}
          {hospitals.map((h, i) => (
            <Marker
              key={`hospital-${i}`}
              position={[h.lat, h.lng]}
              icon={squareIcon(TOKEN.threatRed, "+")}
            >
              <Popup>{h.name ?? `Hospital ${i + 1}`}</Popup>
            </Marker>
          ))}
        </>}

      </MapContainer>
      </MapErrorBoundary>
    </div>
  );
}
