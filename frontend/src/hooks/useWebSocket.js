// WebSocket hook — connects to backend, parses { type, data } messages.
// Replace-semantics types land in messagesByType keyed by type.
// Accumulate-semantics types (action_card, event_log, damage_cell) are managed here.
// Reconnects automatically on disconnect (3s backoff).
import { useState, useEffect, useRef } from "react";

const MAX_EVENT_LOG   = 100;
const MAX_DAMAGE_CELLS = 2000;

export default function useWebSocket(url) {
  const [messagesByType, setMessagesByType] = useState({});
  const [actionCards,    setActionCards]    = useState([]);
  const [eventLog,       setEventLog]       = useState([]);
  const [damageCells,    setDamageCells]    = useState([]);
  const [connected,      setConnected]      = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    cancelRef.current = false;
    let ws = null, retryTimer = null;

    function connect() {
      try { ws = new WebSocket(url); } catch (e) { console.warn("[ws] construct error:", e); return; }

      ws.onopen  = () => { if (!cancelRef.current) setConnected(true); };
      ws.onclose = (e) => {
        if (cancelRef.current) return;
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {};

      ws.onmessage = (event) => {
        if (cancelRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (!msg?.type) return;

          if (msg.type === "action_card") {
            const items = Array.isArray(msg.data) ? msg.data : [msg.data];
            setActionCards((p) => [...p, ...items]);
          } else if (msg.type === "event_log") {
            const items = Array.isArray(msg.data) ? msg.data : [msg.data];
            setEventLog((p) => [...items, ...p].slice(0, MAX_EVENT_LOG));
          } else if (msg.type === "damage_cell") {
            const items = Array.isArray(msg.data) ? msg.data : [msg.data];
            setDamageCells((p) => [...p, ...items].slice(-MAX_DAMAGE_CELLS));
          } else if (msg.type === "seismic_grid") {
            setMessagesByType((p) => ({ ...p, seismic_grid: msg.data }));
            const cells = (Array.isArray(msg.data) ? msg.data : []).slice(-MAX_DAMAGE_CELLS);
            setDamageCells(cells);
          } else {
            setMessagesByType((p) => ({ ...p, [msg.type]: msg.data }));
          }
        } catch (err) {
          console.warn("[ws] parse error:", err);
        }
      };
    }

    connect();
    return () => {
      cancelRef.current = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [url]);

  return { messagesByType, actionCards, eventLog, damageCells, connected };
}
