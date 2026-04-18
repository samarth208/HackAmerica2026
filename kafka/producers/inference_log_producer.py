"""
Inference log Kafka producer.
Scrapes vLLM Prometheus metrics every 10 seconds, converts to Avro, produces to raw.model.inference.logs.

Env vars required:
  KAFKA_BOOTSTRAP_SERVERS
  KAFKA_SECURITY_PROTOCOL    PLAINTEXT or SSL (default PLAINTEXT)
  KAFKA_SSL_CA_LOCATION      path to CA cert (required if SSL)
  VLLM_HOST                  vLLM service hostname
  VLLM_PORT                  vLLM metrics port (default 8000)
  MODEL_ID                   model identifier string
  MODEL_VERSION              model version string
  SCHEMA_PATH                path to inference_log_event.avsc (default /schemas/inference_log_event.avsc)
  DLQ_TOPIC                  dead letter queue topic (default raw.dlq.inference.logs)
"""

import base64
import hashlib
import io
import json
import logging
import os
import signal
import sys
import time
import uuid

import fastavro
import requests
from confluent_kafka import Producer
from prometheus_client.parser import text_string_to_metric_families

logger = logging.getLogger(__name__)

_shutdown = False


# ---------------------------------------------------------------------------
# vLLM Prometheus scraper
# ---------------------------------------------------------------------------

class VllmMetricsScraper:
    """Scrapes Prometheus metrics from a running vLLM instance."""

    # Metric names as exported by vLLM
    _METRIC_NAMES = {
        "success": "vllm:request_success_total",
        "failure": "vllm:request_failure_total",
        "prompt_tokens": "vllm:prompt_tokens_total",
        "generation_tokens": "vllm:generation_tokens_total",
        "latency": "vllm:request_latency_seconds",
        "ttft": "vllm:time_to_first_token_seconds",
    }

    def __init__(self) -> None:
        self.host: str = os.environ["VLLM_HOST"]
        self.port: str = os.environ.get("VLLM_PORT", "8000")
        self._prev_counters: dict = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _histogram_p50(histogram_metric) -> float:
        """Compute p50 (median) from a Prometheus histogram metric object.

        Returns the upper-bound of the bucket that crosses the 50th
        percentile, converted to milliseconds.  Returns 0.0 if there is
        no data.
        """
        # Collect (upper_bound, cumulative_count) pairs from _bucket samples
        buckets = []
        total_count = 0.0

        for sample in histogram_metric.samples:
            if sample.name.endswith("_bucket"):
                upper_bound = sample.labels.get("le", "+Inf")
                if upper_bound == "+Inf":
                    total_count = sample.value
                else:
                    try:
                        buckets.append((float(upper_bound), sample.value))
                    except ValueError:
                        pass
            elif sample.name.endswith("_count"):
                total_count = sample.value

        if total_count == 0.0 or not buckets:
            return 0.0

        threshold = total_count * 0.5
        buckets.sort(key=lambda x: x[0])

        for upper_bound, cumulative_count in buckets:
            if cumulative_count >= threshold:
                return upper_bound * 1000.0  # convert seconds → ms

        # All observations are in the last finite bucket
        return buckets[-1][0] * 1000.0

    def scrape(self) -> dict:
        """Scrape /metrics from vLLM and return extracted values.

        Returns an empty dict on any connection error.
        """
        url = f"http://{self.host}:{self.port}/metrics"
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
        except requests.exceptions.ConnectionError as exc:
            logger.warning("vLLM metrics connection error: %s", exc)
            return {}
        except requests.exceptions.Timeout:
            logger.warning("vLLM metrics request timed out")
            return {}
        except requests.exceptions.RequestException as exc:
            logger.warning("vLLM metrics request failed: %s", exc)
            return {}

        result: dict = {
            "success_total": 0.0,
            "failure_total": 0.0,
            "prompt_tokens_total": 0.0,
            "generation_tokens_total": 0.0,
            "latency_p50_ms": 0.0,
            "ttft_p50_ms": 0.0,
        }

        name_to_key = {
            self._METRIC_NAMES["success"]: "success_total",
            self._METRIC_NAMES["failure"]: "failure_total",
            self._METRIC_NAMES["prompt_tokens"]: "prompt_tokens_total",
            self._METRIC_NAMES["generation_tokens"]: "generation_tokens_total",
        }

        for metric_family in text_string_to_metric_families(response.text):
            mname = metric_family.name

            if mname in name_to_key:
                key = name_to_key[mname]
                total = sum(s.value for s in metric_family.samples
                            if not s.name.endswith(("_created",)))
                result[key] = total

            elif mname == self._METRIC_NAMES["latency"]:
                result["latency_p50_ms"] = self._histogram_p50(metric_family)

            elif mname == self._METRIC_NAMES["ttft"]:
                result["ttft_p50_ms"] = self._histogram_p50(metric_family)

        return result

    def get_deltas(self) -> dict:
        """Return counter deltas since the last call plus current latency values."""
        current = self.scrape()
        if not current:
            return {}

        counter_keys = (
            "success_total",
            "failure_total",
            "prompt_tokens_total",
            "generation_tokens_total",
        )

        deltas: dict = {}
        for key in counter_keys:
            prev = self._prev_counters.get(key, 0.0)
            new_val = current.get(key, 0.0)
            # Counters should only increase; guard against resets
            deltas[key] = max(0.0, new_val - prev)

        # Gauges / summaries — use the current observation directly
        deltas["latency_p50_ms"] = current.get("latency_p50_ms", 0.0)
        deltas["ttft_p50_ms"] = current.get("ttft_p50_ms", 0.0)

        # Convenience aliases used by _to_avro_records
        deltas["prompt_tokens"] = deltas["prompt_tokens_total"]
        deltas["generation_tokens"] = deltas["generation_tokens_total"]

        # Update stored counters
        for key in counter_keys:
            self._prev_counters[key] = current.get(key, 0.0)

        return deltas


