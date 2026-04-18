"""
Feature Store FastAPI application.

Env vars:
  FEATURE_STORE_API_KEY     API key for X-API-Key header auth
  MTLS_ENABLED              "true" or "false" (default "false")
  ALLOWED_CLIENT_CNS        comma-separated TLS client cert CNs (e.g. "svc-a,svc-b")
  REDIS_HOST                Redis hostname
  REDIS_PORT                Redis port (default 6379)
  REDIS_PASSWORD            Redis password
  FEAST_REPO_PATH           Path to feature_store.yaml directory (default /app/feast)
  DELTA_LAKE_BUCKET         S3 bucket for Delta Lake fallback queries
"""
from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Global clients — initialized in lifespan
_redis: Optional[aioredis.Redis] = None
_feast_store: Any = None  # feast.FeatureStore

_FEATURE_VIEW_TTLS = {
    "gpu_node_health_fv": 3600,
    "model_performance_fv": 1800,
    "training_run_fv": 300,
}

# entity_type → feature_view name mapping
_ENTITY_FV_MAP = {
    "node": "gpu_node_health_fv",
    "model": "model_performance_fv",
    "run": "training_run_fv",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _redis, _feast_store

    # Initialize Redis
    redis_host = os.environ.get("REDIS_HOST", "localhost")
    redis_port = int(os.environ.get("REDIS_PORT", "6379"))
    redis_password = os.environ.get("REDIS_PASSWORD", "")
    _redis = aioredis.Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password if redis_password else None,
        socket_timeout=2.0,
        socket_connect_timeout=2.0,
        decode_responses=True,
    )

    # Initialize Feast store
    feast_path = os.environ.get("FEAST_REPO_PATH", "/app/feast")
    try:
        from feast import FeatureStore
        _feast_store = FeatureStore(repo_path=feast_path)
        logger.info("Feast store initialized from %s", feast_path)
    except Exception as e:
        logger.error("Failed to initialize Feast store: %s", e)
        _feast_store = None

    yield

    # Cleanup
    if _redis:
        await _redis.close()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

API_KEY = os.environ.get("FEATURE_STORE_API_KEY", "")
MTLS_ENABLED = os.environ.get("MTLS_ENABLED", "false").lower() == "true"
ALLOWED_CNS = [
    cn.strip()
    for cn in os.environ.get("ALLOWED_CLIENT_CNS", "").split(",")
    if cn.strip()
]


async def verify_api_key(request: Request) -> None:
    key = request.headers.get("X-API-Key", "")
    if not key or key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")

    if MTLS_ENABLED and ALLOWED_CNS:
        # Extract client cert CN from TLS headers (set by nginx/envoy sidecar)
        client_cn = request.headers.get("X-Client-Cert-CN", "")
        if client_cn not in ALLOWED_CNS:
            raise HTTPException(
                status_code=401,
                detail=f"Client CN '{client_cn}' not in allowed list",
            )


# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------

