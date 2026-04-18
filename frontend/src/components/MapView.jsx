// Read DESIGN.md before modifying.
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import * as colorScale from "../utils/colorScale";
import MapErrorBoundary from "./MapErrorBoundary";

const MAP_CENTER = [34.048, -118.235];
const MAP_ZOOM = 11;
const CA_BOUNDS = [[31.5, -125.5], [43.0, -113.0]];
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR = "Tiles &copy; Esri";

// Static impact zone for Northridge M6.7 event
const IMPACT_ZONE = [
  [34.092, -118.272], [34.100, -118.255], [34.103, -118.237],
  [34.100, -118.220], [34.090, -118.210], [34.076, -118.205],
  [34.062, -118.208], [34.050, -118.218], [34.040, -118.232],
  [34.037, -118.248], [34.040, -118.264], [34.050, -118.276],
  [34.062, -118.282], [34.076, -118.281], [34.092, -118.272],
];

// Inject seismic pulse animation once
const PULSE_ID = "aegis-seismic-pulse";
if (typeof document !== "undefined" && !document.getElementById(PULSE_ID)) {
  const s = document.createElement("style");
  s.id = PULSE_ID;
  s.textContent = `
    @keyframes aegis-pulse { from { opacity: 0.2; } to { opacity: 1; } }
    .aegis-cell-appear { animation: aegis-pulse 500ms ease-out 1 forwards; }
  `;
  document.head.appendChild(s);
}

function MapResizer() {
  const map = useMap();
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 0); return () => clearTimeout(t); }, [map]);
  return null;
}

function crewColor(status) {
  if (status === "deployed")    return "#f59e0b";
  if (status === "unavailable") return "#ef4444";
  return "#06b6d4";
}

function infraIcon(color, label = "") {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;background:${color};border:1.5px solid rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;font-size:7px;color:#fff;font-weight:700;">${label}</div>`,
    iconSize: [12, 12], iconAnchor: [6, 6],
  });
}

function centroid(coords) {
  const n = coords.length;
  return [coords.reduce((s, c) => s + c[1], 0) / n, coords.reduce((s, c) => s + c[0], 0) / n];
}

function dist([la1, ln1], [la2, ln2]) {
  return Math.sqrt((la1 - la2) ** 2 + (ln1 - ln2) ** 2);
}

function SeismicLayer({ seismicGrid, visible }) {
  const map = useMap();
  const lgRef = useRef(null);

  useEffect(() => {
    if (!map || !seismicGrid?.features?.length) return;
    lgRef.current?.clearLayers();
    if (!lgRef.current) lgRef.current = L.layerGroup().addTo(map);
    if (!visible) { lgRef.current.clearLayers(); return; }

    const epi = seismicGrid.epicenter ?? null;
    const sorted = epi
      ? [...seismicGrid.features].sort((a, b) => dist(centroid(a.geometry.coordinates[0]), epi) - dist(centroid(b.geometry.coordinates[0]), epi))
      : seismicGrid.features;

    sorted.forEach((feat, i) => {
      const prob = feat.properties?.damage_prob ?? 0;
      const color = colorScale.damageColor(prob);
      const layer = L.geoJSON(feat, {
        style: { fillColor: color, fillOpacity: 0, color: color, weight: 0.5, opacity: 0 },
      });
      setTimeout(() => {
        layer.setStyle({ fillOpacity: 0.45 + prob * 0.4, opacity: 0.6 });
        layer.eachLayer((l) => l.getElement?.()?.classList.add("aegis-cell-appear"));
        lgRef.current?.addLayer(layer);
      }, i * 40);
    });

    return () => { lgRef.current?.clearLayers(); };
  }, [map, seismicGrid, visible]);

  return null;
}

function DamageCircles({ cells = [], visible }) {
  if (!visible || cells.length === 0) return null;
  return cells.map((cell, i) => {
    const color = colorScale.damageColor(cell.damage_prob ?? cell.damage_probability ?? 0);
    return (
      <CircleMarker key={`d-${i}`} center={[cell.lat, cell.lng]} radius={5}
        pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 0 }} />
    );
  });
}

export default function MapView({
  fireHotspots = [], emberRisk = [], seismicGrid = null, damageCells = [],
  crews = [], shelters = [], hospitals = [],
  layerVisibility = { firePerimeter: true, emberRisk: true, seismicDamage: true, crews: true, infrastructure: true },
}) {
  return (
    <div className="w-full h-full">
      <MapErrorBoundary>
        <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} minZoom={6}
          maxBounds={CA_BOUNDS} maxBoundsViscosity={1.0}
          style={{ width: "100%", height: "100%", background: "#030712" }}
          zoomControl={true}>
          <MapResizer />
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />

          {/* Impact zone */}
          <Polygon positions={IMPACT_ZONE}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.15, weight: 1.5, opacity: 0.6, dashArray: "4 4" }} />

          {/* Fire perimeters */}
          {layerVisibility.firePerimeter && fireHotspots.map((h, i) => (
            <Polygon key={`f-${i}`} positions={h.coordinates}
              pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.3, weight: 1.5 }}>
              {h.label && <Popup>{h.label}</Popup>}
            </Polygon>
          ))}

          {/* Ember risk */}
          {layerVisibility.emberRisk && emberRisk.map((p, i) => (
            <CircleMarker key={`e-${i}`} center={[p.lat, p.lng]} radius={p.radius ?? 11}
              pathOptions={{ color: colorScale.emberColor(p.intensity ?? 0.5), fillColor: colorScale.emberColor(p.intensity ?? 0.5), fillOpacity: 0.35 + (p.intensity ?? 0.5) * 0.4, weight: 0 }} />
          ))}

          {/* Seismic damage GeoJSON */}
          <SeismicLayer seismicGrid={seismicGrid} visible={layerVisibility.seismicDamage} />
          <DamageCircles cells={damageCells} visible={layerVisibility.seismicDamage} />

          {/* Crews */}
          {layerVisibility.crews && crews.map((c, i) => (
            <CircleMarker key={`c-${i}`} center={[c.lat, c.lng]} radius={7}
              pathOptions={{ color: "#f1f5f9", fillColor: crewColor(c.status), fillOpacity: 1, weight: 1.5 }}>
              <Popup><span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.crew_identifier ?? c.crew_id} — {c.status}</span></Popup>
            </CircleMarker>
          ))}

          {/* Infrastructure */}
          {layerVisibility.infrastructure && <>
            {shelters.map((s, i) => (
              <Marker key={`s-${i}`} position={[s.lat, s.lng]} icon={infraIcon("#06b6d4")}>
                <Popup>{s.name ?? `Shelter ${i + 1}`}</Popup>
              </Marker>
            ))}
            {hospitals.map((h, i) => (
              <Marker key={`h-${i}`} position={[h.lat, h.lng]} icon={infraIcon("#ef4444", "+")}>
                <Popup>{h.name ?? `Hospital ${i + 1}`}</Popup>
              </Marker>
            ))}
          </>}
        </MapContainer>
      </MapErrorBoundary>
    </div>
  );
}
