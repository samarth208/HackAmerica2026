"""Seismic damage probability grid using BA08-style GMPE + logistic fragility curve."""

import math

_C1 = -1.715
_C2 = 0.500
_C3 = -1.344
_KM_PER_DEGREE = 111.0
_DAMAGE_THRESHOLD = 0.05


def _boore_atkinson_pga(magnitude: float, depth_km: float, distance_km: float) -> float:
    r = math.sqrt(distance_km**2 + depth_km**2)
    r = max(r, 0.1)
    return math.exp(_C1 + _C2 * magnitude + _C3 * math.log(r))


def _damage_probability(pga: float) -> float:
    return max(0.0, min(1.0, 1.0 / (1.0 + math.exp(-(pga - 0.3) / 0.1))))


def run_damage_pipeline(event: dict, grid_resolution_deg: float = 0.01) -> list[dict]:
    """Compute seismic damage probability grid around epicenter.

    Returns list of grid cells with damage_probability above threshold.
    """
    magnitude = event["magnitude"]
    depth_km = event["depth"]
    epi_lat = event["lat"]
    epi_lng = event["lng"]
    cos_lat = math.cos(math.radians(epi_lat))

    cells: list[dict] = []
    cell_id = 0
    lat = epi_lat - 0.5
    while lat <= epi_lat + 0.5:
        lng = epi_lng - 0.5
        while lng <= epi_lng + 0.5:
            dist_km = math.sqrt(
                ((lat - epi_lat) * _KM_PER_DEGREE) ** 2
                + ((lng - epi_lng) * _KM_PER_DEGREE * cos_lat) ** 2
            )
            pga = _boore_atkinson_pga(magnitude, depth_km, dist_km)
            prob = _damage_probability(pga)
            if prob > _DAMAGE_THRESHOLD:
                cells.append({
                    "grid_cell_id": f"CELL_{cell_id}",
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "damage_probability": round(prob, 3),
                    "liquefaction_class": "low",
                })
            cell_id += 1
            lng += grid_resolution_deg
        lat += grid_resolution_deg

    return cells
