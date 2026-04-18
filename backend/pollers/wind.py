"""Open-Meteo wind poller — standalone process.

Every 5 minutes, queries active fire coordinates from the local DB, fetches
windspeed_10m and winddirection_10m from Open-Meteo, and POSTs to /api/wind.

Run as: python -m backend.pollers.wind
"""

import asyncio
import logging
import os
import sys

import aiosqlite
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WIND] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 300  # 5 minutes
DB_PATH = os.getenv("DB_PATH", "aegis.db")
OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
MAX_HOTSPOTS = 5  # limit concurrent Open-Meteo calls


async def _get_active_fire_coords() -> list[tuple[float, float]]:
    """Return distinct (lat, lng) coords for the most recent ember risk zones."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "SELECT DISTINCT lat, lng FROM ember_risk_zones "
                "ORDER BY rowid DESC LIMIT ?",
                (MAX_HOTSPOTS,),
            )
            return [(float(row[0]), float(row[1])) for row in await cursor.fetchall()]
    except Exception as exc:
        logger.warning("DB query for fire coords failed: %s", exc)
        return []


async def _fetch_wind(
    client: httpx.AsyncClient, lat: float, lng: float,
) -> dict | None:
    """Fetch current wind data from Open-Meteo for a single coordinate."""
    url = (
        f"{OPEN_METEO_BASE}"
        f"?latitude={lat}&longitude={lng}"
        f"&hourly=windspeed_10m,winddirection_10m"
    )
    try:
        resp = await client.get(url, timeout=15.0)
        resp.raise_for_status()
        hourly = resp.json().get("hourly", {})
        speeds = hourly.get("windspeed_10m", [])
        directions = hourly.get("winddirection_10m", [])
        if not speeds:
            logger.debug("Open-Meteo returned no wind data for (%.4f, %.4f)", lat, lng)
            return None
        return {
            "lat": lat,
            "lon": lng,
            "wind_speed": float(speeds[0]),
            "wind_direction": float(directions[0]) if directions else 270.0,
        }
    except Exception as exc:
        logger.error("Open-Meteo fetch failed for (%.4f, %.4f): %s", lat, lng, exc)
        return None


async def _fetch_and_post(client: httpx.AsyncClient, base_url: str) -> None:
    coords = await _get_active_fire_coords()
    if not coords:
        logger.debug("No active fire coordinates — skipping wind fetch")
        return

    logger.info("Fetching wind for %d hotspot locations", len(coords))

    for lat, lng in coords:
        wind = await _fetch_wind(client, lat, lng)
        if not wind:
            continue
        try:
            resp = await client.post(f"{base_url}/api/wind", json=wind, timeout=10.0)
            resp.raise_for_status()
            logger.info(
                "Wind posted (%.4f, %.4f): %.1f m/s @ %.0f°",
                lat, lng, wind["wind_speed"], wind["wind_direction"],
            )
        except httpx.HTTPStatusError as exc:
            logger.error(
                "HTTP %d posting wind for (%.4f, %.4f): %s",
                exc.response.status_code, lat, lng, exc,
            )
        except Exception as exc:
            logger.error("Failed to post wind data: %s", exc)


async def run() -> None:
    """Poll Open-Meteo forever, sleeping POLL_INTERVAL_SECONDS between cycles."""
    port = os.getenv("PORT", "8000")
    base_url = f"http://localhost:{port}"

    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _fetch_and_post(client, base_url)
            except Exception as exc:
                logger.error("Wind poll error: %s", exc)
            logger.debug("Sleeping %ds until next wind poll", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
