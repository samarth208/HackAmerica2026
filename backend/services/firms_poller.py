from __future__ import annotations
"""FIRMS hotspot poller: fetch → DB → ember simulation → Ontology → broadcast."""

import logging
import os

import aiosqlite

from backend.ai.ember_simulation import run_ember_simulation
from backend.services.ws_broadcaster import broadcast_ember_update

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "aegis.db")


async def process_hotspots(hotspots: list[dict], wind_data: dict | None = None) -> list[dict]:
    """Process FIRMS hotspots: ember simulation → DB → Ontology → broadcast.

    Args:
        hotspots: list of {'lat', 'lng', 'frp'} dicts from FIRMS feed.
        wind_data: optional {'wind_speed', 'wind_direction'} from Open-Meteo.

    Returns:
        List of ember_risk_zone dicts that were stored.
    """
    if not hotspots:
        return []

    wind = {
        "speed_ms": (wind_data or {}).get("wind_speed", 5.0),
        "direction_deg": (wind_data or {}).get("wind_direction", 270.0),
    }

    geojson_result = run_ember_simulation(hotspots, wind)

    ember_zones: list[dict] = []
    for feature in geojson_result.get("features", []):
        props = feature["properties"]
        coords = feature["geometry"]["coordinates"]
        zone = {
            "id": f"EMBER_{len(ember_zones)}",
            "lat": coords[1],
            "lng": coords[0],
            "probability": props["density"],
            "particle_count": props.get("particle_count", 0),
            "hotspot_id": None,
        }
        ember_zones.append(zone)
    async with aiosqlite.connect(DB_PATH) as db:
        for zone in ember_zones:
            await db.execute(
                """INSERT OR REPLACE INTO ember_risk_zones
                   (id, lat, lng, probability, particle_count, hotspot_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (zone["id"], zone["lat"], zone["lng"],
                 zone["probability"], zone["particle_count"], zone["hotspot_id"]),
            )
        await db.commit()

    await broadcast_ember_update(ember_zones)
    logger.info("Ember simulation: %d risk zones stored and broadcast", len(ember_zones))
    return ember_zones
