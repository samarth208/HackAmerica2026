# SentinelActual — SQLite Schema Reference

All tables live in a single SQLite file (`sentinel.db`).  
Foreign keys are enforced via `PRAGMA foreign_keys = ON`.

---

## Table Index

| # | Table | Description |
|---|-------|-------------|
| 1 | [hotspots](#1-hotspots) | Raw fire-detection events from FIRMS/satellite |
| 2 | [ember_risk_zones](#2-ember_risk_zones) | Probabilistic ember-cast forecast cells |
| 3 | [seismic_events](#3-seismic_events) | Earthquake events ingested from USGS |
| 4 | [damage_zones](#4-damage_zones) | Grid-cell damage probability from seismic model |
| 5 | [suppression_crews](#5-suppression_crews) | Fire-suppression crew roster and locations |
| 6 | [shelters](#6-shelters) | Emergency shelter inventory |
| 7 | [hospitals](#7-hospitals) | Hospital capacity and alert state |
| 8 | [evacuation_routes](#8-evacuation_routes) | Evacuation route status between damage zones |
| 9 | [aip_actions](#9-aip_actions) | AI-planner action queue |
| 10 | [sessions](#10-sessions) | Singleton UI session state |
| 11 | [sync_log](#11-sync_log) | Pipeline sync health tracking |

---

## 1. hotspots

Stores raw fire-detection hotspots ingested by the FIRMS pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `lat` | REAL | NOT NULL | Latitude (WGS-84) |
| `lng` | REAL | NOT NULL | Longitude (WGS-84) |
| `frp` | REAL | NOT NULL | Fire Radiative Power (MW) |
| `confidence` | TEXT | NOT NULL | Satellite confidence class (`low`, `nominal`, `high`) |
| `detected_at` | TEXT | NOT NULL | ISO-8601 UTC detection timestamp |
| `source` | TEXT | DEFAULT `'FIRMS'` | Data source identifier |

---

## 2. ember_risk_zones

Probabilistic ember-spread forecast cells computed from an active hotspot.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `hotspot_id` | INTEGER | REFERENCES hotspots(id) | Parent hotspot |
| `lat` | REAL | NOT NULL | Cell centroid latitude |
| `lng` | REAL | NOT NULL | Cell centroid longitude |
| `probability` | REAL | NOT NULL | Ember-ignition probability `[0, 1]` |
| `forecast_ts` | TEXT | NOT NULL | ISO-8601 UTC forecast horizon |
| `geojson_cell` | TEXT | | GeoJSON geometry of the cell (serialised string) |

---

## 3. seismic_events

Earthquake events ingested from the USGS earthquake feed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `usgs_event_id` | TEXT | UNIQUE NOT NULL | USGS event identifier (e.g. `ci40123456`) |
| `magnitude` | REAL | NOT NULL | Moment magnitude (Mw) |
| `depth` | REAL | NOT NULL | Hypocentre depth (km) |
| `lat` | REAL | NOT NULL | Epicentre latitude |
| `lng` | REAL | NOT NULL | Epicentre longitude |
| `detected_at` | TEXT | NOT NULL | ISO-8601 UTC origin time |

---

## 4. damage_zones

Grid-cell damage probabilities computed by the seismic impact model.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `event_id` | INTEGER | REFERENCES seismic_events(id) | Parent seismic event |
| `grid_cell_id` | TEXT | NOT NULL | Identifier for the spatial grid cell |
| `lat` | REAL | NOT NULL | Cell centroid latitude |
| `lng` | REAL | NOT NULL | Cell centroid longitude |
| `damage_probability` | REAL | NOT NULL | Structural damage probability `[0, 1]` |
| `soil_type` | TEXT | | USCS soil classification (e.g. `SM`, `CL`) |
| `liquefaction_class` | TEXT | | Liquefaction susceptibility class |
| `computed_at` | TEXT | NOT NULL | ISO-8601 UTC computation timestamp |

---

## 5. suppression_crews

Fire-suppression crew roster with real-time location and assignment state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `crew_identifier` | TEXT | UNIQUE NOT NULL | Human-readable crew name (e.g. `Crew 1`) |
| `lat` | REAL | NOT NULL | Current latitude |
| `lng` | REAL | NOT NULL | Current longitude |
| `status` | TEXT | NOT NULL DEFAULT `'standby'` | Operational status (`standby`, `deployed`, `returning`) |
| `capacity` | INTEGER | NOT NULL DEFAULT `20` | Personnel headcount |
| `assigned_zone_id` | INTEGER | REFERENCES ember_risk_zones(id) | Active assignment |

**Seed data:** 8 crews (Crew 1–8) pre-seeded across LA County.

---

## 6. shelters

Emergency shelter sites with real-time occupancy.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `name` | TEXT | NOT NULL | Facility name |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `occupancy` | INTEGER | NOT NULL DEFAULT `0` | Current occupant count |
| `capacity` | INTEGER | NOT NULL DEFAULT `500` | Maximum capacity |
| `damage_zone_id` | INTEGER | REFERENCES damage_zones(id) | Associated damage zone (if applicable) |

**Seed data:** 4 real LA County shelter sites pre-seeded.

---

## 7. hospitals

Hospital capacity and alert level, updated by the coordination pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `name` | TEXT | NOT NULL | Hospital name |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `current_capacity` | INTEGER | NOT NULL DEFAULT `200` | Available bed count |
| `alert_level` | TEXT | NOT NULL DEFAULT `'normal'` | Alert level (`normal`, `elevated`, `critical`) |
| `damage_zone_id` | INTEGER | REFERENCES damage_zones(id) | Associated damage zone (if applicable) |

**Seed data:** 3 real hospitals near Northridge pre-seeded.

---

## 8. evacuation_routes

Directed evacuation corridors between damage zones.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `status` | TEXT | NOT NULL DEFAULT `'open'` | Route status (`open`, `congested`, `closed`) |
| `origin_zone_id` | INTEGER | REFERENCES damage_zones(id) | Origin damage zone |
| `destination_zone_id` | INTEGER | REFERENCES damage_zones(id) | Destination damage zone |

---

## 9. aip_actions

Actions queued or completed by the AI planner (AIP).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `action_type` | TEXT | NOT NULL | Action category (e.g. `deploy_crew`, `open_shelter`) |
| `resource_id` | INTEGER | | ID of the targeted resource (crew, shelter, hospital) |
| `zone_id` | INTEGER | | ID of the targeted zone |
| `confidence` | REAL | NOT NULL | Planner confidence score `[0, 1]` |
| `time_sensitivity` | TEXT | NOT NULL | Urgency class (`immediate`, `urgent`, `routine`) |
| `rationale` | TEXT | NOT NULL | Natural-language explanation from the planner |
| `status` | TEXT | NOT NULL DEFAULT `'pending'` | Lifecycle state (`pending`, `approved`, `rejected`, `executed`) |
| `created_at` | TEXT | NOT NULL | ISO-8601 UTC creation timestamp |
| `approved_at` | TEXT | | ISO-8601 UTC approval timestamp (NULL if not yet approved) |

---

## 10. sessions

Singleton row (id = 1) storing UI session state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY DEFAULT `1` | Always `1` (enforced by application) |
| `mute_state` | INTEGER | NOT NULL DEFAULT `0` | Audio mute flag (`0` = unmuted, `1` = muted) |
| `created_at` | TEXT | NOT NULL | ISO-8601 UTC session creation time |
| `last_active_at` | TEXT | NOT NULL | ISO-8601 UTC last-activity timestamp |

---

## 11. sync_log

Tracks the last successful run and current status of each data-ingestion pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key |
| `pipeline` | TEXT | NOT NULL | Pipeline name (`firms`, `usgs`, `weather`, `aip`, `simulate`) |
| `last_success_at` | TEXT | | ISO-8601 UTC timestamp of last successful run (NULL if never) |
| `status` | TEXT | NOT NULL DEFAULT `'unknown'` | Current status (`unknown`, `ok`, `error`) |

**Seed data:** Rows for all 5 pipelines pre-seeded with `status = 'unknown'`.

---

*Generated by `backend/db.py :: init_db()`.*
