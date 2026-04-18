from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import asyncio

from backend.db import init_db
from backend.config import config
from backend.services.ws_broadcaster import manager


def _collect_routers():
    import importlib, pkgutil, backend.routers as pkg
    routers = []
    for finder, name, ispkg in pkgutil.iter_modules(pkg.__path__):
        try:
            mod = importlib.import_module(f"backend.routers.{name}")
            if hasattr(mod, "router"):
                routers.append((name, mod.router))
        except Exception as e:
            print(f"[aegis] Warning: could not load router {name}: {e}")
    return routers


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[aegis] Starting — initializing database...")
    init_db()
    print("[aegis] Database ready. AEGIS online.")
    yield
    print("[aegis] Shutting down.")


app = FastAPI(
    title="AEGIS",
    description="Real-time multi-hazard disaster response dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for name, router in _collect_routers():
    app.include_router(router)
    print(f"[aegis] Mounted router: {name}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": app.version,
        "env": config.env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(
            '{"type":"connected","data":"AEGIS online","timestamp":"'
            + datetime.now(timezone.utc).isoformat()
            + '"}'
        )
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_text(
                    '{"type":"ping","data":null,"timestamp":"'
                    + datetime.now(timezone.utc).isoformat()
                    + '"}'
                )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
