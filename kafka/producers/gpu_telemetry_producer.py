"""
GPU telemetry Kafka producer.
Reads AMD GPU metrics via rocm-smi every 15 seconds and produces to raw.gpu.telemetry.

Env vars required:
  KAFKA_BOOTSTRAP_SERVERS   e.g. kafka-brokers:9092
  KAFKA_SECURITY_PROTOCOL   PLAINTEXT or SSL (default PLAINTEXT)
  KAFKA_SSL_CA_LOCATION     path to CA cert (required if SSL)
  NODE_NAME                 Kubernetes node name (injected via downward API)
  SCHEMA_PATH               path to gpu_telemetry_event.avsc (default /schemas/gpu_telemetry_event.avsc)
"""

import io
import json
import logging
import os
import signal
import subprocess
import sys
import time

import fastavro
from confluent_kafka import Producer

logger = logging.getLogger(__name__)

_shutdown = False


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class SchemaValidationError(Exception):
    """Raised when a record fails schema validation."""

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(f"field={field!r} reason={reason}")
        self.field = field
        self.reason = reason


class ProducerHealthError(Exception):
    """Raised when a device accumulates too many delivery failures."""

    def __init__(self, device_id: str, failure_count: int) -> None:
        super().__init__(
            f"device_id={device_id!r} failure_count={failure_count}"
        )
        self.device_id = device_id
        self.failure_count = failure_count


# ---------------------------------------------------------------------------
# ROCm-SMI reader
# ---------------------------------------------------------------------------

