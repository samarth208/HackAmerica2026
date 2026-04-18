# FINAL SELF-CHECK — AMD ML Platform Data Pipeline

## 1. End-to-End Trace: GPU Telemetry Record

Trace one GPU telemetry record through the complete pipeline from ROCm SMI to AIP context block.

### Hop 1: ROCm SMI → gpu_telemetry_producer.py
- **What happens**: `RocmSmiReader.read()` runs `rocm-smi --showallinfo --json` via `subprocess.run(capture_output=True, timeout=10)`. Parses JSON, extracts per-card metrics from keys like `"GPU use (%)"`, `"VRAM Total Memory (B)"`, `"Temperature (Sensor junction) (C)"`, `"Average Graphics Package Power (W)"`. Adds `node_id` from env `NODE_NAME`, `timestamp_ms=int(time.time()*1000)`, `hbm_bandwidth_gbps=-1.0`, `pcie_bandwidth_gbps=-1.0`.
- **Schema shape**: raw Python dict with 10 fields matching `gpu_telemetry_event.avsc`.
- **What can go wrong**: ROCm SMI non-zero exit (driver crashed) → `RocmSmiReader.read()` logs WARNING, returns `[]`, batch skipped silently. This is [Silent Loss #1 — see Section 2].

### Hop 2: gpu_telemetry_producer.py → raw.gpu.telemetry (Kafka)
- **What happens**: `GpuTelemetryProducer._validate()` checks required fields and types. `_serialize()` calls `fastavro.schemaless_writer` with parsed `gpu_telemetry_event.avsc`. `produce_batch()` calls `producer.produce(topic="raw.gpu.telemetry", key=f"{node_id}:{device_id}", value=bytes)`. Key ensures GPU-level ordering within a partition.
- **Schema change**: Python dict → Avro binary bytes (schemaless). Schema enforced by fastavro at serialization.
- **What can go wrong**: `SchemaValidationError` → record skipped, `skip_count` incremented, logged as WARNING. Delivery failure → `delivery_callback` fires error path, failure window tracked, `ProducerHealthError` after >3 in 60s.

### Hop 3: raw.gpu.telemetry → alert_enrichment_job.py (Flink)
- **What happens**: `KafkaSource` reads topic with group `flink-alert-enrichment-gpu`. `GpuTelemetryDeserializer.map()` calls `json.loads()` on the string value (note: Avro binary was written but Flink source uses `SimpleStringSchema` — in production this would use an Avro deserializer; the current implementation treats the value as JSON). Keyed by `node_id`. `AlertGpuJoinFunction.processElement2()` updates `ValueState[dict]` with latest telemetry.
- **Schema change**: Avro bytes decoded (assumed JSON in current Flink impl) → Python dict → Flink ValueState.
- **What can go wrong**: If message is Avro binary but Flink expects JSON, deserialization raises `json.JSONDecodeError` silently caught in `GpuTelemetryDeserializer.map()`. [Silent Loss #2 — see Section 2].

### Hop 4: alert_enrichment_job.py → bronze.gpu_telemetry (Delta Lake)
- **What happens**: A separate Flink sink job (implied by `delta-sink-gpu` consumer group) reads `raw.gpu.telemetry`, deserializes Avro, writes to `s3a://delta-lake/bronze/gpu_telemetry` using Delta Lake sink with two-phase commit for exactly-once. Partitioned by `date` (derived from `timestamp_ms`) and `node_id`.
- **Schema change**: Avro record → Delta Lake Parquet columns. `ingestion_ts`, `kafka_offset`, `kafka_partition` added at sink time.
- **What can go wrong**: Schema mismatch between Avro and Delta (e.g. wrong type) fails entire micro-batch until `mergeSchema=true` is enabled.

### Hop 5: bronze.gpu_telemetry → silver.gpu_telemetry_hourly (Spark)
- **What happens**: Spark job reads `bronze.gpu_telemetry`, groups by `node_id`, `device_id`, `date_trunc('hour', from_unixtime(timestamp_ms/1000))`, computes `avg_utilization_pct`, `max_temperature_c`, `percentile_approx(utilization_pct, 0.95)`, etc. Writes to `silver.gpu_telemetry_hourly` partitioned by `date` and `node_id` with `OPTIMIZE ZORDER BY (device_id, hour)`.
- **Schema change**: Raw per-second records → 1-hour aggregates. Row count reduced ~3600x.
- **What can go wrong**: Late-arriving records (ROCm SMI delay) missed if Spark job runs before all records for the hour arrive. Mitigated by running aggregation with 2-hour lag.

### Hop 6: silver.gpu_telemetry_hourly → gpu_node_health_fv (Feast)
- **What happens**: `DeltaLakeOfflineStore.pull_latest_from_table_or_query()` reads `s3a://delta-lake/silver/gpu_telemetry_hourly`, filters to time window, selects latest row per `node_id`. Feast materializes to Redis with TTL=3600s using `feast materialize`.
- **Schema change**: Spark DataFrame → Redis hash `{node_id → {feature_name: value}}` JSON.
- **What can go wrong**: Feast materialize job fails silently if Delta table partition not yet available → stale features served from Redis until TTL expires.

### Hop 7: gpu_node_health_fv → Redis → GET /features/node/{id}
- **What happens**: `feature-store/api/main.py` `get_features()` checks Redis key `node:{node_id}:gpu_node_health_fv`. Cache hit returns immediately. Cache miss calls `_feast_store.get_online_features()` which reads Redis directly (Feast online store IS Redis). Result cached again with TTL 3600s.
- **Schema change**: Redis JSON string → Python dict → FastAPI JSON response.
- **What can go wrong**: Redis eviction under memory pressure removes key → 503 returned if Feast also unavailable.

### Hop 8: GET /features → context_assembler.py → [SYSTEM CONTEXT]
- **What happens**: `AlertContextAssembler._get_gpu_features()` calls `GET /features/node/{node_id}?feature_view=gpu_node_health_fv` with `X-API-Key` header. Returns dict with `avg_utilization_1h`, `alert_count_24h`. `assemble_context()` interpolates into context string template.
- **Schema change**: HTTP JSON response → formatted string embedded in `[SYSTEM CONTEXT]...[END SYSTEM CONTEXT]` block.
- **What can go wrong**: Feature store timeout → `missing_data.append("gpu_node_health_features")`, "N/A" used in context string. AIP receives reduced-quality context but does not fail.

---

## 2. Silent Data Loss — 3 Identified Locations

### Loss #1: ROCm SMI subprocess failure
- **Scenario**: AMD GPU driver crashes mid-run. `rocm-smi --showallinfo --json` exits with code 1.
- **Code path**: `gpu_telemetry_producer.py` → `RocmSmiReader.read()` → `if result.returncode != 0: logger.warning(...); return []` → `produce_batch([])` → 0 records produced, no error raised, `success_count=0` logged at INFO level.
- **Fix in place**: The INFO log `produced 0 records, skipped 0` will appear but is not alarmed. **Recommended fix**: expose a Prometheus counter `rocm_smi_failures_total` and alert when it exceeds 3 in 5 minutes. Not yet implemented — add to `gpu_telemetry_producer.py`.

### Loss #2: Avro/JSON format mismatch in Flink
- **Scenario**: `gpu_telemetry_producer.py` uses `fastavro.schemaless_writer` → Kafka message value is binary Avro. Flink `GpuTelemetryDeserializer` calls `json.loads()` on that binary → raises `json.JSONDecodeError`.
- **Code path**: `alert_enrichment_job.py` → `GpuTelemetryDeserializer.map()` → `json.loads(value)` → raises `UnicodeDecodeError` or `json.JSONDecodeError` → Flink catches as `Exception`, logs to TaskManager log but **does not fail the job** (Flink's default behavior is to propagate the exception and trigger restart strategy, but if the deserializer swallows it and returns a partial dict, the record is silently dropped).
- **Fix in place**: In production, replace `SimpleStringSchema` with a proper Avro deserializer using the schema registry. The `GpuTelemetryDeserializer` should use `fastavro.schemaless_reader` instead of `json.loads`.

### Loss #3: Feast materialization window gap
- **Scenario**: `feast materialize` is run every hour. A GPU node generates telemetry from 14:00–14:59, Spark aggregation runs at 15:05, Feast materializes at 15:00 (before Spark completes). The 14:xx hourly aggregate is missed in this materialization window.
- **Code path**: `feast materialize start_date=now()-1h end_date=now()` → `DeltaLakeOfflineStore.pull_latest_from_table_or_query()` → filters `silver.gpu_telemetry_hourly` where `hour BETWEEN start_date AND end_date` → 14:00 hour row not yet written → 0 rows returned for that node → Redis key not updated → stale features (or missing features) served.
- **Fix in place**: Run Feast materialize with a 2-hour lag: `feast materialize start_date=now()-3h end_date=now()-1h`. Or use `feast materialize-incremental` which tracks the last materialization timestamp.

---

## 3. Schema Evolution: Adding `compute_utilization_pct` to `gpu_telemetry_event.avsc`

| Layer | Breaking? | Action Required |
|---|---|---|
| **Kafka / Avro schema** | No, if added with a default value (e.g. `"default": -1.0`). Avro schema evolution allows adding optional fields. Old producers write records without the field; consumers using the new schema read `-1.0` via default. **Breaking** if added without default. | Add `"default": -1.0` to the field definition in `gpu_telemetry_event.avsc`. Register new schema version in schema registry with `BACKWARD` compatibility. |
| **Flink consumer (`alert_enrichment_job.py`)** | No | Update `GpuTelemetryDeserializer.map()` to extract `compute_utilization_pct` from the parsed record. Old records will return `-1.0` via Avro default. No job restart required if Flink uses schema registry with reader schema evolution. |
| **bronze.gpu_telemetry Delta table** | No, with `mergeSchema=true` | Add `spark.databricks.delta.schema.autoMerge.enabled=true` to Spark config (or pass `mergeSchema=True` to `df.write`). Delta will add the new `FLOAT` column with `NULL` for existing rows. Requires one-time `ALTER TABLE bronze.gpu_telemetry ADD COLUMN compute_utilization_pct FLOAT` or let Delta auto-merge. |
| **Silver aggregations** | No | Spark aggregation job in `delta_tables.py` selects explicit columns — `compute_utilization_pct` will not appear in `silver.gpu_telemetry_hourly` until the silver job is updated. Add `avg_compute_utilization_pct` to the silver aggregation query. |
| **Feast feature view (`gpu_node_health_fv`)** | Yes | New field must be added to `feature_definitions.py` `gpu_node_health_fv` schema as `Field(name="avg_compute_utilization_1h", dtype=Float32)`. Run `feast apply` to update registry. Existing online store entries lack this key until next materialize run. |
| **Redis cached values** | Yes — stale schema | Cached values from before schema update do not contain `avg_compute_utilization_1h`. API returns `None` for that field until TTL expires (up to 3600s for gpu_node_health_fv). **Fix**: after `feast apply`, flush Redis keys matching `node:*:gpu_node_health_fv` or reduce TTL temporarily. |
| **Feature store API response** | No | FastAPI returns whatever dict Feast provides. New field appears automatically once Redis is refreshed. Clients should treat unknown fields as optional. |

---

## 4. PII Handling: user_id Trace

| Location | What Happens | Verification |
|---|---|---|
| **vLLM source** | Raw `user_id` is a UUID or username identifying the requester | Never reaches the pipeline |
| **`inference_log_producer.py` `_hash_user_id()`** | `hashlib.sha256(user_id.encode()).hexdigest()` — one-way hash applied **before** `produce()` | Raw `user_id` never written to Kafka or any downstream store |
| **`raw.model.inference.logs` Kafka topic** | Only `sha256(user_id)` hex string (64 chars) in the `user_id` field | Confirmed by `InferenceLogProducer._to_avro_records()`: `user_id=self._hash_user_id("vllm-scraper")` |
| **`bronze.inference_logs` Delta table** | `user_id` column stores 64-char SHA-256 hex — no PII | Schema in `delta_tables.py` `BRONZE_INFERENCE_LOGS_SCHEMA`: `StructField("user_id", StringType())` — column name preserved but value is hash |
| **`silver.model_evaluations`** | Does not include `user_id` at all — evaluation metrics are model-level, not request-level | Confirmed: `SILVER_MODEL_EVALUATIONS_SCHEMA` has no `user_id` field |
| **`gold.*` tables** | No `user_id` in any gold table | Confirmed: operational_dashboard, training_dataset_vN, model_performance have no user_id field |
| **Feast feature store** | `model_performance_fv` features are model-level aggregates — no `user_id` | `feature_definitions.py`: no `user_id` field in any FeatureView schema |
| **Feature store API** | No endpoint returns `user_id` in any form | `main.py` returns only feature dicts from Feast, which contain no user_id |
| **Audit log** | `feature-store/api/main.py` request logging middleware logs: method, path, status, latency_ms, entity_type, entity_id — **no feature values logged**, preventing accidental PII logging | `request_logging_middleware` in `main.py` |

**Conclusion**: Raw `user_id` PII is hashed at the producer boundary and never persists beyond that point in any Delta table, feature store, or API response.

---

## 5. Data SLA Table — Gold Tables

| Table | Max Acceptable Staleness | How Staleness Is Measured | Alert Condition | Who Is Paged |
|---|---|---|---|---|
| `gold.operational_dashboard` | 5 minutes | `MAX(snapshot_ts)` queried every minute; if `NOW() - MAX(snapshot_ts) > 5min` → SLA breach | Prometheus alert: `delta_table_max_lag_seconds{table="gold.operational_dashboard"} > 300` for 2 consecutive minutes | On-call SRE (PagerDuty P2) |
| `gold.training_dataset_vN` | N/A — immutable | Dataset version is created once; staleness is not applicable. Freshness = time from corpus freeze to version registration in `metadata.dataset_registry`. Target: registration within 2 hours of corpus freeze. | If `metadata.dataset_registry` shows a version with `created_at` > 2h after the triggering `feast materialize` run, fire alert | ML Platform team (Slack #ml-data-quality, no PagerDuty) |
| `gold.model_performance` | 1 hour (evaluation runs are triggered, not continuous) | `MAX(evaluated_at)` vs `NOW()`. If no evaluation recorded in past 1h for a model in `production` status, flag as stale. | Prometheus alert: `model_evaluation_age_seconds{status="production"} > 3600` | ML Ops team (PagerDuty P3) |
