"""
Feast feature definitions for AMD ML platform.
Entities, feature views, and feature services.

Env vars:
  DELTA_LAKE_BUCKET   S3 bucket for Delta Lake tables, e.g. delta-lake
"""
from __future__ import annotations

import os
from datetime import timedelta

from feast import Entity, FeatureService, FeatureView, Field
from feast.types import Float32, Int64, String
from feast.value_type import ValueType

from feature_store_components import DeltaLakeSource

# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------

node_entity = Entity(
    name="node_entity",
    join_keys=["node_id"],
    value_type=ValueType.STRING,
    description="Kubernetes/physical compute node",
)

model_entity = Entity(
    name="model_entity",
    join_keys=["model_id"],
    value_type=ValueType.STRING,
    description="ML model identifier",
)

run_entity = Entity(
    name="run_entity",
    join_keys=["run_id"],
    value_type=ValueType.STRING,
    description="Training run identifier",
)

# ---------------------------------------------------------------------------
# DeltaLake data sources
# ---------------------------------------------------------------------------

_bucket = os.environ.get("DELTA_LAKE_BUCKET", "delta-lake")

_gpu_hourly_source = DeltaLakeSource(
    path=f"s3a://{_bucket}/silver/gpu_telemetry_hourly",
    timestamp_field="hour",
    created_timestamp_column=None,
)

_inference_source = DeltaLakeSource(
    path=f"s3a://{_bucket}/bronze/inference_logs",
    timestamp_field="ingestion_ts",
    created_timestamp_column=None,
)

_training_metrics_source = DeltaLakeSource(
    path=f"s3a://{_bucket}/bronze/training_metrics",
    timestamp_field="ingestion_ts",
    created_timestamp_column=None,
)

# ---------------------------------------------------------------------------
# Feature Views
# ---------------------------------------------------------------------------

gpu_node_health_fv = FeatureView(
    name="gpu_node_health_fv",
    entities=[node_entity],
    ttl=timedelta(hours=1),
    source=_gpu_hourly_source,
    schema=[
        Field(name="avg_utilization_1h", dtype=Float32),
        Field(name="max_temperature_1h", dtype=Float32),
        Field(name="p95_memory_1h", dtype=Float32),
        Field(name="alert_count_24h", dtype=Int64),
        Field(name="incident_count_7d", dtype=Int64),
        Field(name="uptime_pct_30d", dtype=Float32),
    ],
)

model_performance_fv = FeatureView(
    name="model_performance_fv",
    entities=[model_entity],
    ttl=timedelta(minutes=30),
    source=_inference_source,
    schema=[
        Field(name="avg_latency_1h", dtype=Float32),
        Field(name="p99_latency_1h", dtype=Float32),
        Field(name="error_rate_1h", dtype=Float32),
        Field(name="throughput_1h", dtype=Float32),
        Field(name="active_replicas", dtype=Int64),
    ],
)

training_run_fv = FeatureView(
    name="training_run_fv",
    entities=[run_entity],
    ttl=timedelta(minutes=5),
    source=_training_metrics_source,
    schema=[
        Field(name="latest_loss", dtype=Float32),
        Field(name="latest_perplexity", dtype=Float32),
        Field(name="tokens_trained", dtype=Int64),
        Field(name="estimated_completion_pct", dtype=Float32),
        Field(name="gpu_utilization_avg", dtype=Float32),
    ],
)

# ---------------------------------------------------------------------------
# Feature Services
# ---------------------------------------------------------------------------

gpu_health_service = FeatureService(
    name="gpu_health_service",
    features=[gpu_node_health_fv],
)

model_perf_service = FeatureService(
    name="model_perf_service",
    features=[model_performance_fv],
)

training_monitor_service = FeatureService(
    name="training_monitor_service",
    features=[training_run_fv],
)