class RocmSmiReader:
    """Reads AMD GPU metrics from rocm-smi."""

    # Expected keys in each card dict returned by rocm-smi --json
    _REQUIRED_FIELDS = (
        "GPU use (%)",
        "GPU memory use (%)",
        "Temperature (Sensor junction) (C)",
        "Average Graphics Package Power (W)",
        "VRAM Total Memory (B)",
        "VRAM Total Used Memory (B)",
    )

    def __init__(self) -> None:
        self.node_id: str = os.environ["NODE_NAME"]

    def read(self) -> list:
        """Return a list of GPU metric dicts, one per card."""
        try:
            result = subprocess.run(
                ["rocm-smi", "--showallinfo", "--json"],
                capture_output=True,
                timeout=10,
            )
        except FileNotFoundError:
            logger.warning("rocm-smi not found on PATH")
            return []
        except subprocess.TimeoutExpired:
            logger.warning("rocm-smi timed out after 10 s")
            return []

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            logger.warning(
                "rocm-smi exited with code %d: %s", result.returncode, stderr
            )
            return []

        try:
            raw = json.loads(result.stdout.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            logger.warning("malformed rocm-smi JSON")
            return []

        records = []
        timestamp_ms = int(time.time() * 1000)

        for card_name, card in raw.items():
            # Skip top-level non-card keys (e.g. "system")
            if not isinstance(card, dict):
                continue
            try:
                utilization_pct = float(card["GPU use (%)"])
                memory_total_gb = int(card["VRAM Total Memory (B)"]) / 1e9
                memory_used_gb = int(card["VRAM Total Used Memory (B)"]) / 1e9
                temperature_c = float(
                    card["Temperature (Sensor junction) (C)"]
                )
                power_draw_w = float(
                    card["Average Graphics Package Power (W)"]
                )
            except (KeyError, ValueError) as exc:
                logger.warning(
                    "skipping card %s: missing field %s", card_name, exc
                )
                continue

            records.append(
                {
                    "node_id": self.node_id,
                    "device_id": card_name,
                    "timestamp_ms": timestamp_ms,
                    "utilization_pct": utilization_pct,
                    "memory_total_gb": memory_total_gb,
                    "memory_used_gb": memory_used_gb,
                    "temperature_c": temperature_c,
                    "power_draw_w": power_draw_w,
                    "hbm_bandwidth_gbps": -1.0,
                    "pcie_bandwidth_gbps": -1.0,
                }
            )

        return records


# ---------------------------------------------------------------------------
# Producer
# ---------------------------------------------------------------------------

# Required fields and their expected Python types for schema validation
_RECORD_SCHEMA = {
    "node_id": str,
    "device_id": str,
    "timestamp_ms": int,
    "utilization_pct": float,
    "memory_total_gb": float,
    "memory_used_gb": float,
    "temperature_c": float,
    "power_draw_w": float,
    "hbm_bandwidth_gbps": float,
    "pcie_bandwidth_gbps": float,
}


class GpuTelemetryProducer:
    """Confluent-Kafka producer for GPU telemetry events."""

    _TOPIC = "raw.gpu.telemetry"
    _FAILURE_WINDOW_SECONDS = 60.0
    _MAX_FAILURES_IN_WINDOW = 3

    def __init__(self) -> None:
        schema_path = os.environ.get(
            "SCHEMA_PATH", "/schemas/gpu_telemetry_event.avsc"
        )
        with open(schema_path, "r", encoding="utf-8") as fh:
            raw_schema = json.load(fh)
        self._parsed_schema = fastavro.parse_schema(raw_schema)

        security_protocol = os.environ.get(
            "KAFKA_SECURITY_PROTOCOL", "PLAINTEXT"
        ).upper()

        conf = {
            "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            "enable.idempotence": True,
            "acks": "all",
            "retries": 10,
            "retry.backoff.ms": 1000,
            "max.in.flight.requests.per.connection": 5,
        }

        if security_protocol == "SSL":
            conf["security.protocol"] = "SSL"
            conf["ssl.ca.location"] = os.environ["KAFKA_SSL_CA_LOCATION"]
        else:
            conf["security.protocol"] = "PLAINTEXT"

        self._producer = Producer(conf)
        # Maps device_id → list of failure epoch timestamps
        self._failure_window: dict = {}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate(self, record: dict) -> None:
        """Validate required fields exist and have correct types."""
        for field, expected_type in _RECORD_SCHEMA.items():
            if field not in record:
                raise SchemaValidationError(field, "missing field")
            value = record[field]
            if not isinstance(value, expected_type):
                raise SchemaValidationError(
                    field,
                    f"expected {expected_type.__name__}, got {type(value).__name__}",
                )

    def _serialize(self, record: dict) -> bytes:
        """Serialize record to Avro bytes using fastavro schemaless writer."""
        buf = io.BytesIO()
        fastavro.schemaless_writer(buf, self._parsed_schema, record)
        return buf.getvalue()

    def delivery_callback(self, err, msg) -> None:
        """Called by confluent-kafka on message delivery or failure."""
        if err is None:
            logger.debug(
                "delivered to %s[%d] offset=%d",
                msg.topic(),
                msg.partition(),
                msg.offset(),
            )
        else:
            logger.error(
                "delivery failed topic=%s partition=%d err=%s",
                msg.topic(),
                msg.partition(),
                err,
            )
            # Parse device_id from message key (format: "node_id:device_id")
            raw_key = msg.key()
            if raw_key is not None:
                key_str = (
                    raw_key.decode("utf-8", errors="replace")
                    if isinstance(raw_key, bytes)
                    else raw_key
                )
                parts = key_str.split(":", 1)
                device_id = parts[1] if len(parts) == 2 else key_str
            else:
                device_id = "unknown"

            now = time.time()
            window = self._failure_window.setdefault(device_id, [])
            window.append(now)
            # Prune entries older than 60 s
            cutoff = now - self._FAILURE_WINDOW_SECONDS
            self._failure_window[device_id] = [
                ts for ts in window if ts >= cutoff
            ]

            failure_count = len(self._failure_window[device_id])
            if failure_count > self._MAX_FAILURES_IN_WINDOW:
                raise ProducerHealthError(device_id, failure_count)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def produce_batch(self, devices: list) -> tuple:
        """Produce one Avro message per device.

        Returns (success_count, skip_count).
        """
        success_count = 0
        skip_count = 0

        for device in devices:
            try:
                self._validate(device)
            except SchemaValidationError as exc:
                logger.warning("skipping record due to validation error: %s", exc)
                skip_count += 1
                continue

            payload = self._serialize(device)
            key = f"{device['node_id']}:{device['device_id']}"

            self._producer.produce(
                topic=self._TOPIC,
                key=key,
                value=payload,
                on_delivery=self.delivery_callback,
            )
            self._producer.poll(0)
            success_count += 1

        self._producer.flush(timeout=30)
        return success_count, skip_count

    def flush(self) -> None:
        """Flush all outstanding messages."""
        self._producer.flush(timeout=30)


# ---------------------------------------------------------------------------
# Signal handling and main loop
# ---------------------------------------------------------------------------

def shutdown_handler(signum, frame) -> None:  # noqa: ARG001
    global _shutdown
    logger.info("SIGTERM received — shutting down")
    _shutdown = True


def main() -> None:
    global _shutdown

    reader = RocmSmiReader()
    producer = GpuTelemetryProducer()

    total_produced = 0
    total_skipped = 0

    def _sigterm(signum, frame):  # noqa: ARG001
        global _shutdown
        _shutdown = True
        logger.info(
            "SIGTERM: flushing producer. total_produced=%d total_skipped=%d",
            total_produced,
            total_skipped,
        )
        producer.flush()
        logger.info("producer flushed — exiting")

    signal.signal(signal.SIGTERM, _sigterm)

    try:
        while not _shutdown:
            t0 = time.time()
            devices = reader.read()
            success, skip = producer.produce_batch(devices)
            total_produced += success
            total_skipped += skip
            elapsed = time.time() - t0
            logger.info(
                "produced %d records, skipped %d, latency=%.2fs",
                success,
                skip,
                elapsed,
            )
            sleep_sec = max(0.0, 15.0 - elapsed)
            time.sleep(sleep_sec)
    except ProducerHealthError as exc:
        logger.critical(
            "ProducerHealthError: device=%s failure_count=%d — exiting",
            exc.device_id,
            exc.failure_count,
        )
        sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    main()
