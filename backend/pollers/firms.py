"""NASA FIRMS wildfire poller — standalone process.

Fetches VIIRS SNPP NRT hotspots every 5 minutes, filters by confidence > 50%,
and POSTs results to the FastAPI /api/hotspots endpoint.

Run as: python -m backend.pollers.firms
"""

import asyncio
import csv
import io
import logging
import os
import sys

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [FIRMS] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 300  # 5 minutes
CONFIDENCE_THRESHOLD = 50.0
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def _parse_confidence(raw: str) -> float:
    """Convert FIRMS confidence string to float (handles 'n'/'l'/'h' and numeric)."""
    try:
        return float(raw)
    except (ValueError, TypeError):
        return {"n": 50.0, "l": 25.0, "h": 100.0}.get(str(raw).lower(), 0.0)


def _parse_firms_csv(csv_text: str) -> list[dict]:
    """Parse FIRMS CSV response into hotspot dicts."""
    reader = csv.DictReader(io.StringIO(csv_text))
    hotspots: list[dict] = []
    for row in reader:
        try:
            conf = _parse_confidence(row.get("confidence", ""))
            if conf <= CONFIDENCE_THRESHOLD:
                continue
            hotspots.append({
                "lat": float(row["latitude"]),
                "lng": float(row["longitude"]),
                "frp": float(row.get("frp") or 0),
                "confidence": conf,
                "acq_date": row.get("acq_date", ""),
                "acq_time": row.get("acq_time", ""),
            })
        except (ValueError, KeyError) as exc:
            logger.debug("Skipping malformed FIRMS row: %s", exc)
    return hotspots


async def _fetch_and_post(client: httpx.AsyncClient, base_url: str) -> None:
    map_key = os.environ.get("NASA_FIRMS_MAP_KEY")
    if not map_key:
        logger.warning("NASA_FIRMS_MAP_KEY not set — skipping FIRMS fetch")
        return

    url = f"{FIRMS_BASE}/{map_key}/VIIRS_SNPP_NRT/world/1"
    logger.info("Fetching FIRMS hotspots...")

    resp = await client.get(url, timeout=30.0)
    resp.raise_for_status()

    hotspots = _parse_firms_csv(resp.text)
    logger.info("Parsed %d hotspots above %.0f%% confidence", len(hotspots), CONFIDENCE_THRESHOLD)

    if not hotspots:
        return

    post_resp = await client.post(
        f"{base_url}/api/hotspots",
        json={"hotspots": hotspots},
        timeout=30.0,
    )
    post_resp.raise_for_status()
    accepted = post_resp.json().get("accepted", 0)
    logger.info("Posted %d hotspots → %d accepted by API", len(hotspots), accepted)


async def run() -> None:
    """Poll FIRMS forever, sleeping POLL_INTERVAL_SECONDS between cycles."""
    port = os.getenv("PORT", "8000")
    base_url = f"http://localhost:{port}"

    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _fetch_and_post(client, base_url)
            except httpx.HTTPStatusError as exc:
                logger.error("FIRMS HTTP error %d: %s", exc.response.status_code, exc)
            except Exception as exc:
                logger.error("FIRMS poll error: %s", exc)
            logger.debug("Sleeping %ds until next FIRMS poll", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
