# SentinelActual — API Route Reference

All routes are mounted under the `/api` prefix.  
Every stub returns **HTTP 200** with JSON. Fields marked `null` or `[]` will be populated once the real pipeline logic is wired in.

---

## Table of Contents

| Router file | Endpoints |
|-------------|-----------|
| [hotspots.py](#hotspotspy) | `GET /api/hotspots` |
| [damage.py](#damagepy) | `GET /api/damage-zones`, `POST /api/simulate` |
| [crews.py](#crewspy) | `GET /api/crews`, `PATCH /api/crews/{crew_id}` |
| [actions.py](#actionspy) | `GET /api/actions`, `POST /api/actions`, `PATCH /api/actions/{action_id}/approve`, `PATCH /api/actions/{action_id}/dismiss` |
| [infrastructure.py](#infrastructurepy) | `GET /api/shelters`, `GET /api/hospitals`, `GET /api/evacuation-routes` |
| [session.py](#sessionpy) | `GET /api/session`, `PATCH /api/session` |
| [status.py](#statuspy) | `GET /api/counters`, `GET /api/sync-status` |

---

## hotspots.py

### `GET /api/hotspots`

Returns all active fire hotspots detected by FIRMS.

**Request body:** none

**Response `200`**
```json
{
  "hotspots": [],
  "count": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `hotspots` | array | List of hotspot objects |
| `count` | integer | Total number of hotspots returned |

---

## damage.py

### `GET /api/damage-zones`

Returns damage-zone grid cells for a seismic event.

**Request body:** none

**Response `200`**
```json
{
  "zones": [],
  "event_id": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `zones` | array | List of damage-zone objects |
| `event_id` | integer \| null | USGS seismic event ID the zones belong to |

---

### `POST /api/simulate`

Triggers a synthetic disaster simulation run.

**Request body:** _(none required for stub; will accept simulation parameters when implemented)_

**Response `200`**
```json
{
  "status": "stub"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Simulation status message |

---

## crews.py

### `GET /api/crews`

Returns all suppression crews with their current location and status.

**Request body:** none

**Response `200`**
```json
{
  "crews": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `crews` | array | List of crew objects |

---

### `PATCH /api/crews/{crew_id}`

Updates the status or assignment of a specific crew.

**Path parameter:** `crew_id` — integer crew ID

**Request body:** _(will accept partial crew fields when implemented)_

**Response `200`**
```json
{
  "status": "updated"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Confirmation that the crew record was updated |

---

## actions.py

### `GET /api/actions`

Returns the AI-planner action queue.

**Request body:** none

**Response `200`**
```json
{
  "actions": [],
  "pending_count": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `actions` | array | List of AIP action objects |
| `pending_count` | integer | Number of actions awaiting approval |

---

### `POST /api/actions`

Creates a new AI-planner action.

**Request body:** _(will accept action fields when implemented)_

**Response `200`**
```json
{
  "id": 0,
  "status": "created"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | ID of the newly created action |
| `status` | string | Creation confirmation |

---

### `PATCH /api/actions/{action_id}/approve`

Approves a pending AI-planner action.

**Path parameter:** `action_id` — integer action ID

**Request body:** none

**Response `200`**
```json
{
  "status": "approved"
}
```

---

### `PATCH /api/actions/{action_id}/dismiss`

Dismisses (rejects) a pending AI-planner action.

**Path parameter:** `action_id` — integer action ID

**Request body:** none

**Response `200`**
```json
{
  "status": "dismissed"
}
```

---

## infrastructure.py

### `GET /api/shelters`

Returns all emergency shelter sites with occupancy.

**Request body:** none

**Response `200`**
```json
{
  "shelters": []
}
```

---

### `GET /api/hospitals`

Returns all tracked hospitals with capacity and alert level.

**Request body:** none

**Response `200`**
```json
{
  "hospitals": []
}
```

---

### `GET /api/evacuation-routes`

Returns all evacuation route statuses.

**Request body:** none

**Response `200`**
```json
{
  "routes": []
}
```

---

## session.py

### `GET /api/session`

Returns the current UI session state (singleton, id always `1`).

**Request body:** none

**Response `200`**
```json
{
  "id": 1,
  "mute_state": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Session ID (always `1`) |
| `mute_state` | boolean | Whether audio alerts are muted |

---

### `PATCH /api/session`

Updates session state (e.g. toggle mute).

**Request body:** _(will accept `mute_state` when implemented)_

**Response `200`**
```json
{
  "id": 1,
  "mute_state": false
}
```

---

## status.py

### `GET /api/counters`

Returns dashboard summary counters.

**Request body:** none

**Response `200`**
```json
{
  "active_hotspots": 0,
  "crews_deployed": 0,
  "crews_total": 8,
  "damage_zones_above_threshold": 0,
  "shelters_at_capacity": 0,
  "hospitals_on_alert": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `active_hotspots` | integer | Hotspots currently active |
| `crews_deployed` | integer | Crews with status `deployed` |
| `crews_total` | integer | Total crews in the roster |
| `damage_zones_above_threshold` | integer | Zones with `damage_probability > 0.5` |
| `shelters_at_capacity` | integer | Shelters where `occupancy >= capacity` |
| `hospitals_on_alert` | integer | Hospitals with `alert_level != 'normal'` |

---

### `GET /api/sync-status`

Returns the last-sync health for each data-ingestion pipeline.

**Request body:** none

**Response `200`**
```json
{
  "firms":   { "last_success": null, "status": "unknown" },
  "usgs":    { "last_success": null, "status": "unknown" },
  "weather": { "last_success": null, "status": "unknown" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `last_success` | string \| null | ISO-8601 UTC timestamp of last successful run |
| `status` | string | Pipeline status (`unknown`, `ok`, `error`) |

---

*Implemented in `backend/main.py`. Routers live in `backend/routers/`.*
