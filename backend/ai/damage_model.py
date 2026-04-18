"""Seismic damage: BA08 GMPE, liquefaction lookup, and damage grid pipeline."""

import logging
import math
import time
from pathlib import Path
from typing import Any

from backend.services.benchmark_logger import log_benchmark

logger = logging.getLogger(__name__)

# Simplified BA08-style coefficients for PGA (period = 0 s, natural log domain)
# Calibrated so M6.7 at 20 km ~ 0.2g, M6.7 at 5 km ~ 0.6g
_C1 = -1.715
_C2 = 0.500
_C3 = -1.344

_LIQUEFACTION_MULTIPLIERS: dict[str, float] = {
    "very_high": 2.0,
    "high": 1.5,
    "moderate": 1.1,
    "low": 1.0,
    "none": 1.0,
}

_KM_PER_DEGREE = 111.0
_DAMAGE_THRESHOLD = 0.05

# Lazy-loaded GeoDataFrame for liquefaction zones
_liquefaction_gdf: Any = None


def boore_atkinson_pga(magnitude: float, depth_km: float, distance_km: float) -> float:
    """Boore & Atkinson (2008) GMPE for Peak Ground Acceleration.

    Args:
        magnitude: Mw (moment magnitude).
        depth_km: hypocentral depth (km).
        distance_km: Joyner-Boore distance (km).

    Returns:
        PGA in units of g (gravitational acceleration).
    """
    r = math.sqrt(distance_km**2 + depth_km**2)
    r = max(r, 0.1)  # avoid log(0)

    ln_pga = _C1 + _C2 * magnitude + _C3 * math.log(r)
    pga_g = math.exp(ln_pga)

    logger.info(
        "GMPE: M=%.1f, depth=%.1fkm, distance=%.1fkm -> PGA=%.3fg",
        magnitude, depth_km, distance_km, pga_g,
    )
    return pga_g


def damage_probability(pga: float, liquefaction_class: str = "low") -> float:
    """Compute building damage probability from PGA and liquefaction susceptibility.

    Args:
        pga: Peak ground acceleration in g.
        liquefaction_class: One of 'very_high', 'high', 'moderate', 'low', 'none'.

    Returns:
        Damage probability clamped to [0.0, 1.0].
    """
    base_damage = 1.0 / (1.0 + math.exp(-(pga - 0.3) / 0.1))
    multiplier = _LIQUEFACTION_MULTIPLIERS.get(liquefaction_class, 1.0)
    return max(0.0, min(1.0, base_damage * multiplier))


# Keep old name as alias for backward compatibility with Phase 2 tests
damage_from_pga = damage_probability


def load_liquefaction_shapefile() -> Any:
    """Load and cache California liquefaction susceptibility shapefile.

    Returns a GeoDataFrame if geopandas is available and the shapefile exists,
    otherwise returns None.
    """
    global _liquefaction_gdf  # noqa: PLW0603
    if _liquefaction_gdf is not None:
        return _liquefaction_gdf

    shapefile_path = Path(__file__).parent.parent / "data" / "ca_liquefaction.shp"

    try:
        import geopandas as gpd  # noqa: F811
    except ImportError:
        logger.warning("geopandas not installed — liquefaction lookup disabled")
        _liquefaction_gdf = False  # marks unavailable — skip future attempts
        return None

    if not shapefile_path.exists():
        logger.warning(
            "Liquefaction shapefile not found at %s, spatial lookup disabled",
            shapefile_path,
        )
        _liquefaction_gdf = False
        return None

    _liquefaction_gdf = gpd.read_file(str(shapefile_path))
    logger.info("Loaded liquefaction GeoDataFrame: %d polygons", len(_liquefaction_gdf))
    return _liquefaction_gdf


def get_liquefaction_class(lat: float, lng: float) -> str:
    """Get liquefaction susceptibility class for a point via spatial join.

    Falls back to 'low' when shapefile or geopandas is unavailable.
    """
    gdf = load_liquefaction_shapefile()
    if gdf is None or gdf is False:
        return "low"

    try:
        from shapely.geometry import Point

        point = Point(lng, lat)
        matches = gdf[gdf.geometry.contains(point)]
        if matches.empty:
            return "low"
        class_str = str(matches.iloc[0].get("CLASS", "low")).lower()
        return class_str
    except Exception:
        logger.debug("Liquefaction lookup failed for (%.4f, %.4f)", lat, lng)
        return "low"


def run_damage_pipeline(
    event: dict,
    grid_resolution_deg: float = 0.01,
) -> list[dict]:
    """Compute damage probability grid around epicenter.

    Args:
        event: dict with 'magnitude', 'depth', 'lat', 'lng'.
        grid_resolution_deg: grid step in degrees (default 0.01 ~ 1.1 km).

    Returns:
        List of grid cells above the damage threshold.
    """
    t0 = time.time()

    magnitude = event["magnitude"]
    depth_km = event["depth"]
    epicenter_lat = event["lat"]
    epicenter_lng = event["lng"]
    cos_lat = math.cos(math.radians(epicenter_lat))

    lat_min = epicenter_lat - 0.5
    lat_max = epicenter_lat + 0.5
    lng_min = epicenter_lng - 0.5
    lng_max = epicenter_lng + 0.5

    damage_zones: list[dict] = []
    cell_id = 0

    lat = lat_min
    while lat <= lat_max:
        lng = lng_min
        while lng <= lng_max:
            dlat = lat - epicenter_lat
            dlng = lng - epicenter_lng
            distance_km = math.sqrt(
                (dlat * _KM_PER_DEGREE) ** 2
                + (dlng * _KM_PER_DEGREE * cos_lat) ** 2
            )

            pga = boore_atkinson_pga(magnitude, depth_km, distance_km)
            liq_class = get_liquefaction_class(lat, lng)
            damage_prob = damage_probability(pga, liq_class)

            if damage_prob > _DAMAGE_THRESHOLD:
                damage_zones.append({
                    "grid_cell_id": f"CELL_{cell_id}",
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "damage_probability": round(damage_prob, 3),
                    "liquefaction_class": liq_class,
                })

            cell_id += 1
            lng += grid_resolution_deg
        lat += grid_resolution_deg

    elapsed_s = time.time() - t0
    cells_above_70 = sum(1 for z in damage_zones if z["damage_probability"] > 0.70)
    logger.info(
        "Damage pipeline: %d cells computed, %d above 0.05, %d above 0.70 threshold in %.2fs",
        cell_id, len(damage_zones), cells_above_70, elapsed_s,
    )
    log_benchmark({
        "pipeline": "damage_model",
        "elapsed_ms": round(elapsed_s * 1000, 2),
        "cells_computed": cell_id,
        "cells_above_threshold": len(damage_zones),
        "cells_above_70": cells_above_70,
        "magnitude": event.get("magnitude"),
    })
    return damage_zones
