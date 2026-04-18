-- Sentinel Actual SQLite schema

CREATE TABLE IF NOT EXISTS ember_risk_zones (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    probability REAL,
    particle_count INTEGER,
    hotspot_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS damage_zones (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    damage_probability REAL NOT NULL,
    liquefaction_class TEXT,
    event_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aip_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    confidence REAL,
    time_sensitivity TEXT,
    rationale TEXT,
    audio_cache BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seismic_events (
    id TEXT PRIMARY KEY,
    magnitude REAL NOT NULL,
    depth_km REAL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    event_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression_crews (
    id TEXT PRIMARY KEY,
    crew_identifier TEXT,
    lat REAL,
    lng REAL,
    status TEXT DEFAULT 'standby',
    capacity INTEGER,
    assigned_zone_id TEXT
);

CREATE TABLE IF NOT EXISTS shelters (
    id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lng REAL,
    occupancy INTEGER DEFAULT 0,
    capacity INTEGER,
    damage_zone_id TEXT
);

CREATE TABLE IF NOT EXISTS hospitals (
    id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lng REAL,
    current_capacity INTEGER,
    alert_level TEXT DEFAULT 'green',
    damage_zone_id TEXT
);

CREATE TABLE IF NOT EXISTS evacuation_routes (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'open',
    origin_zone_id TEXT,
    destination_zone_id TEXT
);
