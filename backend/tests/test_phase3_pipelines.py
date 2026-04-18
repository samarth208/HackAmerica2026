"""Integration tests for P4 Phase 3: CNN inference, GMPE damage, ember simulation."""

import time

import numpy as np
import pytest

from backend.ai.damage_model import (
    boore_atkinson_pga,
    damage_probability,
    get_liquefaction_class,
    run_damage_pipeline,
)
from backend.ai.ember_simulation import EmberSimulation, WindField, run_ember_simulation
from backend.ai.seismic_cnn import run_inference


# ---------------------------------------------------------------------------
# CNN inference
# ---------------------------------------------------------------------------


def test_cnn_inference_benchmark(capsys):
    """CNN inference runs, returns float, and prints benchmark."""
    waveform = np.random.randn(3, 500).astype(np.float32)
    magnitude = run_inference(waveform)

    assert isinstance(magnitude, (float, np.floating)), f"Expected float, got {type(magnitude)}"

    captured = capsys.readouterr()
    assert "[AEGIS]" in captured.out, "Benchmark should be printed to stdout"


def test_cnn_inference_shape_handling():
    """CNN inference pads/truncates non-(3,500) waveforms."""
    short = np.random.randn(3, 100).astype(np.float32)
    assert isinstance(run_inference(short), (float, np.floating))

    long = np.random.randn(3, 1000).astype(np.float32)
    assert isinstance(run_inference(long), (float, np.floating))

    wrong_channels = np.random.randn(2, 500).astype(np.float32)
    assert isinstance(run_inference(wrong_channels), (float, np.floating))


def test_cnn_benchmark_logs_stdout(capsys):
    """CNN inference prints benchmark to stdout for demo visibility."""
    waveform = np.random.randn(3, 500).astype(np.float32)
    run_inference(waveform)

    captured = capsys.readouterr()
    assert "[AEGIS]" in captured.out or "ms" in captured.out


# ---------------------------------------------------------------------------
# GMPE damage model
# ---------------------------------------------------------------------------


def test_boore_atkinson_pga_physics():
    """BA08 GMPE computes physically plausible PGA that decreases with distance."""
    magnitude, depth = 6.7, 17.0

    pga_5 = boore_atkinson_pga(magnitude, depth, 5.0)
    pga_50 = boore_atkinson_pga(magnitude, depth, 50.0)

    assert isinstance(pga_5, float)
    assert 0.0 < pga_5 < 2.0, f"PGA {pga_5}g unrealistic at 5 km"
    assert 0.0 < pga_50 < 2.0, f"PGA {pga_50}g unrealistic at 50 km"
    assert pga_50 < pga_5, "PGA should decrease with distance"


def test_damage_probability_sigmoid():
    """damage_probability() maps PGA to [0, 1] with liquefaction amplification."""
    damage_critical = damage_probability(0.3, "low")
    assert 0.4 < damage_critical < 0.6, f"At 0.3g, damage should be ~0.5, got {damage_critical}"

    damage_none = damage_probability(0.5, "none")
    damage_high = damage_probability(0.5, "high")
    assert damage_high > damage_none, "High liquefaction should increase damage"

    damage_extreme = damage_probability(10.0, "very_high")
    assert 0.0 <= damage_extreme <= 1.0, "Damage should be clipped to [0, 1]"


def test_get_liquefaction_class():
    """get_liquefaction_class() returns valid class string."""
    for lat, lng in [(34.2, -118.5), (37.5, -122.2), (40.0, -120.0)]:
        liq_class = get_liquefaction_class(lat, lng)
        assert isinstance(liq_class, str)
        assert liq_class in ("very_high", "high", "moderate", "low", "none")


def test_run_damage_pipeline_grid():
    """run_damage_pipeline() computes > 100 cells for Northridge-like event."""
    event = {"magnitude": 6.7, "depth": 17.0, "lat": 34.213, "lng": -118.537}
    cells = run_damage_pipeline(event)

    assert isinstance(cells, list)
    assert len(cells) > 100, f"Expected > 100 cells, got {len(cells)}"

    for cell in cells[:3]:
        assert "grid_cell_id" in cell
        assert "lat" in cell
        assert "lng" in cell
        assert "damage_probability" in cell
        assert "liquefaction_class" in cell
        assert cell["damage_probability"] > 0.05


