import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "aegis.db"))


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS hotspots (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            lat         REAL    NOT NULL,
            lng         REAL    NOT NULL,
            frp         REAL    NOT NULL,
            confidence  TEXT    NOT NULL,
            detected_at TEXT    NOT NULL,
            source      TEXT    DEFAULT 'FIRMS'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ember_risk_zones (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            hotspot_id   INTEGER REFERENCES hotspots(id),
            lat          REAL    NOT NULL,
            lng          REAL    NOT NULL,
            probability  REAL    NOT NULL,
            forecast_ts  TEXT    NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS seismic_events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            usgs_event_id TEXT    UNIQUE NOT NULL,
            magnitude     REAL    NOT NULL,
            depth         REAL    NOT NULL,
            lat           REAL    NOT NULL,
            lng           REAL    NOT NULL,
            detected_at   TEXT    NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS damage_zones (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id           INTEGER REFERENCES seismic_events(id),
            grid_cell_id       TEXT    NOT NULL,
            lat                REAL    NOT NULL,
            lng                REAL    NOT NULL,
            damage_probability REAL    NOT NULL,
            liquefaction_class TEXT,
            computed_at        TEXT    NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS suppression_crews (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            crew_identifier  TEXT    UNIQUE NOT NULL,
            lat              REAL    NOT NULL,
            lng              REAL    NOT NULL,
            status           TEXT    NOT NULL DEFAULT 'standby',
            capacity         INTEGER NOT NULL DEFAULT 20
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS shelters (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT    NOT NULL,
            lat       REAL    NOT NULL,
            lng       REAL    NOT NULL,
            occupancy INTEGER NOT NULL DEFAULT 0,
            capacity  INTEGER NOT NULL DEFAULT 500
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS hospitals (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT    NOT NULL,
            lat              REAL    NOT NULL,
            lng              REAL    NOT NULL,
            current_capacity INTEGER NOT NULL DEFAULT 200,
            alert_level      TEXT    NOT NULL DEFAULT 'normal'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS actions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type      TEXT    NOT NULL,
            resource_id      INTEGER,
            zone_id          INTEGER,
            confidence       REAL    NOT NULL,
            time_sensitivity TEXT    NOT NULL,
            rationale        TEXT    NOT NULL,
            status           TEXT    NOT NULL DEFAULT 'pending',
            created_at       TEXT    NOT NULL,
            approved_at      TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id             INTEGER PRIMARY KEY DEFAULT 1,
            created_at     TEXT    NOT NULL,
            last_active_at TEXT    NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sync_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pipeline        TEXT    NOT NULL,
            last_success_at TEXT,
            status          TEXT    NOT NULL DEFAULT 'unknown'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS event_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            source     TEXT    NOT NULL,
            message    TEXT    NOT NULL,
            created_at TEXT    NOT NULL
        )
    """)

    # Seed: suppression crews across LA County
    crews = [
        ("Crew Alpha",   34.052,  -118.243),
        ("Crew Bravo",   34.147,  -118.445),
        ("Crew Charlie", 34.063,  -118.358),
        ("Crew Delta",   34.197,  -118.532),
        ("Crew Echo",    34.096,  -118.290),
        ("Crew Foxtrot", 34.331,  -118.480),
        ("Crew Golf",    34.018,  -118.693),
        ("Crew Hotel",   34.239,  -118.246),
    ]
    cur.executemany(
        "INSERT OR IGNORE INTO suppression_crews (crew_identifier, lat, lng, status, capacity) VALUES (?, ?, ?, 'standby', 20)",
        crews,
    )

    # Seed: shelters
    shelters = [
        ("Pierce College Emergency Shelter",  34.1688, -118.5741),
        ("Pasadena Convention Center",        34.1425, -118.1506),
        ("Pomona Fairplex Emergency Shelter", 34.0558, -117.7525),
        ("Crenshaw Christian Center",         33.9952, -118.3218),
    ]
    cur.executemany(
        "INSERT OR IGNORE INTO shelters (name, lat, lng, occupancy, capacity) VALUES (?, ?, ?, 0, 500)",
        shelters,
    )

    # Seed: hospitals
    hospitals = [
        ("Northridge Hospital Medical Center",             34.2281, -118.5367),
        ("Providence Cedars-Sinai Tarzana Medical Center", 34.1686, -118.5485),
        ("Kaiser Permanente Woodland Hills",               34.1714, -118.6042),
    ]
    cur.executemany(
        "INSERT OR IGNORE INTO hospitals (name, lat, lng, current_capacity, alert_level) VALUES (?, ?, ?, 200, 'normal')",
        hospitals,
    )

    # Seed: sync_log
    for p in ["firms", "usgs", "weather", "simulate"]:
        if not cur.execute("SELECT id FROM sync_log WHERE pipeline = ? LIMIT 1", (p,)).fetchone():
            cur.execute("INSERT INTO sync_log (pipeline, status) VALUES (?, 'unknown')", (p,))

    conn.commit()
    conn.close()


import aiosqlite as _aiosqlite


async def get_db() -> _aiosqlite.Connection:
    db = await _aiosqlite.connect(DB_PATH)
    db.row_factory = _aiosqlite.Row
    return db
