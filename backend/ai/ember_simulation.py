"""Particle-based wildfire ember advection simulation using NumPy."""

import math
from dataclasses import dataclass

import numpy as np

_METRES_PER_DEGREE = 111_000.0
_MAX_LOFT_HEIGHT = 200.0
_MIN_LOFT_HEIGHT = 1.0
_GRID_RESOLUTION = 0.01


@dataclass
class WindField:
    speed_ms: float
    direction_deg: float


class EmberSimulation:
    def __init__(self, hotspots: list[dict], wind: WindField, n_particles_per_hotspot: int = 200) -> None:
        self.hotspots = hotspots
        self.wind = wind
        self.n_particles = n_particles_per_hotspot

    def run(self, steps: int = 30) -> dict:
        if not self.hotspots:
            return {"type": "FeatureCollection", "features": []}

        rng = np.random.default_rng()
        all_lats, all_lngs, all_heights = [], [], []
        for hs in self.hotspots:
            n = self.n_particles
            lats = hs["lat"] + rng.uniform(-0.001, 0.001, size=n)
            lngs = hs["lng"] + rng.uniform(-0.001, 0.001, size=n)
            heights = np.clip(rng.normal(hs.get("frp", 50.0) * 0.8, 30.0, size=n), _MIN_LOFT_HEIGHT, _MAX_LOFT_HEIGHT)
            all_lats.append(lats)
            all_lngs.append(lngs)
            all_heights.append(heights)

        lats = np.concatenate(all_lats)
        lngs = np.concatenate(all_lngs)
        heights = np.concatenate(all_heights)
        alive = np.ones(len(lats), dtype=bool)

        dir_rad = math.radians(self.wind.direction_deg)
        v_east = -math.sin(dir_rad) * self.wind.speed_ms
        v_north = -math.cos(dir_rad) * self.wind.speed_ms

        for _ in range(steps):
            mask = alive
            if not np.any(mask):
                break
            n_alive = mask.sum()
            cos_lat = np.cos(np.radians(lats[mask]))
            cos_lat = np.where(cos_lat == 0, 1e-10, cos_lat)
            lats[mask] += v_north / _METRES_PER_DEGREE + rng.normal(0, 0.0001, n_alive)
            lngs[mask] += v_east / (_METRES_PER_DEGREE * cos_lat) + rng.normal(0, 0.0001, n_alive)
            heights[mask] -= 5.0 + heights[mask] * 0.05
            alive[heights <= 0] = False

        land_lats = lats[~alive]
        land_lngs = lngs[~alive]
        if len(land_lats) == 0:
            return {"type": "FeatureCollection", "features": []}

        grid_lats = np.floor(land_lats / _GRID_RESOLUTION) * _GRID_RESOLUTION
        grid_lngs = np.floor(land_lngs / _GRID_RESOLUTION) * _GRID_RESOLUTION

        bins: dict[tuple, int] = {}
        for la, lo in zip(grid_lats, grid_lngs):
            key = (round(float(la), 4), round(float(lo), 4))
            bins[key] = bins.get(key, 0) + 1

        max_count = max(bins.values()) if bins else 1
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lo, la]},
                "properties": {"density": round(cnt / max_count, 3), "particle_count": cnt},
            }
            for (la, lo), cnt in bins.items()
        ]
        return {"type": "FeatureCollection", "features": features}


def run_ember_simulation(hotspots: list[dict], wind: dict) -> dict:
    wf = WindField(speed_ms=wind["speed_ms"], direction_deg=wind["direction_deg"])
    return EmberSimulation(hotspots=hotspots, wind=wf).run()
