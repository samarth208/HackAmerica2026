# AEGIS — Disaster Response Dashboard

Real-time multi-hazard monitoring and AI-assisted resource coordination for incident commanders.

---

## What it does

AEGIS fuses three live data streams into a single high-contrast command dashboard:

| Stream | Source | What you see |
|---|---|---|
| Wildfire hotspots | NASA FIRMS (MAP KEY) | Fire perimeters + ember landing zones |
| Seismic events | USGS GeoJSON feed | Damage probability grid (GMPE) |
| Resource coordination | SQLite state | Crew positions, shelters, hospitals |

Pressing **▶ SIMULATE CRISIS** replays the 1994 Northridge M6.7 earthquake — runs the GMPE damage pipeline, broadcasts the grid over WebSocket, and generates AI action recommendations in under 2 seconds.

---

## Stack

**Frontend** — React 18 · Vite · Tailwind CSS · react-leaflet · Lucide icons

**Backend** — FastAPI · SQLite (aiosqlite) · NumPy (GMPE + ember sim) · WebSockets

---

## Project structure

```
aegis/
├── frontend/                  React + Vite dashboard
│   └── src/
│       ├── App.jsx            Main layout shell
│       ├── components/
│       │   ├── Header.jsx     Top bar — brand, threat level, simulate button
│       │   ├── ThreatPanel.jsx  Left sidebar — incident summary + metrics
│       │   ├── MapView.jsx    Leaflet map — 5 data layers
│       │   ├── ActionQueue.jsx  Right panel — AI action cards
│       │   ├── EventFeed.jsx  Right panel — chronological event log
│       │   ├── LayerControls.jsx  Layer toggle pills (below map)
│       │   └── StatusBar.jsx  Bottom counter strip
│       ├── hooks/
│       │   └── useWebSocket.js  WS connection + message dispatch
│       └── utils/
│           └── colorScale.js  damage/ember color interpolation
└── backend/                   FastAPI + SQLite
    ├── main.py                FastAPI app + WebSocket endpoint
    ├── config.py              Environment config (no Palantir/ElevenLabs)
    ├── db.py                  SQLite schema + seeds
    ├── ai/
    │   ├── damage_grid.py     BA08 GMPE → damage probability grid
    │   ├── ember_simulation.py  NumPy particle ember advection
    │   ├── northridge_data.py   Precomputed M6.7 grid (startup)
    │   └── action_engine.py   Rule-based action card generator
    ├── routers/
    │   ├── damage.py          POST /api/simulate  DELETE /api/simulate/reset
    │   ├── actions.py         GET/POST/PATCH /api/actions
    │   ├── crews.py           GET/PATCH /api/crews
    │   ├── hotspots.py        GET /api/hotspots
    │   ├── seismic.py         GET /api/seismic  GET /api/damage-zones
    │   ├── infrastructure.py  GET /api/shelters  GET /api/hospitals
    │   ├── status.py          GET /api/counters  GET /api/sync-status
    │   └── session.py         GET/PATCH /api/session
    └── services/
        └── ws_broadcaster.py  WebSocket connection manager + typed broadcast helpers
```

---

## Running locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

Copy `frontend/.env.example` → `frontend/.env.development` and `backend/.env.example` → `backend/.env`.

---

## Demo flow

1. Open `http://localhost:5173`
2. Press **▶ SIMULATE CRISIS** in the top-right header
3. Watch the damage grid animate outward from Northridge on the map
4. Three AI action cards appear in the right panel — Approve or Dismiss each
5. The event feed logs the simulation result
6. Counters in the bottom status bar update

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | System health check |
| `POST` | `/api/simulate` | Run Northridge M6.7 replay |
| `DELETE` | `/api/simulate/reset` | Clear simulation data |
| `GET` | `/api/hotspots` | Fire hotspots |
| `GET` | `/api/seismic` | Seismic events |
| `GET` | `/api/damage-zones` | Damage probability cells |
| `GET` | `/api/crews` | Suppression crew roster |
| `GET` | `/api/actions` | Pending action cards |
| `PATCH` | `/api/actions/:id/approve` | Approve an action |
| `PATCH` | `/api/actions/:id/dismiss` | Dismiss an action |
| `GET` | `/api/shelters` | Emergency shelters |
| `GET` | `/api/hospitals` | Hospital status |
| `GET` | `/api/counters` | Dashboard counters |
| `WS` | `/ws` | Real-time event stream |

---

## What was removed from the original codebase

- **Palantir Foundry / AIP** — ontology sync, AIP Agent Studio calls, Foundry API client
- **ElevenLabs TTS** — voice synthesis hook and backend client
- **PyTorch CNN** — seismic damage model (replaced with pure NumPy GMPE)
- **Apache Kafka / Flink** — streaming infrastructure
- **Apache Spark / Delta Lake** — batch processing
- **Feast feature store** — feature definitions and assembler
- **AMD ROCm GPU telemetry** — Kafka producer and training dashboard
- **Training / Model Registry / Inference / Agent Chat pages** — removed entirely
- **All test files** — unit tests, e2e tests, Playwright config
- **Legacy documentation** — AGENTS.md, DECISIONS.md, PROGRESS.md, BLOCKERS.md, etc.
