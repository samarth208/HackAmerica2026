import asyncio
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE_TTL_SECONDS = 600  # 10 minutes

# module-level cache: (lat, lng) -> {"data": dict, "expires_at": float}
_cache: dict[tuple[float, float], dict] = {}
_cache_lock = asyncio.Lock()


async def get_wind(lat: float, lng: float) -> Optional[dict]:
    key = (round(lat, 4), round(lng, 4))

    async with _cache_lock:
        entry = _cache.get(key)
        if entry and time.monotonic() < entry["expires_at"]:
            return entry["data"]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "hourly": "windspeed_10m,winddirection_10m",
                    "forecast_days": 1,
                },
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("Open-Meteo HTTP error for (%s, %s): %s", lat, lng, exc)
        return None

    payload = resp.json()
    hourly = payload.get("hourly", {})
    speeds = hourly.get("windspeed_10m", [])
    directions = hourly.get("winddirection_10m", [])

    # Find first index where both values are non-null
    speed_ms: Optional[float] = None
    direction_deg: Optional[float] = None
    for spd, dirn in zip(speeds, directions):
        if spd is not None and dirn is not None:
            speed_ms = spd / 3.6          # km/h → m/s
            direction_deg = float(dirn)
            break

    if speed_ms is None:
        return None

    result = {"speed_ms": speed_ms, "direction_deg": direction_deg}

    async with _cache_lock:
        _cache[key] = {"data": result, "expires_at": time.monotonic() + _CACHE_TTL_SECONDS}

    return result
