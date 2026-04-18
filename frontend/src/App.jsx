// Read DESIGN.md before modifying.
import { useState } from "react";
import Header from "./components/Header";
import MapView from "./components/MapView";
import ThreatPanel from "./components/ThreatPanel";
import ActionQueue from "./components/ActionQueue";
import EventFeed from "./components/EventFeed";
import LayerControls from "./components/LayerControls";
import StatusBar from "./components/StatusBar";
import MapErrorBoundary from "./components/MapErrorBoundary";
import useWebSocket from "./hooks/useWebSocket";

const WS_URL = (import.meta.env.VITE_WS_URL ?? "ws://localhost:8000") + "/ws";

const DEFAULT_LAYERS = {
  firePerimeter:  true,
  emberRisk:      true,
  seismicDamage:  true,
  crews:          true,
  infrastructure: true,
};

export default function App() {
  const { messagesByType, actionCards, eventLog, damageCells, connected } = useWebSocket(WS_URL);

  const seismicGrid  = messagesByType.seismic_grid  ?? null;
  const fireHotspots = messagesByType.fire_hotspots ?? [];
  const emberRisk    = messagesByType.ember_risk     ?? [];
  const crews        = messagesByType.crew_update    ?? [];
  const shelters     = messagesByType.infrastructure?.shelters  ?? [];
  const hospitals    = messagesByType.infrastructure?.hospitals ?? [];

  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [simulating, setSimulating] = useState(false);
  const [simOverlay, setSimOverlay] = useState(false);

  function toggleLayer(key) {
    setLayers((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSimulate() {
    if (simulating) return;
    setSimulating(true);
    setSimOverlay(true);
    const minEnd = Date.now() + 1200;
    try {
      await fetch(`${import.meta.env.VITE_BACKEND_URL ?? ""}/api/simulate`, { method: "POST" });
    } catch (e) {
      console.warn("[aegis] simulate failed:", e);
    } finally {
      const rem = minEnd - Date.now();
      if (rem > 0) await new Promise((r) => setTimeout(r, rem));
      setSimulating(false);
      setSimOverlay(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-bg font-ui overflow-hidden">

      <Header connected={connected} simulating={simulating} onSimulate={handleSimulate} />

      <div className="flex flex-1 overflow-hidden">

        {/* Left: threat summary panel */}
        <ThreatPanel />

        {/* Center: map + layer controls */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <div className="relative flex-1 overflow-hidden">
            <MapView
              fireHotspots={fireHotspots}
              emberRisk={emberRisk}
              seismicGrid={seismicGrid}
              damageCells={damageCells}
              crews={crews}
              shelters={shelters}
              hospitals={hospitals}
              layerVisibility={layers}
            />

            {/* Simulation overlay */}
            {simOverlay && (
              <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center"
                style={{ background: "rgba(3,7,18,0.80)", backdropFilter: "blur(4px)" }}>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-threat-red/40 border-t-threat-red animate-spin" />
                  <div className="text-center">
                    <p className="font-data font-bold text-text-primary uppercase tracking-widest mb-1" style={{ fontSize: 13 }}>
                      RUNNING SIMULATION
                    </p>
                    <p className="font-ui text-text-muted" style={{ fontSize: 12 }}>
                      Northridge M6.7 · GMPE damage grid · action engine
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <LayerControls layerVisibility={layers} onToggleLayer={toggleLayer} />
        </div>

        {/* Right: action queue + event feed */}
        <div className="flex flex-col bg-surface border-l border-border shrink-0 overflow-hidden"
          style={{ width: 280 }}>
          <ActionQueue actionCards={actionCards} />
          <EventFeed eventLog={eventLog} />
        </div>

      </div>

      <StatusBar />
    </div>
  );
}