# ---------------------------------------------------------------------------
# Producer
# ---------------------------------------------------------------------------

class InferenceLogProducer:
    """Confluent-Kafka producer for inference log events."""

    _TOPIC = "raw.model.inference.logs"

    def __init__(self) -> None:
        schema_path = os.environ.get(
            "SCHEMA_PATH", "/schemas/inference_log_event.avsc"
        )
        with open(schema_path, "r", encoding="utf-8") as fh:
            raw_schema = json.load(fh)
        self._parsed_schema = fastavro.parse_schema(raw_schema)

        security_protocol = os.environ.get(
            "KAFKA_SECURITY_PROTOCOL", "PLAINTEXT"
        ).upper()

        base_conf = {
            "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            "enable.idempotence": True,
            "acks": "all",
            "retries": 10,
            "retry.backoff.ms": 1000,
            "max.in.flight.requests.per.connection": 5,
        }

        if security_protocol == "SSL":
            base_conf["security.protocol"] = "SSL"
            base_conf["ssl.ca.location"] = os.environ["KAFKA_SSL_CA_LOCATION"]
        else:
            base_conf["security.protocol"] = "PLAINTEXT"

        self._producer = Producer(base_conf)

        # DLQ producer — best-effort, acks=1
        dlq_conf = {
            "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            "acks": "1",
        }
        if security_protocol == "SSL":
            dlq_conf["security.protocol"] = "SSL"
            dlq_conf["ssl.ca.location"] = os.environ["KAFKA_SSL_CA_LOCATION"]
        else:
            dlq_conf["security.protocol"] = "PLAINTEXT"

        self._dlq_producer = Producer(dlq_conf)

        self.model_id: str = os.environ["MODEL_ID"]
        self.model_version: str = os.environ["MODEL_VERSION"]
        self.dlq_topic: str = os.environ.get(
            "DLQ_TOPIC", "raw.dlq.inference.logs"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _hash_user_id(self, user_id: str) -> str:
        return hashlib.sha256(user_id.encode()).hexdigest()

    def _to_avro_records(self, deltas: dict) -> list:
        """Convert scraped metric deltas to a list of inference log dicts."""
        success_count = int(deltas.get("success_total", 0))
        failure_count = int(deltas.get("failure_total", 0))

        if success_count + failure_count == 0:
            return []

        prompt_tokens_each = int(
            deltas.get("prompt_tokens", 0) / max(1, success_count)
        )
        completion_tokens_each = int(
            deltas.get("generation_tokens", 0) / max(1, success_count)
        )
        latency_ms = int(deltas.get("latency_p50_ms", 0))
        ttft_ms = int(deltas.get("ttft_p50_ms", 0))
        hashed_user = self._hash_user_id("vllm-scraper")
        timestamp_ms = int(time.time() * 1000)

        records = []

        for _ in range(success_count):
            records.append(
                {
                    "request_id": str(uuid.uuid4()),
                    "model_id": self.model_id,
                    "model_version": self.model_version,
                    "timestamp_ms": timestamp_ms,
                    "status": "SUCCESS",
                    "error_code": None,
                    "prompt_tokens": prompt_tokens_each,
                    "completion_tokens": completion_tokens_each,
                    "latency_ms": latency_ms,
                    "ttft_ms": ttft_ms,
                    "user_id": hashed_user,
                }
            )

        for _ in range(failure_count):
            records.append(
                {
                    "request_id": str(uuid.uuid4()),
                    "model_id": self.model_id,
                    "model_version": self.model_version,
                    "timestamp_ms": timestamp_ms,
                    "status": "ERROR",
                    "error_code": "SCRAPE_INFERRED_FAILURE",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "latency_ms": latency_ms,
                    "ttft_ms": ttft_ms,
                    "user_id": hashed_user,
                }
            )

        return records

    def _send_to_dlq(self, raw_data: bytes, error_reason: str) -> None:
        """Send un-serializable record bytes to the dead letter queue."""
        payload = json.dumps(
            {
                "error": error_reason,
                "timestamp_ms": int(time.time() * 1000),
                "raw_bytes_b64": base64.b64encode(raw_data).decode(),
            }
        ).encode("utf-8")
        self._dlq_producer.produce(topic=self.dlq_topic, value=payload)
        logger.warning("sent to DLQ: %s", error_reason)

    def _serialize(self, record: dict) -> bytes:
        buf = io.BytesIO()
        fastavro.schemaless_writer(buf, self._parsed_schema, record)
        return buf.getvalue()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def produce_batch(self, records: list) -> int:
        """Produce one Avro message per record.

        Returns the count of successfully produced records.
        """
        produced = 0

        for record in records:
            raw_data = json.dumps(record).encode("utf-8")
            try:
                payload = self._serialize(record)
            except Exception as exc:  # noqa: BLE001
                self._send_to_dlq(raw_data, str(exc))
                continue

            key = f"{record['model_id']}:{record['request_id']}"
            self._producer.produce(
                topic=self._TOPIC,
                key=key,
                value=payload,
            )
            self._producer.poll(0)
            produced += 1

        self._producer.flush(timeout=30)
        return produced

    def flush(self) -> None:
        """Flush all outstanding messages on both producers."""
        self._producer.flush(timeout=30)
        self._dlq_producer.flush(timeout=10)


# ---------------------------------------------------------------------------
# Signal handling and main loop
# ---------------------------------------------------------------------------

def main() -> None:
    global _shutdown

    scraper = VllmMetricsScraper()
    producer = InferenceLogProducer()

    total_produced = 0

    def _sigterm(signum, frame):  # noqa: ARG001
        global _shutdown
        _shutdown = True
        logger.info(
            "SIGTERM: flushing producers. total_produced=%d", total_produced
        )
        producer.flush()
        logger.info("producers flushed — exiting")

    signal.signal(signal.SIGTERM, _sigterm)

    while not _shutdown:
        t0 = time.time()

        deltas = scraper.get_deltas()
        if deltas:
            records = producer._to_avro_records(deltas)
            count = producer.produce_batch(records)
            total_produced += count
            logger.info("produced %d inference log records", count)
        else:
            logger.info("no metric deltas available this cycle")

        elapsed = time.time() - t0
        sleep_sec = max(0.0, 10.0 - elapsed)
        time.sleep(sleep_sec)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    main()
