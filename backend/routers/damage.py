from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import asyncio

from backend.db import get_db
from backend.services.ws_broadcaster import broadcast_damage_grid, broadcast_action_created, broadcast_event_log

router = APIRouter(prefix="/api/simulate", tags=["simulate"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("", status_code=200)
async def simulate_crisis():
    """Run the Northridge M6.7 replay — populates damage grid and generates action cards."""
    try:
        from backend.ai.northridge_data import NORTHRIDGE_GRID
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"northridge_data unavailable: {e}")

    from backend.ai.action_engine import generate_seismic_actions

    db = await get_db()
    try:
        now = _now()

        # Upsert seismic event
        await db.execute("DELETE FROM seismic_events WHERE usgs_event_id = ?", ("northridge-1994-replay",))
        cursor = await db.execute(
            "INSERT INTO seismic_events (usgs_event_id, magnitude, depth, lat, lng, detected_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("northridge-1994-replay", 6.7, 17.0, 34.213, -118.537, now),
        )
        await db.commit()
        event_id = cursor.lastrowid

        # Insert damage zones
        cells = [
            (event_id, c["grid_cell_id"], c["lat"], c["lng"], c["damage_probability"], c["liquefaction_class"], now)
            for c in NORTHRIDGE_GRID
        ]
        await db.executemany(
            "INSERT INTO damage_zones (event_id, grid_cell_id, lat, lng, damage_probability, liquefaction_class, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            cells,
        )
        await db.commit()

        # Broadcast damage grid (first 150 cells)
        broadcast_cells = [
            {"lat": c[2], "lng": c[3], "damage_probability": c[4], "liquefaction_class": c[5]}
            for c in cells[:150]
        ]
        await broadcast_damage_grid(broadcast_cells)

        # Generate and persist action cards
        actions = generate_seismic_actions(NORTHRIDGE_GRID)
        action_ids = []
        for action in actions:
            cur2 = await db.execute(
                "INSERT INTO actions (action_type, resource_id, zone_id, confidence, time_sensitivity, rationale, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
                (
                    action.get("action_type", "dispatch"),
                    action.get("resource_id"),
                    action.get("zone_id"),
                    action.get("confidence", 0.9),
                    action.get("time_sensitivity", "immediate"),
                    action.get("rationale", ""),
                    now,
                ),
            )
            await db.commit()
            action_ids.append(cur2.lastrowid)
            await broadcast_action_created({**action, "db_id": cur2.lastrowid})

        # Log event
        await db.execute(
            "INSERT INTO event_log (source, message, created_at) VALUES (?, ?, ?)",
            ("simulate", f"Northridge M6.7 replay — {len(cells)} zones, {len(actions)} actions", now),
        )
        await db.execute("UPDATE sync_log SET last_success_at = ?, status = 'ok' WHERE pipeline = 'simulate'", (now,))
        await db.commit()

        await broadcast_event_log(
            f"Northridge M6.7 replay complete — {len(cells)} damage zones generated", "seismic"
        )

        return {"status": "ok", "event_id": event_id, "damage_zones": len(cells), "actions": len(actions)}
    finally:
        await db.close()


@router.delete("/reset", status_code=200)
async def reset_simulation():
    """Clear all simulation data."""
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM damage_zones WHERE event_id IN (SELECT id FROM seismic_events WHERE usgs_event_id = ?)",
            ("northridge-1994-replay",),
        )
        await db.execute("DELETE FROM actions WHERE zone_id IS NULL")
        await db.execute("DELETE FROM seismic_events WHERE usgs_event_id = ?", ("northridge-1994-replay",))
        await db.commit()
        return {"status": "ok"}
    finally:
        await db.close()
