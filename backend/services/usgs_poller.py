"""USGS seismic event poller: fetch → CNN → damage pipeline → DB → broadcast."""

import asyncio
import logging
import os

import aiosqlite
import numpy as np

from backend.ai.action_engine import run_dispatch
from backend.ai.damage_model import run_damage_pipeline
from backend.ai.seismic_cnn import run_inference
from backend.services.ws_broadcaster import broadcast_action_created, broadcast_damage_grid

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "aegis.db")


async def process_seismic_event(event_data: dict) -> dict:
    """Process USGS seismic event: CNN → damage → dispatch → DB → broadcast.

    Args:
        event_data: dict with id, magnitude, depth_km, lat, lng.

    Returns:
        Summary dict: {'damage_zones': int, 'actions': int}.
    """
    event = {
        "id": event_data["id"],
        "magnitude": event_data["magnitude"],
        "depth": event_data["depth_km"],
        "lat": event_data["lat"],
        "lng": event_data["lng"],
    }

    # 1. CNN inference benchmark
    synthetic_waveform = np.random.randn(3, 500).astype(np.float32)
    magnitude_estimated = run_inference(synthetic_waveform)
    logger.info("CNN inference: %.2f (benchmark logged)", magnitude_estimated)

    # 2. GMPE damage pipeline
    damage_cells = run_damage_pipeline(event)
    logger.info("Damage pipeline: %d cells above 0.05 threshold", len(damage_cells))

    damage_zones: list[dict] = []
    for i, cell in enumerate(damage_cells):
        zone = {
            "id": f"DAMAGE_{event['id']}_{i}",
            "lat": cell["lat"],
            "lng": cell["lng"],
            "damage_probability": cell["damage_probability"],
            "liquefaction_class": cell["liquefaction_class"],
            "event_id": event["id"],
        }
        damage_zones.append(zone)

    async with aiosqlite.connect(DB_PATH) as db:
        for zone in damage_zones:
            await db.execute(
                """INSERT OR REPLACE INTO damage_zones
                   (id, lat, lng, damage_probability, liquefaction_class, event_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (zone["id"], zone["lat"], zone["lng"],
                 zone["damage_probability"], zone["liquefaction_class"], zone["event_id"]),
            )
        await db.commit()

    await broadcast_damage_grid(damage_cells)

    # 3. Fetch supporting data from DB for dispatch
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        crews = [dict(r) for r in await (await db.execute(
            "SELECT id, crew_identifier, lat, lng, status, capacity, assigned_zone_id FROM suppression_crews"
        )).fetchall()]
        shelters = [dict(r) for r in await (await db.execute(
            "SELECT id, name, lat, lng, occupancy, capacity, damage_zone_id FROM shelters"
        )).fetchall()]
        hospitals = [dict(r) for r in await (await db.execute(
            "SELECT id, name, lat, lng, current_capacity, alert_level, damage_zone_id FROM hospitals"
        )).fetchall()]
        routes = [dict(r) for r in await (await db.execute(
            "SELECT id, status, origin_zone_id, destination_zone_id FROM evacuation_routes"
        )).fetchall()]
        ember_zones = [dict(r) for r in await (await db.execute(
            "SELECT id, lat, lng, probability, hotspot_id FROM ember_risk_zones ORDER BY rowid DESC LIMIT 100"
        )).fetchall()]

    # 4. Dispatch loop
    actions = run_dispatch(ember_zones, damage_zones, crews, shelters, hospitals, routes)
    logger.info("Dispatch: %d actions generated", len(actions))

    async with aiosqlite.connect(DB_PATH) as db:
        recent_cursor = await db.execute(
            """SELECT action_type, resource_id FROM aip_actions
               WHERE created_at > datetime('now', '-10 seconds')"""
        )
        recent_keys = {(r[0], r[1]) for r in await recent_cursor.fetchall()}

        for action in actions:
            dedup_key = (action["action_type"], action["resource_id"])
            if dedup_key in recent_keys:
                logger.info(
                    "Skipping duplicate action %s/%s (10s dedup window)",
                    action["action_type"], action["resource_id"],
                )
                continue

            cursor = await db.execute(
                """INSERT INTO aip_actions
                   (action_type, resource_id, zone_id, confidence, time_sensitivity, rationale)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (action["action_type"], action["resource_id"], action["zone_id"],
                 action["confidence"], action["time_sensitivity"], action["rationale"]),
            )
            await db.commit()
            row_id = cursor.lastrowid
            recent_keys.add(dedup_key)
            await broadcast_action_created({**action, "id": row_id})

    return {"damage_zones": len(damage_zones), "actions": len(actions)}
