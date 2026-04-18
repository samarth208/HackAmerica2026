import json
from datetime import datetime, timezone
from typing import Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        payload = json.dumps(message)
        dead = set()
        for ws in self.active_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active_connections.discard(ws)


def _envelope(event_type: str, data) -> dict:
    return {"type": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}


manager = ConnectionManager()


async def broadcast_damage_grid(cells: list):
    await manager.broadcast(_envelope("seismic_grid", cells))


async def broadcast_action_created(action: dict):
    await manager.broadcast(_envelope("action_card", action))


async def broadcast_crew_update(crew: dict):
    await manager.broadcast(_envelope("crew_update", crew))


async def broadcast_event_log(message: str, category: str):
    await manager.broadcast(_envelope("event_log", {"message": message, "category": category}))


async def broadcast_fire_hotspots(hotspots: list):
    await manager.broadcast(_envelope("fire_hotspots", hotspots))


async def broadcast_infrastructure(shelters: list, hospitals: list):
    await manager.broadcast(_envelope("infrastructure", {"shelters": shelters, "hospitals": hospitals}))
