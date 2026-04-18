"""Tests for AIP agent system prompt and input formatter."""

import json

import pytest

from backend.ai.prompt import AIP_SYSTEM_PROMPT, format_agent_input


def test_aip_system_prompt_loads():
    """AIP_SYSTEM_PROMPT is non-empty string with required keywords."""
    assert isinstance(AIP_SYSTEM_PROMPT, str)
    assert len(AIP_SYSTEM_PROMPT) > 500

    required_keywords = [
        "dispatch", "alert", "evacuate", "reposition",
        "action_type", "resource_id", "zone_id", "confidence",
        "time_sensitivity", "rationale",
        "JSON", "no preamble", "no markdown",
    ]
    for keyword in required_keywords:
        assert keyword.lower() in AIP_SYSTEM_PROMPT.lower(), (
            f"Missing keyword: {keyword}"
        )


def test_format_agent_input_valid():
    """format_agent_input() accepts lists and returns valid JSON string."""
    ember_zones = [
        {"id": "E1", "lat": 37.1, "lng": -122.1, "probability": 0.87, "hotspot_id": "H1"},
    ]
    damage_zones = [
        {"id": "D1", "lat": 37.2, "lng": -122.2, "damage_probability": 0.92,
         "liquefaction_class": "High", "event_id": "EV1"},
    ]
    crews = [
        {"id": "C1", "crew_identifier": "C-01", "lat": 37.0, "lng": -122.0,
         "status": "standby", "capacity": 5, "assigned_zone_id": None},
    ]
    shelters = [
        {"id": "S1", "name": "Sunnyvale High", "lat": 37.25, "lng": -122.25,
         "occupancy": 250, "capacity": 500, "damage_zone_id": "D1"},
    ]
    hospitals = [
        {"id": "H1", "name": "El Camino Hospital", "lat": 37.3, "lng": -122.3,
         "current_capacity": 80, "alert_level": "yellow", "damage_zone_id": "D1"},
    ]
    routes = [
        {"id": "R1", "status": "open", "origin_zone_id": "D1", "destination_zone_id": "S1"},
    ]

    result = format_agent_input(ember_zones, damage_zones, crews, shelters, hospitals, routes)

    assert isinstance(result, str), "format_agent_input should return string"

    data = json.loads(result)

    assert "ember_risk_zones" in data
    assert "damage_zones" in data
    assert "suppression_crews" in data
    assert "shelters" in data
    assert "hospitals" in data
    assert "evacuation_routes" in data

    assert len(data["ember_risk_zones"]) == 1
    assert len(data["damage_zones"]) == 1
    assert len(data["suppression_crews"]) == 1
    assert len(data["shelters"]) == 1
    assert len(data["hospitals"]) == 1
    assert len(data["evacuation_routes"]) == 1


def test_format_agent_input_empty():
    """format_agent_input() handles empty lists gracefully."""
    result = format_agent_input([], [], [], [], [], [])
    data = json.loads(result)

    keys = [
        "ember_risk_zones", "damage_zones", "suppression_crews",
        "shelters", "hospitals", "evacuation_routes",
    ]
    assert all(isinstance(data[key], list) for key in keys)
    assert all(len(data[key]) == 0 for key in keys)


def test_format_agent_input_preserves_data():
    """format_agent_input() preserves all input fields."""
    ember_zones = [
        {"id": "E99", "lat": 37.999, "lng": -122.999, "probability": 0.99, "hotspot_id": "H99"},
    ]

    result = format_agent_input(ember_zones, [], [], [], [], [])
    data = json.loads(result)

    zone = data["ember_risk_zones"][0]
    assert zone["id"] == "E99"
    assert zone["lat"] == 37.999
    assert zone["lng"] == -122.999
    assert zone["probability"] == 0.99
    assert zone["hotspot_id"] == "H99"


def test_aip_prompt_structure():
    """AIP_SYSTEM_PROMPT includes required sections and examples."""
    required_sections = [
        "OUTPUT FORMAT",
        "DISPATCH",
        "ALERT SHELTERS",
        "ALERT EVACUATION",
        "REPOSITION CREWS",
        "SORT",
        "CONSTRAINTS",
    ]

    prompt_upper = AIP_SYSTEM_PROMPT.upper()
    for section in required_sections:
        assert section in prompt_upper, f"Missing section: {section}"

    assert "GOOD" in AIP_SYSTEM_PROMPT or "example" in AIP_SYSTEM_PROMPT.lower()
