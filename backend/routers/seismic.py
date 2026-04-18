from fastapi import APIRouter
from backend.db import get_connection

router = APIRouter()


@router.get("/api/seismic")
async def get_seismic_events():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, usgs_event_id, magnitude, depth, lat, lng, detected_at FROM seismic_events ORDER BY detected_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return {"events": [dict(r) for r in rows]}


@router.get("/api/damage-zones")
async def get_damage_zones():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, event_id, lat, lng, damage_probability, liquefaction_class FROM damage_zones ORDER BY damage_probability DESC LIMIT 500"
    ).fetchall()
    conn.close()
    return {"zones": [dict(r) for r in rows]}
