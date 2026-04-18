"""USGS earthquake poller — standalone process.

Polls the USGS all_hour GeoJSON feed every 30 seconds. Tracks seen event IDs
to process only new earthquakes, then POSTs each new event to /api/seismic-event.

Run as: python -m backend.pollers.usgs
"""

import asyncio
import logging
import os
import sys

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [USGS] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30
USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"

_seen_event_ids: set[str] = set()


def _extract_new_events(geojson: dict) -> list[dict]:
    """Return only events not yet seen, and register them in _seen_event_ids."""
    new_events: list[dict] = []
    for feature in geojson.get("features", []):
        event_id = feature.get("id")
        if not event_id or event_id in _seen_event_ids:
            continue
        _seen_event_ids.add(event_id)

        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])  # [lng, lat, depth_km]

        mag = props.get("mag")
        if mag is None or len(coords) < 2:
            continue

        new_events.append({
            "id": event_id,
            "magnitude": float(mag),
            "depth": float(coords[2]) if len(coords) > 2 else 10.0,
            "lat": float(coords[1]),
            "lon": float(coords[0]),
        })
    return new_events


async def _fetch_and_post(client: httpx.AsyncClient, base_url: str) -> None:
    logger.debug("Polling USGS GeoJSON feed...")
    resp = await client.get(USGS_URL, timeout=15.0)
    resp.raise_for_status()

    events = _extract_new_events(resp.json())
    if not events:
        logger.debug("No new USGS events")
        return

    logger.info("New USGS events: %d", len(events))

    for event in events:
        try:
            post_resp = await client.post(
                f"{base_url}/api/seismic-event",
                json=event,
                timeout=10.0,  # CNN + damage pipeline must complete <3 s; 10 s is generous
            )
            post_resp.raise_for_status()
            body = post_resp.json()
            logger.info(
                "Event %-20s M%.1f → %d cells in %.0f ms",
                event["id"],
                event["magnitude"],
                len(body.get("damage_grid", [])),
                body.get("inference_time_ms", 0),
            )
        except httpx.HTTPStatusError as exc:
            logger.error(
                "HTTP %d posting event %s: %s",
                exc.response.status_code, event["id"], exc,
            )
        except Exception as exc:
            logger.error("Failed to post event %s: %s", event["id"], exc)


async def run() -> None:
    """Poll USGS forever, sleeping POLL_INTERVAL_SECONDS between cycles."""
    port = os.getenv("PORT", "8000")
    base_url = f"http://localhost:{port}"

    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _fetch_and_post(client, base_url)
            except httpx.HTTPStatusError as exc:
                logger.error("USGS HTTP error %d: %s", exc.response.status_code, exc)
            except Exception as exc:
                logger.error("USGS poll error: %s", exc)
            logger.debug("Sleeping %ds until next USGS poll", POLL_INTERVAL_SECONDS)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
