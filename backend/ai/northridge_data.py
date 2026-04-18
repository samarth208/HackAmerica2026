"""Precomputed Northridge 1994 M6.7 damage grid — generated at startup for fast demo access."""

from backend.ai.damage_grid import run_damage_pipeline

_NORTHRIDGE_EVENT = {"magnitude": 6.7, "depth": 17.0, "lat": 34.213, "lng": -118.537}

NORTHRIDGE_GRID: list[dict] = run_damage_pipeline(_NORTHRIDGE_EVENT)
