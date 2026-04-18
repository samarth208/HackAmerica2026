"""
Integration tests for all AEGIS API routes.

Uses an in-process ASGI client against a temp SQLite DB.
Background polling tasks (FIRMS / USGS) are mocked to no-ops.
"""
import pytest


# ── /health ───────────────────────────────────────────────────────────────────

async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── /api/counters ─────────────────────────────────────────────────────────────

async def test_counters(client):
    r = await client.get("/api/counters")
    assert r.status_code == 200
    data = r.json()
    expected_keys = [
        "active_hotspots",
        "crews_deployed",
        "crews_total",
        "damage_zones_above_threshold",
        "shelters_at_capacity",
        "hospitals_on_alert",
    ]
    for key in expected_keys:
        assert key in data, f"Missing key: {key}"
        assert isinstance(data[key], int), f"{key} is not an int"
        assert data[key] >= 0, f"{key} is negative"


# ── /api/sync-status ──────────────────────────────────────────────────────────

async def test_sync_status(client):
    r = await client.get("/api/sync-status")
    assert r.status_code == 200
    data = r.json()
    for pipeline in ("firms", "usgs", "weather"):
        assert pipeline in data, f"Missing pipeline: {pipeline}"
        assert "status" in data[pipeline]


# ── /api/crews ────────────────────────────────────────────────────────────────

async def test_crews(client):
    r = await client.get("/api/crews")
    assert r.status_code == 200
    crews = r.json()["crews"]
    assert len(crews) == 8
    for crew in crews:
        assert "crew_identifier" in crew
        assert "status" in crew


# ── /api/shelters ─────────────────────────────────────────────────────────────

async def test_shelters(client):
    r = await client.get("/api/shelters")
    assert r.status_code == 200
    assert len(r.json()["shelters"]) == 4


# ── /api/hospitals ────────────────────────────────────────────────────────────

async def test_hospitals(client):
    r = await client.get("/api/hospitals")
    assert r.status_code == 200
    assert len(r.json()["hospitals"]) == 3


# ── actions lifecycle ─────────────────────────────────────────────────────────

async def test_actions_lifecycle(client):
    # 1. Create
    payload = {
        "action_type": "deploy_crew",
        "confidence": 0.88,
        "time_sensitivity": "immediate",
        "rationale": "Test action for lifecycle verification",
    }
    r = await client.post("/api/actions", json=payload)
    assert r.status_code == 200
    action_id = r.json()["id"]
    assert isinstance(action_id, int)

    # 2. Approve
    r = await client.patch(f"/api/actions/{action_id}/approve")
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    # 3. Confirm status via individual GET
    r = await client.get(f"/api/actions/{action_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


# ── /api/simulate ─────────────────────────────────────────────────────────────

async def test_simulate(client):
    r = await client.post("/api/simulate")
    assert r.status_code == 200
    data = r.json()
    assert data["damage_zones_created"] > 0
    assert data["actions_created"] == 3


# ── /api/session ──────────────────────────────────────────────────────────────

async def test_session(client):
    # Ensure clean state
    await client.patch("/api/session", json={"mute_state": False})

    # GET baseline
    r = await client.get("/api/session")
    assert r.status_code == 200
    assert r.json()["mute_state"] is False

    # Mute
    r = await client.patch("/api/session", json={"mute_state": True})
    assert r.status_code == 200

    # Confirm persisted
    r = await client.get("/api/session")
    assert r.status_code == 200
    assert r.json()["mute_state"] is True
