"""
Flink corpus processor job.
Watches S3 for new Parquet files, processes documents through language detection,
deduplication, quality scoring, routes to Delta Lake sinks, and metadata to Kafka.

Env vars:
  KAFKA_BOOTSTRAP_SERVERS
  S3_RAW_DOCUMENTS_PREFIX     default: s3://raw-documents/
  S3_DELTA_LAKE_PREFIX        default: s3://delta-lake/bronze
  S3_CHECKPOINT_BUCKET        default: ceph-bucket
  FLINK_PARALLELISM           default: 16

Why Flink over Kafka Streams:
  1. Stateful deduplication with RocksDB managed state — Kafka Streams requires
     custom state stores with manual compaction; Flink manages RocksDB TTL natively.
  2. Multi-sink routing via SplitStream — Kafka Streams has no native split/branch
     with separate sinks; requires separate topologies and manual coordination.
  3. Exactly-once Delta Lake writes require Flink's two-phase commit
     TwoPhaseCommitSinkFunction protocol; Kafka Streams has no equivalent for
     non-Kafka sinks.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Iterator

from pyflink.common import WatermarkStrategy, Duration, Row
from pyflink.datastream import StreamExecutionEnvironment, CheckpointingMode
from pyflink.datastream.connectors.kafka import (
    KafkaSink,
    KafkaRecordSerializationSchema,
)
from pyflink.common.serialization import SimpleStringSchema
from pyflink.datastream.functions import (
    MapFunction,
    FilterFunction,
    FlatMapFunction,
    RuntimeContext,
    SinkFunction,
)
from pyflink.datastream.state import (
    ValueStateDescriptor,
    StateTtlConfig,
)

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

class LanguageDetector(FlatMapFunction):
    """
    Detects the language of each document.

    - English documents pass through unchanged.
    - Non-English documents are marked with _rejected=True.
    - Documents whose language cannot be detected are also marked as rejected.
    """

    def flat_map(self, doc: dict) -> Iterator[dict]:  # type: ignore[override]
        try:
            from langdetect import detect  # noqa: PLC0415
            from langdetect.lang_detect_exception import LangDetectException  # noqa: PLC0415

            text_sample: str = doc.get("raw_text", "")[:1000]
            try:
                detected: str = detect(text_sample)
            except LangDetectException as lang_exc:
                _log.warning(
                    "LangDetectException for document_id=%s: %s",
                    doc.get("document_id", "<unknown>"),
                    lang_exc,
                )
                doc = dict(doc)
                doc["_rejected"] = True
                doc["_rejection_reason"] = "language_detection_failed"
                yield doc
                return

            if detected == "en":
                yield doc
            else:
                doc = dict(doc)
                doc["_rejected"] = True
                doc["_rejection_reason"] = f"language:{detected}"
                yield doc

        except Exception as exc:  # pylint: disable=broad-except
            _log.warning(
                "LanguageDetector unexpected error for document_id=%s: %s",
                doc.get("document_id", "<unknown>"),
                exc,
            )
            doc = dict(doc)
            doc["_rejected"] = True
            doc["_rejection_reason"] = f"error:{type(exc).__name__}"
            yield doc


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

class DedupHasher(MapFunction):
    """
    Computes a SHA-256 deduplication hash from normalised document text.

    Normalisation steps:
      1. Unicode NFC normalisation.
      2. Lowercase.
      3. Collapse runs of whitespace to a single space and strip.
    """

    def map(self, doc: dict) -> dict:  # type: ignore[override]
        raw_text: str = doc.get("raw_text", "")
        normalised = unicodedata.normalize("NFC", raw_text.lower())
        normalised = re.sub(r"\s+", " ", normalised).strip()
        dedup_hash = hashlib.sha256(normalised.encode("utf-8")).hexdigest()
        doc = dict(doc)
        doc["dedup_hash"] = dedup_hash
        return doc


class DeduplicateFilter(FilterFunction):
    """
    Stateful deduplication filter keyed by dedup_hash.

    State: ValueState[bool] named "seen" with 90-day TTL.
    Returns True (keep) for the first occurrence; False (discard) for duplicates.
    """

    def open(self, ctx: RuntimeContext) -> None:  # type: ignore[override]
        ttl_config = (
            StateTtlConfig
            .new_builder(
                org.apache.flink.api.common.time.Time.days(90)  # type: ignore[name-defined]
            )
            .set_update_type(StateTtlConfig.UpdateType.OnCreateAndWrite)
            .set_state_visibility(
                StateTtlConfig.StateVisibility.NeverReturnExpired
            )
            .build()
        )
        descriptor = ValueStateDescriptor("seen", bool)
        descriptor.enable_time_to_live(ttl_config)
        self._seen_state = ctx.get_state(descriptor)

    def filter(self, doc: dict) -> bool:  # type: ignore[override]
        already_seen: bool | None = self._seen_state.value()
        if already_seen:
            return False  # Duplicate — discard.
        self._seen_state.update(True)
        return True  # First occurrence — keep.


# ---------------------------------------------------------------------------
# Quality scoring
# ---------------------------------------------------------------------------

class QualityScorer(MapFunction):
    """
    Assigns a quality score in [0, 1] and a tier (high/medium/low) to each document.

    Scoring components (weights sum to 1.0):
      alphabetic_ratio    (0.3)  — fraction of alphabetic characters
      avg_word_len_score  (0.2)  — 1.0 if 4 ≤ avg word length ≤ 8, else 0.0
      unique_bigram_ratio (0.3)  — lexical diversity via bigram coverage
      no_repeat_ratio     (0.2)  — paragraph uniqueness
    """

    def map(self, doc: dict) -> dict:  # type: ignore[override]
        text: str = doc.get("raw_text", "")

        # --- Component 1: alphabetic ratio ---
        alphabetic_ratio = sum(c.isalpha() for c in text) / max(1, len(text))

        # --- Component 2: average word length score ---
        words = text.split()
        avg_word_len = sum(len(w) for w in words) / max(1, len(words))
        avg_word_len_score = 1.0 if 4 <= avg_word_len <= 8 else 0.0

        # --- Component 3: unique bigram ratio ---
        bigrams = set(zip(words, words[1:]))
        unique_bigram_ratio = len(bigrams) / max(1, len(words) - 1)

        # --- Component 4: no-repeat paragraph ratio ---
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        no_repeat_ratio = len(set(paragraphs)) / max(1, len(paragraphs))

        quality_score = (
            alphabetic_ratio * 0.3
            + avg_word_len_score * 0.2
            + unique_bigram_ratio * 0.3
            + no_repeat_ratio * 0.2
        )

        if quality_score >= 0.8:
            tier = "high"
        elif quality_score >= 0.6:
            tier = "medium"
        else:
            tier = "low"

        doc = dict(doc)
        doc["quality_score"] = round(quality_score, 4)
        doc["quality_tier"] = tier
        return doc


# ---------------------------------------------------------------------------
# Routing filters
# ---------------------------------------------------------------------------

class IsRejected(FilterFunction):
    """Passes through documents that have been marked as rejected."""

    def filter(self, doc: dict) -> bool:  # type: ignore[override]
        return bool(doc.get("_rejected", False))


class IsAccepted(FilterFunction):
    """Passes through documents that have NOT been rejected."""

    def filter(self, doc: dict) -> bool:  # type: ignore[override]
        return not doc.get("_rejected", False)


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

class DocumentMetadataExtractor(MapFunction):
    """
    Produces a metadata-only JSON string for each accepted document.

    Strips raw_text to keep the Kafka metadata topic lean.
    token_count_estimate uses a word-count * 1.3 heuristic (BPE overhead).
    """

    def map(self, doc: dict) -> str:  # type: ignore[override]
        token_count_estimate = int(
            len(doc.get("raw_text", "").split()) * 1.3
        )
        metadata = {
            "document_id": doc.get("document_id"),
            "source": doc.get("source"),
            "quality_score": doc.get("quality_score"),
            "quality_tier": doc.get("quality_tier"),
            "dedup_hash": doc.get("dedup_hash"),
            "token_count_estimate": token_count_estimate,
            "ingested_at": doc.get(
                "ingested_at",
                datetime.now(tz=timezone.utc).isoformat(),
            ),
            "partition_written": doc.get("partition_written"),
        }
        return json.dumps(metadata)


# ---------------------------------------------------------------------------
# Delta Lake sink (logging stub)
# ---------------------------------------------------------------------------

class DeltaLakeSink(SinkFunction):
    """
    Sink that writes enriched documents to a Delta Lake table path.

    Production implementation note:
      Actual Delta Lake integration requires the `delta-standalone` JVM library
      accessible on the Flink classpath.  Production code would call:

        delta_log = io.delta.standalone.DeltaLog.forTable(hadoop_conf, self.path)
        txn = delta_log.startTransaction()
        txn.commit(add_files, operation, engine_info)

      via PyFlink's Java interop (get_gateway().jvm).  Two-phase commit
      (TwoPhaseCommitSinkFunction) is required for exactly-once guarantees.

    This stub logs each record at INFO level so the pipeline can be validated
    end-to-end without the JVM dependency.
    """

    def __init__(self, path: str) -> None:
        super().__init__()
        self.path = path
        self._log = logging.getLogger(self.__class__.__name__)

    def invoke(self, value: dict, context) -> None:  # type: ignore[override]
        self._log.info(
            "delta-sink: writing to %s  source=%s  tier=%s  doc_id=%s",
            self.path,
            value.get("source"),
            value.get("quality_tier"),
            value.get("document_id"),
        )


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> None:
    parallelism = int(os.environ.get("FLINK_PARALLELISM", "16"))
    checkpoint_bucket = os.environ.get("S3_CHECKPOINT_BUCKET", "ceph-bucket")
    bootstrap_servers = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
    delta_prefix = os.environ.get("S3_DELTA_LAKE_PREFIX", "s3://delta-lake/bronze")

    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(parallelism)

    env.enable_checkpointing(60_000, CheckpointingMode.EXACTLY_ONCE)
    env.get_checkpoint_config().set_checkpoint_storage_dir(
        f"s3://{checkpoint_bucket}/flink-checkpoints/corpus-processor/"
    )

    from pyflink.datastream import EmbeddedRocksDBStateBackend  # noqa: PLC0415
    env.set_state_backend(EmbeddedRocksDBStateBackend())

    # ------------------------------------------------------------------
    # Source: FileSystem watching S3 prefix for new JSON-lines files.
    #
    # Production upgrade path:
    #   Replace StreamFormat.text_line_format() with
    #   ParquetColumnarRowInputFormat (via pyflink.datastream.connectors.file_system)
    #   and adjust the downstream lambda to convert ColumnarRow → dict.
    # ------------------------------------------------------------------
    raw_prefix = os.environ.get("S3_RAW_DOCUMENTS_PREFIX", "s3://raw-documents/")

    from pyflink.datastream.connectors.file_system import FileSource, StreamFormat  # noqa: PLC0415
    from pyflink.common.watermark_strategy import WatermarkStrategy as _WS  # noqa: PLC0415

    file_source = (
        FileSource.for_record_stream_format(
            StreamFormat.text_line_format(),
            raw_prefix,
        )
        .monitor_continuously(Duration.of_seconds(30))
        .build()
    )

    raw_stream = (
        env.from_source(file_source, _WS.no_watermarks(), "S3DocumentSource")
        .map(lambda line: json.loads(line))  # each line is a JSON document record
    )

    # ------------------------------------------------------------------
    # Processing pipeline
    # ------------------------------------------------------------------
    language_filtered = raw_stream.flat_map(LanguageDetector())

    # Split: rejected vs accepted (language_filtered is iterated twice;
    # Flink will not re-execute — each branch subscribes to the same stream).
    rejected_stream = language_filtered.filter(IsRejected())
    accepted_before_dedup = language_filtered.filter(IsAccepted())

    # Dedup + quality scoring on accepted documents only.
    deduped = (
        accepted_before_dedup
        .map(DedupHasher())
        .key_by(lambda d: d.get("dedup_hash", ""))
        .filter(DeduplicateFilter())
        .map(QualityScorer())
    )

    # ------------------------------------------------------------------
    # Delta Lake sinks
    # ------------------------------------------------------------------
    accepted_sink_path = f"{delta_prefix}/training_corpus"
    rejected_sink_path = f"{delta_prefix}/rejected_corpus"

    deduped.add_sink(DeltaLakeSink(accepted_sink_path))
    rejected_stream.add_sink(DeltaLakeSink(rejected_sink_path))

    # ------------------------------------------------------------------
    # Metadata → Kafka
    # ------------------------------------------------------------------
    metadata_stream = deduped.map(DocumentMetadataExtractor())

    kafka_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(bootstrap_servers)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("processed.training.corpus")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    metadata_stream.sink_to(kafka_sink)
    env.execute("corpus-processor-job")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