app = FastAPI(title="Feature Store API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    latency_ms = (time.time() - t0) * 1000

    log_entry = {
        "method": request.method,
        "path": str(request.url.path),
        "status": response.status_code,
        "latency_ms": round(latency_ms, 2),
        "entity_type": request.path_params.get("entity_type", ""),
        "entity_id": request.path_params.get("entity_id", ""),
    }
    logger.info(json.dumps(log_entry))
    return response


# ---------------------------------------------------------------------------
# Redis helpers
# ---------------------------------------------------------------------------

async def _redis_get(key: str) -> Optional[dict]:
    if _redis is None:
        return None
    try:
        raw = await _redis.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("Redis GET failed for key=%s: %s", key, e)
        return None


async def _redis_set(key: str, value: dict, ttl: int) -> None:
    if _redis is None:
        return
    try:
        await _redis.setex(key, ttl, json.dumps(value))
    except Exception as e:
        logger.warning("Redis SET failed for key=%s: %s", key, e)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    redis_status = "ok"
    if _redis:
        try:
            await _redis.ping()
        except Exception:
            redis_status = "degraded"
    else:
        redis_status = "degraded"

    feast_status = "ok" if _feast_store is not None else "degraded"

    return {"status": "ok", "redis": redis_status, "feast": feast_status}


@app.get("/features/{entity_type}/{entity_id}")
async def get_features(
    entity_type: str,
    entity_id: str,
    feature_view: Optional[str] = None,
    _: None = Depends(verify_api_key),
):
    t0 = time.time()

    fv_name = feature_view or _ENTITY_FV_MAP.get(entity_type)
    if not fv_name:
        raise HTTPException(status_code=400, detail=f"Unknown entity_type: {entity_type}")

    cache_key = f"{entity_type}:{entity_id}:{fv_name}"

    # (1) Check Redis cache
    cached = await _redis_get(cache_key)
    if cached is not None:
        return {"source": "cache", "features": cached}

    # (2) Cache miss → Feast online store
    feast_result = None
    if _feast_store is not None:
        try:
            # Determine join key name from entity_type
            join_key_map = {"node": "node_id", "model": "model_id", "run": "run_id"}
            join_key = join_key_map.get(entity_type, f"{entity_type}_id")

            feature_vector = _feast_store.get_online_features(
                features=[f"{fv_name}:*"] if fv_name else [],
                entity_rows=[{join_key: entity_id}],
            ).to_dict()

            # Convert from columnar to row dict, skip join key and status cols
            features = {}
            for col_name, values in feature_vector.items():
                if col_name != join_key and not col_name.endswith("__status"):
                    features[col_name] = values[0] if values else None
            feast_result = features
        except Exception as e:
            latency_ms = (time.time() - t0) * 1000
            logger.error(
                json.dumps({
                    "error_type": type(e).__name__,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "feature_view": fv_name,
                    "latency_ms": round(latency_ms, 2),
                    "message": str(e),
                })
            )
            # Check for entity/feature not found
            if "not found" in str(e).lower():
                raise HTTPException(status_code=404, detail=str(e))
            # Fall through to upstream error
            raise HTTPException(
                status_code=503,
                detail={"error": "cache_unavailable", "fallback": "delta_lake"},
            )

    if feast_result is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "cache_unavailable", "fallback": "delta_lake"},
        )

    # (3) Cache the result
    ttl = _FEATURE_VIEW_TTLS.get(fv_name, 300)
    await _redis_set(cache_key, feast_result, ttl)

    return {"source": "feast", "features": feast_result}


class BatchFeaturesRequest(BaseModel):
    entity_type: str
    entity_ids: list[str]
    feature_view: str


@app.post("/features/batch")
async def get_features_batch(
    body: BatchFeaturesRequest,
    _: None = Depends(verify_api_key),
):
    t0 = time.time()
    results = []

    join_key_map = {"node": "node_id", "model": "model_id", "run": "run_id"}
    join_key = join_key_map.get(body.entity_type, f"{body.entity_type}_id")

    # Check Redis cache for each entity
    cache_hits: dict[str, dict] = {}
    cache_misses: list[str] = []

    for eid in body.entity_ids:
        cache_key = f"{body.entity_type}:{eid}:{body.feature_view}"
        cached = await _redis_get(cache_key)
        if cached is not None:
            cache_hits[eid] = cached
        else:
            cache_misses.append(eid)

    # Batch Feast lookup for cache misses
    feast_results: dict[str, dict] = {}
    if cache_misses and _feast_store is not None:
        try:
            entity_rows = [{join_key: eid} for eid in cache_misses]
            feature_vector = _feast_store.get_online_features(
                features=[f"{body.feature_view}:*"],
                entity_rows=entity_rows,
            ).to_dict()

            # Re-index by entity_id
            entity_ids_in_result = feature_vector.get(join_key, [])
            for i, eid in enumerate(entity_ids_in_result):
                row: dict[str, Any] = {}
                for col_name, values in feature_vector.items():
                    if col_name != join_key and not col_name.endswith("__status"):
                        row[col_name] = values[i] if i < len(values) else None
                feast_results[str(eid)] = row
        except Exception as e:
            logger.error(
                json.dumps({
                    "error_type": type(e).__name__,
                    "entity_type": body.entity_type,
                    "feature_view": body.feature_view,
                    "batch_size": len(cache_misses),
                    "latency_ms": round((time.time() - t0) * 1000, 2),
                    "message": str(e),
                })
            )

    # Cache Feast results
    ttl = _FEATURE_VIEW_TTLS.get(body.feature_view, 300)
    for eid, features in feast_results.items():
        cache_key = f"{body.entity_type}:{eid}:{body.feature_view}"
        await _redis_set(cache_key, features, ttl)

    # Assemble response
    for eid in body.entity_ids:
        features = cache_hits.get(eid) or feast_results.get(eid) or {}
        results.append({"entity_id": eid, "features": features})

    return {"results": results, "latency_ms": round((time.time() - t0) * 1000, 2)}


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)
