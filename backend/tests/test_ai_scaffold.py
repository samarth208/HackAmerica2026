"""Tests for AI scaffold modules."""

import json
import os
import sys

import numpy as np
import pytest


def test_all_modules_importable():
    """All backend.ai modules import without error."""
    from backend.ai.seismic_cnn import SeismicCNN, load_model, run_inference, DEVICE
    from backend.ai.ember_simulation import Particle, WindField, EmberSimulation
    from backend.ai.damage_model import boore_atkinson_pga, damage_from_pga, run_damage_pipeline

    assert callable(load_model)
    assert callable(run_inference)
    assert callable(boore_atkinson_pga)
    assert callable(damage_from_pga)
    assert callable(run_damage_pipeline)


def test_cnn_load_model():
    """load_model() instantiates and returns SeismicCNN."""
    from backend.ai.seismic_cnn import load_model, SeismicCNN

    model = load_model()
    assert isinstance(model, SeismicCNN)
    assert model.training is False


def test_cnn_run_inference():
    """run_inference() accepts waveform and returns float magnitude."""
    from backend.ai.seismic_cnn import run_inference

    waveform = np.random.randn(3, 500).astype(np.float32)
    result = run_inference(waveform)

    assert isinstance(result, (float, np.floating)), f"Expected float, got {type(result)}"
    assert not np.isnan(result), "Result should not be NaN"
    assert not np.isinf(result), "Result should not be Inf"


def test_cnn_run_inference_wrong_shape():
    """run_inference() pads/truncates waveform to (3, 500)."""
    from backend.ai.seismic_cnn import run_inference

    waveform_short = np.random.randn(3, 100).astype(np.float32)
    result_short = run_inference(waveform_short)
    assert isinstance(result_short, (float, np.floating))

    waveform_long = np.random.randn(3, 1000).astype(np.float32)
    result_long = run_inference(waveform_long)
    assert isinstance(result_long, (float, np.floating))


def test_particle_dataclass():
    """Particle dataclass initializes correctly."""
    from backend.ai.ember_simulation import Particle

    p = Particle(lat=37.5, lng=-122.5, height=100.0, alive=True)
    assert p.lat == 37.5
    assert p.lng == -122.5
    assert p.height == 100.0
    assert p.alive is True

    p2 = Particle(lat=37.0, lng=-122.0, height=50.0)
    assert p2.alive is True


def test_windfield_dataclass():
    """WindField dataclass initializes correctly."""
    from backend.ai.ember_simulation import WindField

    wind = WindField(speed_ms=5.0, direction_deg=270.0)
    assert wind.speed_ms == 5.0
    assert wind.direction_deg == 270.0


def test_ember_simulation_init():
    """EmberSimulation initializes without error."""
    from backend.ai.ember_simulation import EmberSimulation, WindField

    hotspots = [
        {"lat": 37.5, "lng": -122.5, "frp": 100.0},
        {"lat": 37.6, "lng": -122.4, "frp": 150.0},
    ]
    wind = WindField(speed_ms=5.0, direction_deg=270.0)

    sim = EmberSimulation(hotspots=hotspots, wind=wind, n_particles_per_hotspot=100)
    assert sim is not None


def test_ember_simulation_run():
    """EmberSimulation.run() returns GeoJSON FeatureCollection."""
    from backend.ai.ember_simulation import EmberSimulation, WindField

    hotspots = [{"lat": 37.5, "lng": -122.5, "frp": 100.0}]
    wind = WindField(speed_ms=5.0, direction_deg=270.0)

    sim = EmberSimulation(hotspots=hotspots, wind=wind, n_particles_per_hotspot=50)
    result = sim.run(steps=10)

    assert isinstance(result, dict), "Should return dict"
    assert result["type"] == "FeatureCollection", "Should be GeoJSON FeatureCollection"
    assert "features" in result, "Should have features key"
    assert isinstance(result["features"], list), "Features should be a list"


def test_ember_simulation_geojson_structure():
    """EmberSimulation GeoJSON features have correct structure."""
    from backend.ai.ember_simulation import EmberSimulation, WindField

    hotspots = [{"lat": 37.5, "lng": -122.5, "frp": 100.0}]
    wind = WindField(speed_ms=5.0, direction_deg=270.0)

    sim = EmberSimulation(hotspots=hotspots, wind=wind, n_particles_per_hotspot=50)
    result = sim.run(steps=10)

    if result["features"]:
        feature = result["features"][0]
        assert feature["type"] == "Feature"
        assert "geometry" in feature
        assert feature["geometry"]["type"] == "Point"
        assert "coordinates" in feature["geometry"]
        assert "properties" in feature
        assert "density" in feature["properties"]
        assert "particle_count" in feature["properties"]


def test_boore_atkinson_pga():
    """boore_atkinson_pga() returns float PGA value."""
    from backend.ai.damage_model import boore_atkinson_pga

    pga = boore_atkinson_pga(magnitude=6.5, depth_km=10.0, distance_km=20.0)

    assert isinstance(pga, (float, int)), f"Expected float, got {type(pga)}"
    assert pga > 0, "PGA should be positive"


def test_damage_from_pga():
    """damage_from_pga() returns float in range [0, 1]."""
    from backend.ai.damage_model import damage_from_pga

    damage = damage_from_pga(pga=0.5)

    assert isinstance(damage, (float, int)), f"Expected float, got {type(damage)}"
    assert 0.0 <= damage <= 1.0, f"Damage should be in [0, 1], got {damage}"


def test_run_damage_pipeline():
    """run_damage_pipeline() returns list of dicts."""
    from backend.ai.damage_model import run_damage_pipeline

    event = {
        "magnitude": 6.5,
        "depth": 10.0,
        "lat": 37.5,
        "lng": -122.5,
        "epicenter_depth": 10.0,
    }

    result = run_damage_pipeline(event)
    assert isinstance(result, list), f"Expected list, got {type(result)}"
