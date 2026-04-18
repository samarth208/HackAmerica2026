"""Rule-based action engine — generates prioritized response recommendations from hazard state."""

from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_SEISMIC_RULES = [
    {
        "action_type": "dispatch",
        "confidence": 0.94,
        "time_sensitivity": "immediate",
        "rationale": "Deploy USAR Team Alpha to high-damage zone near Northridge epicenter (Zone 4, prob >0.85)",
    },
    {
        "action_type": "evacuate",
        "confidence": 0.88,
        "time_sensitivity": "immediate",
        "rationale": "Initiate mandatory evacuation for residential blocks 14–18 (liquefaction risk elevated)",
    },
    {
        "action_type": "reposition",
        "confidence": 0.81,
        "time_sensitivity": "high",
        "rationale": "Redirect Engine 42 from Staging Area B to Rinaldi Corridor — structural collapses confirmed",
    },
    {
        "action_type": "alert",
        "confidence": 0.76,
        "time_sensitivity": "high",
        "rationale": "Activate Northridge Hospital Medical Center surge protocol — casualty intake expected within 20 min",
    },
    {
        "action_type": "reposition",
        "confidence": 0.70,
        "time_sensitivity": "medium",
        "rationale": "Pre-position Crew 6 at Santa Clarita foothills — secondary aftershock probability 35% in 2h",
    },
]

_WILDFIRE_RULES = [
    {
        "action_type": "dispatch",
        "confidence": 0.91,
        "time_sensitivity": "immediate",
        "rationale": "Deploy Crew 7 to ember landing zone — particle density exceeds ignition threshold (0.78)",
    },
    {
        "action_type": "alert",
        "confidence": 0.85,
        "time_sensitivity": "high",
        "rationale": "Issue Red Flag Warning for Malibu PCH corridor — wind 28 knots, RH 9%, unstable fuel bed",
    },
    {
        "action_type": "evacuate",
        "confidence": 0.79,
        "time_sensitivity": "high",
        "rationale": "Order precautionary evacuation of Topanga Canyon Road (Zone 2) ahead of fire front",
    },
]


def generate_seismic_actions(damage_cells: list[dict] | None = None) -> list[dict]:
    """Generate rule-based action cards for a seismic event."""
    high_damage = [c for c in (damage_cells or []) if c.get("damage_probability", 0) > 0.7]
    rules = _SEISMIC_RULES[:3] if len(high_damage) < 20 else _SEISMIC_RULES
    return [
        {**r, "id": f"action-seismic-{i}", "created_at": _now()}
        for i, r in enumerate(rules[:3])
    ]


def generate_wildfire_actions(hotspots: list[dict] | None = None) -> list[dict]:
    """Generate rule-based action cards for a wildfire event."""
    return [
        {**r, "id": f"action-fire-{i}", "created_at": _now()}
        for i, r in enumerate(_WILDFIRE_RULES[:2])
    ]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def run_dispatch(
    ember_zones: list[dict],
    damage_zones: list[dict],
    crews: list[dict],
    shelters: list[dict],
    hospitals: list[dict],
    routes: list[dict],
) -> list[dict]:
    """Generate prioritized dispatch actions from hazard state."""
    actions: list[dict] = []

    high_damage = [z for z in damage_zones if z.get("damage_probability", 0) > 0.7]
    available_crews = [c for c in crews if c.get("status") == "available"]

    for zone in high_damage[:3]:
        if not available_crews:
            break
        crew = min(
            available_crews,
            key=lambda c: _haversine_km(c["lat"], c["lng"], zone["lat"], zone["lng"]),
        )
        available_crews.remove(crew)
        actions.append({
            "action_type": "dispatch",
            "resource_id": crew.get("crew_identifier", crew.get("id")),
            "zone_id": zone.get("grid_cell_id", zone.get("id")),
            "confidence": round(zone["damage_probability"], 2),
            "time_sensitivity": "immediate",
            "rationale": (
                f"Deploy {crew.get('crew_identifier', crew.get('id'))} to "
                f"high-damage zone (prob {zone['damage_probability']:.0%})"
            ),
        })

    for zone in ember_zones[:2]:
        if not available_crews:
            break
        crew = min(
            available_crews,
            key=lambda c: _haversine_km(c["lat"], c["lng"], zone["lat"], zone["lng"]),
        )
        available_crews.remove(crew)
        actions.append({
            "action_type": "dispatch",
            "resource_id": crew.get("crew_identifier", crew.get("id")),
            "zone_id": zone.get("id"),
            "confidence": round(zone.get("probability", 0.7), 2),
            "time_sensitivity": "high",
            "rationale": (
                f"Deploy {crew.get('crew_identifier', crew.get('id'))} to "
                f"ember risk zone (density {zone.get('probability', 0):.0%})"
            ),
        })

    return actions
