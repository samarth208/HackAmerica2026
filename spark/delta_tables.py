"""
Delta Lake table DDL and schema definitions for AMD ML platform.
Run with: spark-submit --packages io.delta:delta-spark_2.12:3.2.0 delta_tables.py
"""
from __future__ import annotations

import logging
import os

from pyspark.sql import SparkSession
from pyspark.sql.types import (
    BooleanType,
    DateType,
    DoubleType,
    FloatType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Base S3 path – override via environment variable at runtime
# ---------------------------------------------------------------------------
_BASE = os.environ.get("DELTA_LAKE_BASE", "s3a://delta-lake")

# ===========================================================================
# BRONZE LAYER
# ===========================================================================

# ---------------------------------------------------------------------------
# bronze.gpu_telemetry
#
# Partitioning: date + node_id gives good partition pruning for per-node,
# per-day queries (dashboards, hourly aggregation jobs) without creating too
# many small files. date is derived from timestamp_ms at ingestion time.
#
# Z-ORDER: device_id and timestamp_ms – almost every analytical query
# filters or ranges on these two columns; co-locating their values in the
# same data files dramatically reduces the data scanned per query.
#
# OPTIMIZE schedule: daily (after nightly batch window closes).
# VACUUM schedule: 7d (bronze is hot-tier; keep only 7-day time-travel).
#
# Estimated size at 90-day retention:
#   4 000 msg/s × 512 B × 86 400 s/day × 90 days ≈ 1.6 TB (uncompressed)
#   ~400–600 GB after zstd compression
# ---------------------------------------------------------------------------
BRONZE_GPU_TELEMETRY_SCHEMA = StructType(
    [
        StructField("node_id", StringType(), nullable=False),
        StructField("device_id", StringType(), nullable=False),
        StructField("timestamp_ms", LongType(), nullable=False),
        StructField("utilization_pct", FloatType(), nullable=True),
        StructField("memory_used_gb", FloatType(), nullable=True),
        StructField("memory_total_gb", FloatType(), nullable=True),
        StructField("temperature_c", FloatType(), nullable=True),
        StructField("power_draw_w", FloatType(), nullable=True),
        StructField("hbm_bandwidth_gbps", FloatType(), nullable=True),
        StructField("pcie_bandwidth_gbps", FloatType(), nullable=True),
        StructField("ingestion_ts", TimestampType(), nullable=False),
        StructField("kafka_offset", LongType(), nullable=True),
        StructField("kafka_partition", IntegerType(), nullable=True),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

BRONZE_GPU_TELEMETRY_DDL = f"""
CREATE TABLE IF NOT EXISTS bronze.gpu_telemetry (
    node_id            STRING    NOT NULL COMMENT 'Kubernetes node name',
    device_id          STRING    NOT NULL COMMENT 'GPU device identifier (e.g. GPU-0)',
    timestamp_ms       BIGINT    NOT NULL COMMENT 'Event epoch timestamp in milliseconds',
    utilization_pct    FLOAT     COMMENT 'GPU utilization percentage 0-100',
    memory_used_gb     FLOAT     COMMENT 'HBM memory currently in use (GB)',
    memory_total_gb    FLOAT     COMMENT 'Total HBM capacity (GB)',
    temperature_c      FLOAT     COMMENT 'GPU junction temperature (°C)',
    power_draw_w       FLOAT     COMMENT 'Instantaneous power draw (W)',
    hbm_bandwidth_gbps FLOAT     COMMENT 'HBM memory bandwidth utilization (GB/s)',
    pcie_bandwidth_gbps FLOAT    COMMENT 'PCIe bandwidth utilization (GB/s)',
    ingestion_ts       TIMESTAMP NOT NULL COMMENT 'Kafka consumer ingestion wall-clock time',
    kafka_offset       BIGINT    COMMENT 'Source Kafka partition offset',
    kafka_partition    INT       COMMENT 'Source Kafka partition number',
    date               DATE      NOT NULL COMMENT 'Partition column derived from timestamp_ms'
)
USING DELTA
PARTITIONED BY (date, node_id)
LOCATION '{_BASE}/bronze/gpu_telemetry'
COMMENT 'Raw GPU telemetry events streamed from AMD ROCm / DCGM Kafka topic'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.logRetentionDuration'       = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 7 days'
)
"""

# ---------------------------------------------------------------------------
# bronze.inference_logs
#
# Partitioning: date + model_id – inference analytics almost always scope
# to a specific model and time range, making this a natural partition key.
#
# Z-ORDER: request_id and timestamp_ms – lookup by request_id for tracing
# and range scans on timestamp_ms for latency SLO analysis.
#
# OPTIMIZE: daily. VACUUM: 7d (short-lived raw logs; Silver has the truth).
#
# Estimated size at 90-day retention:
#   2 000 msg/s × 256 B × 86 400 s/day × 90 days ≈ 400 GB (uncompressed)
#   ~100–150 GB after zstd compression
# ---------------------------------------------------------------------------
BRONZE_INFERENCE_LOGS_SCHEMA = StructType(
    [
        StructField("request_id", StringType(), nullable=False),
        StructField("model_id", StringType(), nullable=False),
        StructField("model_version", StringType(), nullable=False),
        StructField("timestamp_ms", LongType(), nullable=False),
        StructField("prompt_tokens", IntegerType(), nullable=True),
        StructField("completion_tokens", IntegerType(), nullable=True),
        StructField("latency_ms", LongType(), nullable=True),
        StructField("ttft_ms", LongType(), nullable=True),
        StructField("status", StringType(), nullable=False),
        StructField("error_code", StringType(), nullable=True),
        StructField("user_id", StringType(), nullable=True),
        StructField("ingestion_ts", TimestampType(), nullable=False),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

BRONZE_INFERENCE_LOGS_DDL = f"""
CREATE TABLE IF NOT EXISTS bronze.inference_logs (
    request_id        STRING    NOT NULL COMMENT 'Globally unique inference request UUID',
    model_id          STRING    NOT NULL COMMENT 'Logical model identifier',
    model_version     STRING    NOT NULL COMMENT 'Deployed model version tag',
    timestamp_ms      BIGINT    NOT NULL COMMENT 'Request arrival epoch timestamp (ms)',
    prompt_tokens     INT       COMMENT 'Number of tokens in the prompt',
    completion_tokens INT       COMMENT 'Number of tokens generated',
    latency_ms        BIGINT    COMMENT 'End-to-end request latency (ms)',
    ttft_ms           BIGINT    COMMENT 'Time-to-first-token latency (ms)',
    status            STRING    NOT NULL COMMENT 'HTTP/gRPC status (success, error, timeout)',
    error_code        STRING    COMMENT 'Application-level error code (nullable)',
    user_id           STRING    COMMENT 'Originating user identifier',
    ingestion_ts      TIMESTAMP NOT NULL COMMENT 'Kafka consumer ingestion wall-clock time',
    date              DATE      NOT NULL COMMENT 'Partition column derived from timestamp_ms'
)
USING DELTA
PARTITIONED BY (date, model_id)
LOCATION '{_BASE}/bronze/inference_logs'
COMMENT 'Raw inference request/response logs from vLLM serving layer'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 7 days'
)
"""

# ---------------------------------------------------------------------------
# bronze.training_metrics
#
# Partitioning: date + run_id – training jobs are queried almost entirely
# by run. Using run_id as a partition key gives per-run file locality and
# avoids cross-partition scans when rendering a single training curve.
#
# Z-ORDER: run_id and step – enables efficient range scans on step within
# a run (e.g. "show me loss curve for run X between steps 1000–5000").
#
# OPTIMIZE: daily. VACUUM: 90d – training runs may be re-analysed months
# after completion; keep long time-travel for auditability.
#
# Estimated size at 90-day retention:
#   50 msg/s × 1 KB × 86 400 s/day × 90 days ≈ 4 GB (uncompressed)
# ---------------------------------------------------------------------------
BRONZE_TRAINING_METRICS_SCHEMA = StructType(
    [
        StructField("run_id", StringType(), nullable=False),
        StructField("step", IntegerType(), nullable=False),
        StructField("timestamp_ms", LongType(), nullable=False),
        StructField("train_loss", FloatType(), nullable=True),
        StructField("grad_norm", FloatType(), nullable=True),
        StructField("learning_rate", FloatType(), nullable=True),
        StructField("tokens_per_sec", FloatType(), nullable=True),
        StructField("mfu_pct", FloatType(), nullable=True),
        StructField("gpu_memory_per_device_gb", FloatType(), nullable=True),
        StructField("ingestion_ts", TimestampType(), nullable=False),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

BRONZE_TRAINING_METRICS_DDL = f"""
CREATE TABLE IF NOT EXISTS bronze.training_metrics (
    run_id                   STRING    NOT NULL COMMENT 'MLflow / custom run UUID',
    step                     INT       NOT NULL COMMENT 'Global training step number',
    timestamp_ms             BIGINT    NOT NULL COMMENT 'Metric emission epoch timestamp (ms)',
    train_loss               FLOAT     COMMENT 'Cross-entropy training loss',
    grad_norm                FLOAT     COMMENT 'Gradient L2 norm (pre-clipping)',
    learning_rate            FLOAT     COMMENT 'Current learning rate at this step',
    tokens_per_sec           FLOAT     COMMENT 'Aggregate tokens/second across all GPUs',
    mfu_pct                  FLOAT     COMMENT 'Model FLOPS utilization percentage',
    gpu_memory_per_device_gb FLOAT     COMMENT 'Peak GPU memory per device (GB)',
    ingestion_ts             TIMESTAMP NOT NULL COMMENT 'Kafka consumer ingestion wall-clock time',
    date                     DATE      NOT NULL COMMENT 'Partition column derived from timestamp_ms'
)
USING DELTA
PARTITIONED BY (date, run_id)
LOCATION '{_BASE}/bronze/training_metrics'
COMMENT 'Raw per-step training metrics emitted by distributed training jobs'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ---------------------------------------------------------------------------
# bronze.raw_text_corpus
#
# Partitioning: source + date – corpus data arrives from distinct sources
# (Common Crawl, GitHub, arXiv, etc.). Scoping by source first dramatically
# reduces scan surface for per-source quality and dedup pipelines.
#
# Z-ORDER: dedup_hash – the primary access pattern after ingestion is
# deduplication by hash; co-locating same/similar hashes cuts shuffle cost.
#
# OPTIMIZE: weekly (large files, low change rate). VACUUM: 90d.
#
# Estimated size at 1T tokens:
#   Assuming ~4 chars/token and UTF-8 encoding → ~1 TB raw text
#   After zstd → ~200–400 GB; metadata-only access for downstream ≈ ~50 TB
#   total storage including full raw_text column.
# ---------------------------------------------------------------------------
BRONZE_RAW_TEXT_CORPUS_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), nullable=False),
        StructField("source", StringType(), nullable=False),
        StructField("raw_text", StringType(), nullable=True),
        StructField("file_path", StringType(), nullable=True),
        StructField("ingested_at", TimestampType(), nullable=False),
        StructField("language_detected", StringType(), nullable=True),
        StructField("dedup_hash", StringType(), nullable=True),
        StructField("byte_size", LongType(), nullable=True),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

BRONZE_RAW_TEXT_CORPUS_DDL = f"""
CREATE TABLE IF NOT EXISTS bronze.raw_text_corpus (
    document_id       STRING    NOT NULL COMMENT 'Globally unique document identifier (UUID)',
    source            STRING    NOT NULL COMMENT 'Corpus source label (e.g. common_crawl, github)',
    raw_text          STRING    COMMENT 'Full raw document text (may be NULL for large docs stored externally)',
    file_path         STRING    COMMENT 'S3 path to source file',
    ingested_at       TIMESTAMP NOT NULL COMMENT 'Document ingestion wall-clock time',
    language_detected STRING    COMMENT 'ISO 639-1 language code (nullable; set by LID model)',
    dedup_hash        STRING    COMMENT 'MinHash or SHA-256 fingerprint for deduplication',
    byte_size         BIGINT    COMMENT 'Raw byte size of the document',
    date              DATE      NOT NULL COMMENT 'Partition column derived from ingested_at'
)
USING DELTA
PARTITIONED BY (source, date)
LOCATION '{_BASE}/bronze/raw_text_corpus'
COMMENT 'Raw ingested text corpus before quality filtering and deduplication'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ===========================================================================
# SILVER LAYER
# ===========================================================================

# ---------------------------------------------------------------------------
# silver.gpu_telemetry_hourly
#
# Partitioning: date + node_id – mirrors the bronze partition scheme;
# aggregation jobs write one partition per node per day. Dashboard queries
# that filter on a date range and one or a few nodes prune aggressively.
#
# Z-ORDER: device_id and hour – most analytical queries (SLO heatmaps,
# per-device trend lines) filter on device_id and range over hour.
#
# OPTIMIZE: daily (after hourly aggregation job completes). VACUUM: 90d.
#
# Estimated size at 90-day retention:
#   ~300 GPU nodes × 24 hours × 90 days × ~600 B/row ≈ ~400 MB
#   Practical estimate including over-provisioning: ~5 GB
# ---------------------------------------------------------------------------
SILVER_GPU_TELEMETRY_HOURLY_SCHEMA = StructType(
    [
        StructField("node_id", StringType(), nullable=False),
        StructField("device_id", StringType(), nullable=False),
        StructField("hour", TimestampType(), nullable=False),
        StructField("avg_utilization_pct", FloatType(), nullable=True),
        StructField("max_utilization_pct", FloatType(), nullable=True),
        StructField("p95_utilization_pct", FloatType(), nullable=True),
        StructField("avg_temperature_c", FloatType(), nullable=True),
        StructField("max_temperature_c", FloatType(), nullable=True),
        StructField("avg_power_draw_w", FloatType(), nullable=True),
        StructField("max_power_draw_w", FloatType(), nullable=True),
        StructField("avg_hbm_bandwidth_gbps", FloatType(), nullable=True),
        StructField("avg_pcie_bandwidth_gbps", FloatType(), nullable=True),
        StructField("sample_count", LongType(), nullable=False),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

SILVER_GPU_TELEMETRY_HOURLY_DDL = f"""
CREATE TABLE IF NOT EXISTS silver.gpu_telemetry_hourly (
    node_id                STRING    NOT NULL COMMENT 'Kubernetes node name',
    device_id              STRING    NOT NULL COMMENT 'GPU device identifier',
    hour                   TIMESTAMP NOT NULL COMMENT 'Truncated hour window start (UTC)',
    avg_utilization_pct    FLOAT     COMMENT 'Mean GPU utilization in window (%)',
    max_utilization_pct    FLOAT     COMMENT 'Peak GPU utilization in window (%)',
    p95_utilization_pct    FLOAT     COMMENT '95th-percentile utilization in window (%)',
    avg_temperature_c      FLOAT     COMMENT 'Mean junction temperature in window (°C)',
    max_temperature_c      FLOAT     COMMENT 'Peak junction temperature in window (°C)',
    avg_power_draw_w       FLOAT     COMMENT 'Mean power draw in window (W)',
    max_power_draw_w       FLOAT     COMMENT 'Peak power draw in window (W)',
    avg_hbm_bandwidth_gbps FLOAT     COMMENT 'Mean HBM bandwidth in window (GB/s)',
    avg_pcie_bandwidth_gbps FLOAT    COMMENT 'Mean PCIe bandwidth in window (GB/s)',
    sample_count           BIGINT    NOT NULL COMMENT 'Number of raw samples aggregated',
    date                   DATE      NOT NULL COMMENT 'Partition column derived from hour'
)
USING DELTA
PARTITIONED BY (date, node_id)
LOCATION '{_BASE}/silver/gpu_telemetry_hourly'
COMMENT 'Hourly aggregated GPU telemetry for dashboards and SLO monitoring'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ---------------------------------------------------------------------------
# silver.alert_enriched
#
# Partitioning: date (from triggered_at) + severity – ops dashboards and
# on-call queries almost always filter by severity (P1/P2) and date.
# Keeping severity as a partition column eliminates full scans for critical
# alert SLA queries.
#
# Z-ORDER: alert_id and triggered_at – point lookups by alert_id (incident
# drill-down) and range scans on triggered_at (timeline views).
#
# OPTIMIZE: daily. VACUUM: 30d (alerts resolved quickly; 30-day window
# covers incident post-mortems without excessive storage overhead).
#
# Estimated size: ~2 GB at 30-day retention
# ---------------------------------------------------------------------------
SILVER_ALERT_ENRICHED_SCHEMA = StructType(
    [
        StructField("alert_id", StringType(), nullable=False),
        StructField("title", StringType(), nullable=False),
        StructField("severity", StringType(), nullable=False),
        StructField("status", StringType(), nullable=False),
        StructField("source_system", StringType(), nullable=False),
        StructField("triggered_at", TimestampType(), nullable=False),
        StructField("node_id", StringType(), nullable=True),
        StructField("node_hostname", StringType(), nullable=True),
        StructField("gpu_count", IntegerType(), nullable=True),
        StructField("avg_utilization_at_trigger", FloatType(), nullable=True),
        StructField("recent_k8s_events_json", StringType(), nullable=True),
        StructField("ontology_node_rid", StringType(), nullable=True),
        StructField("enriched_at", TimestampType(), nullable=False),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

SILVER_ALERT_ENRICHED_DDL = f"""
CREATE TABLE IF NOT EXISTS silver.alert_enriched (
    alert_id                   STRING    NOT NULL COMMENT 'Unique alert identifier',
    title                      STRING    NOT NULL COMMENT 'Human-readable alert title',
    severity                   STRING    NOT NULL COMMENT 'Alert severity: P1, P2, P3, P4',
    status                     STRING    NOT NULL COMMENT 'Alert state: firing, resolved, silenced',
    source_system              STRING    NOT NULL COMMENT 'Originating system: prometheus, dcgm, k8s',
    triggered_at               TIMESTAMP NOT NULL COMMENT 'Alert firing timestamp (UTC)',
    node_id                    STRING    COMMENT 'Affected Kubernetes node (if applicable)',
    node_hostname              STRING    COMMENT 'Resolved node FQDN',
    gpu_count                  INT       COMMENT 'Number of GPUs on the affected node',
    avg_utilization_at_trigger FLOAT     COMMENT 'Mean GPU utilization at time of alert (%)',
    recent_k8s_events_json     STRING    COMMENT 'JSON array of recent K8s events on the node',
    ontology_node_rid          STRING    COMMENT 'Foundry ontology node resource identifier',
    enriched_at                TIMESTAMP NOT NULL COMMENT 'Enrichment pipeline completion timestamp',
    date                       DATE      NOT NULL COMMENT 'Partition column derived from triggered_at'
)
USING DELTA
PARTITIONED BY (date, severity)
LOCATION '{_BASE}/silver/alert_enriched'
COMMENT 'Enriched alerts joined with node topology and GPU context'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 30 days',
    'delta.deletedFileRetentionDuration' = 'interval 30 days'
)
"""

# ---------------------------------------------------------------------------
# silver.training_corpus_clean
#
# Partitioning: source + quality_tier – quality filtering pipelines and
# dataset assembly jobs access the corpus by source and tier (e.g. "all
# high-quality GitHub docs"). This two-level partition cuts scan volume
# by 10–50× vs. scanning the full corpus.
#
# Z-ORDER: dedup_hash and quality_score – dedup pipelines scan by hash;
# dataset versioning queries filter on quality_score ranges.
#
# OPTIMIZE: weekly (bulk batch writes). VACUUM: 90d.
#
# Estimated size: ~10 TB metadata-only (raw_text excluded from silver;
# file_path references blob storage for the actual text).
# ---------------------------------------------------------------------------
SILVER_TRAINING_CORPUS_CLEAN_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), nullable=False),
        StructField("source", StringType(), nullable=False),
        StructField("dedup_hash", StringType(), nullable=False),
        StructField("language_detected", StringType(), nullable=False),
        StructField("quality_score", FloatType(), nullable=False),
        StructField("quality_tier", StringType(), nullable=False),
        StructField("token_count_estimate", IntegerType(), nullable=True),
        StructField("file_path", StringType(), nullable=False),
        StructField("processed_at", TimestampType(), nullable=False),
        StructField("pii_detected", BooleanType(), nullable=False),
    ]
)

SILVER_TRAINING_CORPUS_CLEAN_DDL = f"""
CREATE TABLE IF NOT EXISTS silver.training_corpus_clean (
    document_id          STRING    NOT NULL COMMENT 'Document UUID matching bronze.raw_text_corpus',
    source               STRING    NOT NULL COMMENT 'Corpus source label',
    dedup_hash           STRING    NOT NULL COMMENT 'MinHash fingerprint for exact/near-dup detection',
    language_detected    STRING    NOT NULL COMMENT 'ISO 639-1 language code',
    quality_score        FLOAT     NOT NULL COMMENT 'Quality classifier score 0.0–1.0',
    quality_tier         STRING    NOT NULL COMMENT 'Bucketed tier: high, medium, low, rejected',
    token_count_estimate INT       COMMENT 'Estimated GPT-2 token count',
    file_path            STRING    NOT NULL COMMENT 'S3 path to cleaned text blob',
    processed_at         TIMESTAMP NOT NULL COMMENT 'Quality pipeline completion timestamp',
    pii_detected         BOOLEAN   NOT NULL COMMENT 'True if PII was detected and masked'
)
USING DELTA
PARTITIONED BY (source, quality_tier)
LOCATION '{_BASE}/silver/training_corpus_clean'
COMMENT 'Deduplicated, quality-filtered training corpus metadata (text stored externally)'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ---------------------------------------------------------------------------
# silver.model_evaluations
#
# Partitioning: date (from evaluated_at) + model_id – evaluation queries
# are almost always scoped to a specific model and time range (e.g.
# "how has model X performed on MMLU over the past 30 days?").
#
# Z-ORDER: model_id and benchmark_name – primary access pattern is
# filtering by model+benchmark combination for regression detection.
#
# OPTIMIZE: weekly (low write frequency). VACUUM: 90d.
#
# Estimated size: ~1 GB at 90-day retention
# ---------------------------------------------------------------------------
SILVER_MODEL_EVALUATIONS_SCHEMA = StructType(
    [
        StructField("eval_id", StringType(), nullable=False),
        StructField("model_id", StringType(), nullable=False),
        StructField("model_version", StringType(), nullable=False),
        StructField("benchmark_name", StringType(), nullable=False),
        StructField("score", FloatType(), nullable=False),
        StructField("evaluated_at", TimestampType(), nullable=False),
        StructField("evaluator_version", StringType(), nullable=True),
        StructField("breakdown_json", StringType(), nullable=True),
        StructField("run_id", StringType(), nullable=True),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

SILVER_MODEL_EVALUATIONS_DDL = f"""
CREATE TABLE IF NOT EXISTS silver.model_evaluations (
    eval_id           STRING    NOT NULL COMMENT 'Unique evaluation run identifier',
    model_id          STRING    NOT NULL COMMENT 'Logical model identifier',
    model_version     STRING    NOT NULL COMMENT 'Model version tag',
    benchmark_name    STRING    NOT NULL COMMENT 'Benchmark name (e.g. MMLU, HumanEval, HellaSwag)',
    score             FLOAT     NOT NULL COMMENT 'Primary benchmark score (normalized 0.0–1.0)',
    evaluated_at      TIMESTAMP NOT NULL COMMENT 'Evaluation completion timestamp (UTC)',
    evaluator_version STRING    COMMENT 'Evaluation harness version string',
    breakdown_json    STRING    COMMENT 'JSON object with per-subtask score breakdown',
    run_id            STRING    COMMENT 'Training run ID that produced this checkpoint',
    date              DATE      NOT NULL COMMENT 'Partition column derived from evaluated_at'
)
USING DELTA
PARTITIONED BY (date, model_id)
LOCATION '{_BASE}/silver/model_evaluations'
COMMENT 'Benchmark evaluation results per model version'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ===========================================================================
# GOLD LAYER
# ===========================================================================

# ---------------------------------------------------------------------------
# gold.operational_dashboard
#
# Partitioning: date (from snapshot_ts) – this is a small, append-only
# snapshot table (~1 row per minute). Partitioning by date keeps file
# counts manageable and enables fast range queries.
#
# Z-ORDER: none – table is small enough for full scans; Z-ORDER overhead
# is not justified. Dashboard queries typically read the latest N rows.
#
# OPTIMIZE: daily. VACUUM: 30d (rolling operational window).
#
# Estimated size: ~100 MB at 30-day retention
# ---------------------------------------------------------------------------
GOLD_OPERATIONAL_DASHBOARD_SCHEMA = StructType(
    [
        StructField("snapshot_ts", TimestampType(), nullable=False),
        StructField("total_gpu_count", IntegerType(), nullable=False),
        StructField("healthy_gpu_count", IntegerType(), nullable=False),
        StructField("cluster_avg_utilization_pct", FloatType(), nullable=True),
        StructField("cluster_avg_temperature_c", FloatType(), nullable=True),
        StructField("active_training_runs", IntegerType(), nullable=False),
        StructField("active_inference_replicas", IntegerType(), nullable=False),
        StructField("open_p1_alerts", IntegerType(), nullable=False),
        StructField("open_p2_alerts", IntegerType(), nullable=False),
        StructField("tokens_trained_today", LongType(), nullable=True),
        StructField("inference_requests_today", LongType(), nullable=True),
        StructField("avg_inference_latency_ms_1h", FloatType(), nullable=True),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

GOLD_OPERATIONAL_DASHBOARD_DDL = f"""
CREATE TABLE IF NOT EXISTS gold.operational_dashboard (
    snapshot_ts                 TIMESTAMP NOT NULL COMMENT 'Snapshot creation timestamp (UTC)',
    total_gpu_count             INT       NOT NULL COMMENT 'Total GPUs registered in the cluster',
    healthy_gpu_count           INT       NOT NULL COMMENT 'GPUs with no active health alerts',
    cluster_avg_utilization_pct FLOAT     COMMENT 'Cluster-wide mean GPU utilization (%)',
    cluster_avg_temperature_c   FLOAT     COMMENT 'Cluster-wide mean GPU temperature (°C)',
    active_training_runs        INT       NOT NULL COMMENT 'Currently running training jobs',
    active_inference_replicas   INT       NOT NULL COMMENT 'Live inference service replicas',
    open_p1_alerts              INT       NOT NULL COMMENT 'Currently firing P1 alerts',
    open_p2_alerts              INT       NOT NULL COMMENT 'Currently firing P2 alerts',
    tokens_trained_today        BIGINT    COMMENT 'Cumulative tokens trained since midnight UTC',
    inference_requests_today    BIGINT    COMMENT 'Cumulative inference requests since midnight UTC',
    avg_inference_latency_ms_1h FLOAT     COMMENT 'Rolling 1-hour mean inference latency (ms)',
    date                        DATE      NOT NULL COMMENT 'Partition column derived from snapshot_ts'
)
USING DELTA
PARTITIONED BY (date)
LOCATION '{_BASE}/gold/operational_dashboard'
COMMENT 'Minute-granularity operational KPI snapshots for the ops dashboard'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 30 days',
    'delta.deletedFileRetentionDuration' = 'interval 30 days'
)
"""

# ---------------------------------------------------------------------------
# gold.training_dataset_vN  (parameterized by version)
#
# Partitioning: source + quality_tier – dataset assembly tools and
# data loader utilities slice by source and quality tier. Immutable tables;
# partitions are written once and never updated.
#
# Z-ORDER: shard_id and shard_offset – distributed training data loaders
# assign shards by rank; co-locating consecutive offsets within a shard
# reduces random-access overhead during epoch preparation.
#
# OPTIMIZE: once at dataset creation time only.
# VACUUM: never – dataset versions are immutable references; time-travel
# must be preserved indefinitely for reproducibility.
#
# Estimated size: ~500 GB per version
# ---------------------------------------------------------------------------
GOLD_TRAINING_DATASET_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), nullable=False),
        StructField("source", StringType(), nullable=False),
        StructField("dedup_hash", StringType(), nullable=False),
        StructField("token_count_estimate", IntegerType(), nullable=True),
        StructField("quality_score", FloatType(), nullable=False),
        StructField("quality_tier", StringType(), nullable=False),
        StructField("file_path", StringType(), nullable=False),
        StructField("shard_id", IntegerType(), nullable=False),
        StructField("shard_offset", IntegerType(), nullable=False),
    ]
)


def _gold_training_dataset_ddl(version: int) -> str:
    """Return the CREATE TABLE DDL for gold.training_dataset_vN."""
    return f"""
CREATE TABLE IF NOT EXISTS gold.training_dataset_v{version} (
    document_id          STRING  NOT NULL COMMENT 'Document UUID from silver.training_corpus_clean',
    source               STRING  NOT NULL COMMENT 'Corpus source label',
    dedup_hash           STRING  NOT NULL COMMENT 'MinHash fingerprint',
    token_count_estimate INT     COMMENT 'Estimated GPT-2 token count',
    quality_score        FLOAT   NOT NULL COMMENT 'Quality classifier score 0.0–1.0',
    quality_tier         STRING  NOT NULL COMMENT 'Quality tier: high, medium, low',
    file_path            STRING  NOT NULL COMMENT 'S3 path to cleaned text blob',
    shard_id             INT     NOT NULL COMMENT 'Assigned data shard index',
    shard_offset         INT     NOT NULL COMMENT 'Document offset within the shard'
)
USING DELTA
PARTITIONED BY (source, quality_tier)
LOCATION '{_BASE}/gold/training_dataset_v{version}'
COMMENT 'Immutable training dataset version {version} – do not modify after creation'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 3650 days',
    'delta.deletedFileRetentionDuration' = 'interval 3650 days'
)
"""


# ---------------------------------------------------------------------------
# gold.model_performance
#
# Partitioning: date (from evaluated_at) + model_id – performance trend
# queries span date ranges for a specific model; latency/throughput
# comparisons across versions scope to model_id.
#
# Z-ORDER: model_id and benchmark_name – regression dashboards filter on
# model_id × benchmark_name combinations; clustering these reduces scanned
# files for cross-version comparisons.
#
# OPTIMIZE: weekly. VACUUM: 90d.
#
# Estimated size: ~500 MB at 90-day retention
# ---------------------------------------------------------------------------
GOLD_MODEL_PERFORMANCE_SCHEMA = StructType(
    [
        StructField("model_id", StringType(), nullable=False),
        StructField("model_version", StringType(), nullable=False),
        StructField("benchmark_name", StringType(), nullable=False),
        StructField("score", FloatType(), nullable=False),
        StructField("p50_latency_ms", FloatType(), nullable=True),
        StructField("p95_latency_ms", FloatType(), nullable=True),
        StructField("p99_latency_ms", FloatType(), nullable=True),
        StructField("error_rate", FloatType(), nullable=True),
        StructField("throughput_rps", FloatType(), nullable=True),
        StructField("evaluated_at", TimestampType(), nullable=False),
        StructField("training_dataset_version", StringType(), nullable=True),
        StructField("parameter_count", LongType(), nullable=True),
        # Partition column derived at write time
        StructField("date", DateType(), nullable=False),
    ]
)

GOLD_MODEL_PERFORMANCE_DDL = f"""
CREATE TABLE IF NOT EXISTS gold.model_performance (
    model_id                  STRING    NOT NULL COMMENT 'Logical model identifier',
    model_version             STRING    NOT NULL COMMENT 'Model version tag',
    benchmark_name            STRING    NOT NULL COMMENT 'Benchmark name',
    score                     FLOAT     NOT NULL COMMENT 'Primary benchmark score (normalized 0.0–1.0)',
    p50_latency_ms            FLOAT     COMMENT 'Median inference latency (ms)',
    p95_latency_ms            FLOAT     COMMENT '95th-percentile inference latency (ms)',
    p99_latency_ms            FLOAT     COMMENT '99th-percentile inference latency (ms)',
    error_rate                FLOAT     COMMENT 'Fraction of requests resulting in an error',
    throughput_rps            FLOAT     COMMENT 'Requests per second at benchmark load level',
    evaluated_at              TIMESTAMP NOT NULL COMMENT 'Evaluation completion timestamp (UTC)',
    training_dataset_version  STRING    COMMENT 'gold.training_dataset version used to train this model',
    parameter_count           BIGINT    COMMENT 'Total trainable parameter count',
    date                      DATE      NOT NULL COMMENT 'Partition column derived from evaluated_at'
)
USING DELTA
PARTITIONED BY (date, model_id)
LOCATION '{_BASE}/gold/model_performance'
COMMENT 'Consolidated model performance metrics combining benchmark scores and serving latency'
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite'   = 'true',
    'delta.logRetentionDuration'         = 'interval 90 days',
    'delta.deletedFileRetentionDuration' = 'interval 90 days'
)
"""

# ===========================================================================
# Table creation orchestration
# ===========================================================================

# Ordered list of (table_name, ddl_string) tuples – bronze first, then
# silver, then gold so that downstream tables can reference upstream ones
# without missing dependencies.
_STATIC_TABLES: list[tuple[str, str]] = [
    # Bronze
    ("bronze.gpu_telemetry", BRONZE_GPU_TELEMETRY_DDL),
    ("bronze.inference_logs", BRONZE_INFERENCE_LOGS_DDL),
    ("bronze.training_metrics", BRONZE_TRAINING_METRICS_DDL),
    ("bronze.raw_text_corpus", BRONZE_RAW_TEXT_CORPUS_DDL),
    # Silver
    ("silver.gpu_telemetry_hourly", SILVER_GPU_TELEMETRY_HOURLY_DDL),
    ("silver.alert_enriched", SILVER_ALERT_ENRICHED_DDL),
    ("silver.training_corpus_clean", SILVER_TRAINING_CORPUS_CLEAN_DDL),
    ("silver.model_evaluations", SILVER_MODEL_EVALUATIONS_DDL),
    # Gold (static)
    ("gold.operational_dashboard", GOLD_OPERATIONAL_DASHBOARD_DDL),
    ("gold.model_performance", GOLD_MODEL_PERFORMANCE_DDL),
]


def create_all_tables(
    spark: SparkSession,
    dataset_versions: list[int] | None = None,
) -> None:
    """Create all Delta Lake tables in dependency order.

    Parameters
    ----------
    spark:
        Active SparkSession configured with Delta Lake extensions.
    dataset_versions:
        List of integer version numbers for which to create
        ``gold.training_dataset_vN`` tables.  Defaults to ``[1]``.
    """
    if dataset_versions is None:
        dataset_versions = [1]

    _log = logging.getLogger(__name__)

    # Ensure the three database namespaces exist
    for db in ("bronze", "silver", "gold"):
        spark.sql(f"CREATE DATABASE IF NOT EXISTS {db}")
        _log.info("Ensured database %s exists", db)

    # Static tables (bronze → silver → gold)
    for table_name, ddl in _STATIC_TABLES:
        spark.sql(ddl)
        _log.info("Created table %s", table_name)

    # Parameterized gold.training_dataset_vN tables
    for version in dataset_versions:
        table_name = f"gold.training_dataset_v{version}"
        spark.sql(_gold_training_dataset_ddl(version))
        _log.info("Created table %s", table_name)


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    spark = (
        SparkSession.builder.appName("delta-table-setup")
        .config(
            "spark.sql.extensions",
            "io.delta.sql.DeltaSparkSessionExtension",
        )
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )
    create_all_tables(spark)
    spark.stop()
