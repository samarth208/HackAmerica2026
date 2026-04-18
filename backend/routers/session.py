from fastapi import APIRouter
from datetime import datetime, timezone
from backend.db import get_db

router = APIRouter(prefix="/api", tags=["session"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_or_create(db) -> dict:
    cursor = await db.execute("SELECT id, created_at, last_active_at FROM sessions WHERE id = 1")
    row = await cursor.fetchone()
    if row is None:
        now = _now()
        await db.execute("INSERT INTO sessions (id, created_at, last_active_at) VALUES (1, ?, ?)", (now, now))
        await db.commit()
        return {"id": 1, "created_at": now, "last_active_at": now}
    return {"id": row[0], "created_at": row[1], "last_active_at": row[2]}


@router.get("/session")
async def get_session():
    db = await get_db()
    try:
        return await _get_or_create(db)
    finally:
        await db.close()


@router.patch("/session")
async def touch_session():
    db = await get_db()
    try:
        await _get_or_create(db)
        now = _now()
        await db.execute("UPDATE sessions SET last_active_at = ? WHERE id = 1", (now,))
        await db.commit()
        return {"status": "ok", "last_active_at": now}
    finally:
        await db.close()
