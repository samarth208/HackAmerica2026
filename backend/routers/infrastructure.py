from fastapi import APIRouter
from backend.db import get_connection

router = APIRouter()


@router.get("/api/shelters")
async def get_shelters():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, lat, lng, occupancy, capacity FROM shelters").fetchall()
    conn.close()
    return {"shelters": [dict(r) for r in rows]}


@router.get("/api/hospitals")
async def get_hospitals():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, lat, lng, current_capacity, alert_level FROM hospitals").fetchall()
    conn.close()
    return {"hospitals": [dict(r) for r in rows]}
