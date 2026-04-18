from fastapi import APIRouter
from datetime import datetime, timezone
from backend.db import get_db

router = APIRouter(prefix="/api", tags=["status"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _count(db, table: str) -> int:
    try:
        cur = await db.execute(f"SELECT COUNT(*) FROM {table}")
        row = await cur.fetchone()
        return row[0] if row else 0
    except Exception:
        return 0


@router.get("/counters")
async def get_counters():
    db = await get_db()
    try:
        return {
            "hotspots":         await _count(db, "hotspots"),
            "seismic_events":   await _count(db, "seismic_events"),
            "damage_zones":     await _count(db, "damage_zones"),
            "pending_actions":  await _count(db, "actions"),
            "crews":            await _count(db, "suppression_crews"),
            "shelters":         await _count(db, "shelters"),
            "hospitals":        await _count(db, "hospitals"),
            "as_of":            _now(),
        }
    finally:
        await db.close()


@router.get("/sync-status")
async def get_sync_status():
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT pipeline, last_success_at, status FROM sync_log ORDER BY pipeline"
        )
        rows = await cursor.fetchall()
        return {
            "pipelines": [{"pipeline": r[0], "last_sync": r[1], "status": r[2]} for r in rows],
            "as_of": _now(),
        }
    finally:
        await db.close()