def test_run_damage_pipeline_threshold():
    """run_damage_pipeline() only returns cells above 0.05 threshold."""
    event = {"magnitude": 6.7, "depth": 17.0, "lat": 34.213, "lng": -118.537}
    cells = run_damage_pipeline(event)

    for cell in cells:
        assert cell["damage_probability"] > 0.05


# ---------------------------------------------------------------------------
# Ember simulation
# ---------------------------------------------------------------------------


def test_ember_simulation_produces_geojson():
    """EmberSimulation.run() returns valid GeoJSON FeatureCollection."""
    sim = EmberSimulation(
        hotspots=[{"lat": 34.2, "lng": -118.5, "frp": 350.0}],
        wind=WindField(speed_ms=5.0, direction_deg=270.0),
        n_particles_per_hotspot=200,
    )
    result = sim.run(steps=30)

    assert result["type"] == "FeatureCollection"
    assert isinstance(result["features"], list)
    assert len(result["features"]) > 0, "Should have landed particles"


def test_ember_simulation_feature_structure():
    """Ember GeoJSON features have density and particle_count."""
    sim = EmberSimulation(
        hotspots=[{"lat": 34.2, "lng": -118.5, "frp": 350.0}],
        wind=WindField(speed_ms=5.0, direction_deg=270.0),
        n_particles_per_hotspot=200,
    )
    result = sim.run(steps=30)

    assert result["features"], "Need at least one feature"
    feature = result["features"][0]

    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Point"
    assert len(feature["geometry"]["coordinates"]) == 2

    props = feature["properties"]
    assert 0.0 <= props["density"] <= 1.0
    assert isinstance(props["particle_count"], int)
    assert props["particle_count"] > 0


def test_ember_simulation_multiple_hotspots():
    """Ember simulation handles multiple hotspots."""
    hotspots = [
        {"lat": 34.2, "lng": -118.5, "frp": 200.0},
        {"lat": 34.3, "lng": -118.4, "frp": 150.0},
        {"lat": 34.1, "lng": -118.6, "frp": 100.0},
    ]
    sim = EmberSimulation(hotspots=hotspots, wind=WindField(5.0, 270.0), n_particles_per_hotspot=50)
    result = sim.run(steps=30)

    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) > 0


def test_run_ember_simulation_wrapper():
    """run_ember_simulation() convenience wrapper works."""
    result = run_ember_simulation(
        [{"lat": 34.2, "lng": -118.5, "frp": 350.0}],
        {"speed_ms": 5.0, "direction_deg": 270.0},
    )
    assert result["type"] == "FeatureCollection"
    assert isinstance(result["features"], list)


def test_ember_simulation_performance():
    """Ember simulation completes in < 2s for 8 hotspots x 200 particles x 30 steps."""
    hotspots = [
        {"lat": 34.0 + i * 0.1, "lng": -118.5 + j * 0.1, "frp": 200.0 + i * 20}
        for i in range(2)
        for j in range(4)
    ]
    sim = EmberSimulation(hotspots=hotspots, wind=WindField(5.0, 270.0), n_particles_per_hotspot=200)

    t0 = time.time()
    sim.run(steps=30)
    elapsed = time.time() - t0

    assert elapsed < 2.0, f"Simulation took {elapsed:.2f}s, should be < 2s"


# ---------------------------------------------------------------------------
# Cross-pipeline integration
# ---------------------------------------------------------------------------


def test_all_pipelines_integration():
    """All three pipelines run without error in sequence."""
    # CNN
    mag = run_inference(np.random.randn(3, 500).astype(np.float32))
    assert isinstance(mag, (float, np.floating))

    # Damage
    cells = run_damage_pipeline({"magnitude": 6.7, "depth": 17.0, "lat": 34.213, "lng": -118.537})
    assert isinstance(cells, list) and len(cells) > 0

    # Ember
    result = run_ember_simulation(
        [{"lat": 34.2, "lng": -118.5, "frp": 350.0}],
        {"speed_ms": 5.0, "direction_deg": 270.0},
    )
    assert result["type"] == "FeatureCollection"
