from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db import get_connection
import backend.services.ws_broadcaster as ws

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ActionCreate(BaseModel):
    action_type: str
    resource_id: Optional[int] = None
    zone_id: Optional[int] = None
    confidence: float
    time_sensitivity: str
    rationale: str


@router.get("/api/actions")
async def get_actions():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, action_type, resource_id, zone_id, confidence, time_sensitivity, rationale, status, created_at, approved_at FROM actions WHERE status = 'pending' ORDER BY confidence DESC, created_at DESC"
    ).fetchall()
    conn.close()
    return {"actions": [dict(r) for r in rows]}


@router.get("/api/actions/{action_id}")
async def get_action(action_id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")
    return dict(row)


@router.post("/api/actions")
async def create_action(body: ActionCreate):
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO actions (action_type, resource_id, zone_id, confidence, time_sensitivity, rationale, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
        (body.action_type, body.resource_id, body.zone_id, body.confidence, body.time_sensitivity, body.rationale, _now()),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id, "status": "created"}


@router.patch("/api/actions/{action_id}/approve")
async def approve_action(action_id: int):
    conn = get_connection()
    row = conn.execute("SELECT action_type, resource_id, zone_id FROM actions WHERE id = ?", (action_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Action not found")
    conn.execute("UPDATE actions SET status = 'approved', approved_at = ? WHERE id = ?", (_now(), action_id))
    conn.commit()
    conn.close()
    if row["action_type"] == "reposition":
        await ws.broadcast_crew_update({"action_id": action_id, "resource_id": row["resource_id"]})
    return {"status": "approved"}


@router.patch("/api/actions/{action_id}/dismiss")
async def dismiss_action(action_id: int):
    conn = get_connection()
    result = conn.execute("UPDATE actions SET status = 'dismissed' WHERE id = ?", (action_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"status": "dismissed"}
