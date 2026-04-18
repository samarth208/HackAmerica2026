"""
Flink alert enrichment job.
Consumes raw.alerts.inbound, enriches with GPU telemetry and K8s events,
performs async Ontology API lookups, outputs to processed.alerts.enriched.

Env vars:
  KAFKA_BOOTSTRAP_SERVERS
  FOUNDRY_URL
  FOUNDRY_TOKEN
  FOUNDRY_ONTOLOGY_RID          default: ri.ontology.main.ontology.amd-ml
  FLINK_PARALLELISM             default: 16
  S3_CHECKPOINT_BUCKET          default: ceph-bucket
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

# PyFlink imports
from pyflink.common import WatermarkStrategy, Duration, Types
from pyflink.common.serialization import SimpleStringSchema
from pyflink.datastream import StreamExecutionEnvironment, CheckpointingMode
from pyflink.datastream.connectors.kafka import (
    KafkaSource,
    KafkaOffsetsInitializer,
    KafkaSink,
    KafkaRecordSerializationSchema,
)
from pyflink.datastream.functions import (
    CoProcessFunction,
    RuntimeContext,
    AsyncFunction,
    MapFunction,
)
from pyflink.datastream.state import (
    ValueStateDescriptor,
    ListStateDescriptor,
    StateTtlConfig,
)
from pyflink.datastream.window import TumblingEventTimeWindows
from pyflink.java_gateway import get_gateway

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Deserializers
# ---------------------------------------------------------------------------

class AlertDeserializer(MapFunction):
    """Deserializes a JSON string into an alert dict."""

    def map(self, value: str) -> dict:
        return json.loads(value)


class GpuTelemetryDeserializer(MapFunction):
    """
    Deserializes a GPU telemetry JSON string.

    Expected upstream schema (at minimum):
      node_id, device_id, utilization_pct, temperature_c, power_draw_w, timestamp_ms
    """

    def map(self, value: str) -> dict:
        raw: dict = json.loads(value)
        # Normalise to expected keys; fall back to sensible defaults so
        # downstream code never KeyErrors on a malformed message.
        return {
            "node_id": raw.get("node_id", ""),
            "device_id": raw.get("device_id", ""),
            "utilization_pct": float(raw.get("utilization_pct", 0.0)),
            "temperature_c": float(raw.get("temperature_c", 0.0)),
            "power_draw_w": float(raw.get("power_draw_w", 0.0)),
            "timestamp_ms": int(raw.get("timestamp_ms", 0)),
            # Preserve any extra fields the producer may include.
            **{k: v for k, v in raw.items()
               if k not in {"node_id", "device_id", "utilization_pct",
                            "temperature_c", "power_draw_w", "timestamp_ms"}},
        }


class K8sEventDeserializer(MapFunction):
    """
    Deserializes a Kubernetes event JSON string.

    Expected upstream schema (at minimum):
      namespace, pod_name, phase, timestamp_ms
    """

    def map(self, value: str) -> dict:
        raw: dict = json.loads(value)
        return {
            "namespace": raw.get("namespace", ""),
            "pod_name": raw.get("pod_name", ""),
            "phase": raw.get("phase", "Unknown"),
            "timestamp_ms": int(raw.get("timestamp_ms", 0)),
            **{k: v for k, v in raw.items()
               if k not in {"namespace", "pod_name", "phase", "timestamp_ms"}},
        }


# ---------------------------------------------------------------------------
# Async Ontology enrichment
# ---------------------------------------------------------------------------

class OntologyLookup(AsyncFunction):
    """Async enrichment with ComputeNode data from Palantir Ontology."""

    _cache: dict[str, tuple[dict, float]] = {}  # class-level: node_id -> (data, expiry_ts)
    CACHE_TTL = 300.0  # 5 minutes

    def __init__(self) -> None:
        self.foundry_url = os.environ["FOUNDRY_URL"]
        self.token = os.environ["FOUNDRY_TOKEN"]
        self.ontology_rid = os.environ.get(
            "FOUNDRY_ONTOLOGY_RID", "ri.ontology.main.ontology.amd-ml"
        )

    async def async_invoke(self, value: dict, result_future) -> None:  # type: ignore[override]
        node_id: str = value.get("node_id", "")

        # Check class-level cache first.
        cached = self._cache.get(node_id)
        if cached and time.time() < cached[1]:
            value["compute_node"] = cached[0]
            result_future.complete([value])
            return

        # Async HTTP call via aiohttp.
        import aiohttp  # imported lazily — not available at parse time on all envs

        url = (
            f"{self.foundry_url}/api/v2/ontologies/{self.ontology_rid}"
            f"/objects/ComputeNode/{node_id}"
        )
        headers = {"Authorization": f"Bearer {self.token}"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, headers=headers, timeout=aiohttp.ClientTimeout(total=5.0)
                ) as resp:
                    if resp.status == 200:
                        data: dict = await resp.json()
                        self._cache[node_id] = (data, time.time() + self.CACHE_TTL)
                        value["compute_node"] = data
                    else:
                        _log.warning(
                            "OntologyLookup HTTP %s for node_id=%s", resp.status, node_id
                        )
                        value["compute_node"] = {}
        except Exception as exc:  # pylint: disable=broad-except
            _log.warning("OntologyLookup failed for %s: %s", node_id, exc)
            value["compute_node"] = {}

        result_future.complete([value])


# ---------------------------------------------------------------------------
# Alert + GPU CoProcessFunction
# ---------------------------------------------------------------------------

class AlertGpuJoinFunction(CoProcessFunction):
    """
    Stateful join of alert events with GPU telemetry.

    - processElement1  → alert keyed by node_id
    - processElement2  → GPU telemetry keyed by node_id

    State:
      gpu_state    : ValueState[dict]  — most recent telemetry for this node
      pending_state: ListState[dict]   — alerts buffered while waiting for GPU data
    """

    def open(self, ctx: RuntimeContext) -> None:  # type: ignore[override]
        ttl_config = (
            StateTtlConfig
            .new_builder(org.apache.flink.api.common.time.Time.hours(1))  # type: ignore[name-defined]
            .set_update_type(StateTtlConfig.UpdateType.OnCreateAndWrite)
            .set_state_visibility(
                StateTtlConfig.StateVisibility.NeverReturnExpired
            )
            .build()
        )

        gpu_descriptor = ValueStateDescriptor("gpu_telemetry", Types.PICKLED_BYTE_ARRAY())
        gpu_descriptor.enable_time_to_live(ttl_config)
        self._gpu_state = ctx.get_state(gpu_descriptor)

        pending_descriptor = ListStateDescriptor("pending_alerts", Types.PICKLED_BYTE_ARRAY())
        pending_descriptor.enable_time_to_live(ttl_config)
        self._pending_state = ctx.get_list_state(pending_descriptor)

    # ------------------------------------------------------------------
    # Process alert (stream 1)
    # ------------------------------------------------------------------
    def processElement1(self, alert: dict, ctx, out) -> None:  # type: ignore[override]
        telemetry: dict | None = self._gpu_state.value()
        if telemetry is not None:
            out.collect(self._merge_alert_with_gpu(alert, telemetry))
        else:
            # Buffer until telemetry arrives for this node.
            self._pending_state.add(alert)

    # ------------------------------------------------------------------
    # Process GPU telemetry (stream 2)
    # ------------------------------------------------------------------
    def processElement2(self, telemetry: dict, ctx, out) -> None:  # type: ignore[override]
        # Update the latest telemetry state.
        self._gpu_state.update(telemetry)

        # Drain any pending alerts that were waiting for GPU data.
        pending = list(self._pending_state.get() or [])
        if pending:
            for alert in pending:
                out.collect(self._merge_alert_with_gpu(alert, telemetry))
            self._pending_state.clear()

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------
    @staticmethod
    def _merge_alert_with_gpu(alert: dict, telemetry: dict) -> dict:
        """Return a new dict with all alert fields plus key GPU metrics."""
        merged = dict(alert)
        merged["gpu_utilization_pct"] = telemetry.get("utilization_pct")
        merged["gpu_temperature_c"] = telemetry.get("temperature_c")
        merged["gpu_power_draw_w"] = telemetry.get("power_draw_w")
        merged["gpu_device_id"] = telemetry.get("device_id")
        return merged


# ---------------------------------------------------------------------------
# K8s enrichment
# ---------------------------------------------------------------------------

# NOTE: In production this dict would be populated via Flink broadcast state
# (BroadcastStream + BroadcastProcessFunction) so every parallel instance
# receives updates atomically.  Here we use a module-level dict for simplicity;
# it is populated by whatever process loads this module (e.g. a side-input
# pre-fetch at startup, or a periodic refresh thread).
_K8S_EVENTS: dict[str, dict] = {}


class K8sEnrichFunction(MapFunction):
    """
    Enriches alerts with the most recent Kubernetes pod event.

    Lookup key: "<namespace>:<pod_name>" sourced from alert fields
    `k8s_namespace` and `k8s_pod_name` (if present).

    Production implementation note:
      Replace `_K8S_EVENTS` with a Flink broadcast state pattern:
        - A dedicated K8s events stream is broadcast to all parallel instances.
        - `AlertK8sBroadcastProcessFunction(BroadcastProcessFunction)` maintains
          the broadcast state map and enriches main-stream alerts on the fly.
    """

    def map(self, enriched_alert: dict) -> dict:
        namespace: str = enriched_alert.get("k8s_namespace", "")
        pod_name: str = enriched_alert.get("k8s_pod_name", "")
        key = f"{namespace}:{pod_name}"
        event = _K8S_EVENTS.get(key)
        if event:
            enriched_alert["k8s_context"] = {
                "pod_phase": event.get("phase", "Unknown"),
                "namespace": event.get("namespace", namespace),
            }
        else:
            enriched_alert["k8s_context"] = {
                "pod_phase": "Unknown",
                "namespace": namespace,
            }
        return enriched_alert


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

class AlertSerializer(MapFunction):
    """Serializes an alert dict to a JSON string for the Kafka sink."""

    def map(self, alert: dict) -> str:
        return json.dumps(alert)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> None:
    parallelism = int(os.environ.get("FLINK_PARALLELISM", "16"))
    checkpoint_bucket = os.environ.get("S3_CHECKPOINT_BUCKET", "ceph-bucket")
    bootstrap_servers = os.environ["KAFKA_BOOTSTRAP_SERVERS"]

    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(parallelism)

    # Checkpointing: RocksDB, exactly-once, 60 s interval.
    env.enable_checkpointing(60_000, CheckpointingMode.EXACTLY_ONCE)
    checkpoint_config = env.get_checkpoint_config()
    checkpoint_config.set_checkpoint_storage_dir(
        f"s3://{checkpoint_bucket}/flink-checkpoints/alert-enrichment/"
    )

    # RocksDB state backend.
    from pyflink.datastream import EmbeddedRocksDBStateBackend  # noqa: PLC0415
    env.set_state_backend(EmbeddedRocksDBStateBackend())

    # Restart strategy: fixed-delay, 3 attempts, 30 s delay.
    env.set_restart_strategy(
        get_gateway().jvm.org.apache.flink.api.common.restartstrategy
        .RestartStrategies.fixedDelayRestart(3, 30_000)
    )

    # Watermark strategy: 30 s bounded out-of-orderness.
    watermark_strategy = (
        WatermarkStrategy
        .for_bounded_out_of_orderness(Duration.of_seconds(30))
        .with_timestamp_assigner(
            lambda event, _: event.get("timestamp_ms", 0) if isinstance(event, dict) else 0
        )
    )

    # ------------------------------------------------------------------
    # Sources
    # ------------------------------------------------------------------
    alert_source = (
        KafkaSource.builder()
        .set_bootstrap_servers(bootstrap_servers)
        .set_topics("raw.alerts.inbound")
        .set_group_id("flink-alert-enrichment")
        .set_starting_offsets(KafkaOffsetsInitializer.committed_offsets())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    gpu_source = (
        KafkaSource.builder()
        .set_bootstrap_servers(bootstrap_servers)
        .set_topics("raw.gpu.telemetry")
        .set_group_id("flink-alert-enrichment-gpu")
        .set_starting_offsets(KafkaOffsetsInitializer.committed_offsets())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    # ------------------------------------------------------------------
    # Build streams
    # ------------------------------------------------------------------
    alert_stream = (
        env.from_source(alert_source, watermark_strategy, "AlertSource")
        .map(AlertDeserializer())
        .key_by(lambda a: a.get("node_id", ""))
    )

    gpu_stream = (
        env.from_source(gpu_source, watermark_strategy, "GpuTelemetrySource")
        .map(GpuTelemetryDeserializer())
        .key_by(lambda t: t.get("node_id", ""))
    )

    # ------------------------------------------------------------------
    # Join: alerts + GPU telemetry
    # ------------------------------------------------------------------
    joined_stream = (
        alert_stream
        .connect(gpu_stream)
        .process(AlertGpuJoinFunction())
    )

    # ------------------------------------------------------------------
    # Async ontology lookup → K8s enrichment → serialize
    # ------------------------------------------------------------------
    from pyflink.datastream.functions import AsyncDataStream  # noqa: PLC0415

    enriched_stream = (
        AsyncDataStream.unordered_wait(
            joined_stream,
            OntologyLookup(),
            timeout=5000,   # milliseconds
            capacity=100,
        )
        .map(K8sEnrichFunction())
        .map(AlertSerializer())
    )

    # ------------------------------------------------------------------
    # Sink: processed.alerts.enriched
    # ------------------------------------------------------------------
    sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(bootstrap_servers)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("processed.alerts.enriched")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    enriched_stream.sink_to(sink)
    env.execute("alert-enrichment-job")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
