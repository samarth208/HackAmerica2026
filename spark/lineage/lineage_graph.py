"""
End-to-end data lineage graph for AMD ML platform.
Traces data from raw S3 files through Delta Lake tables to trained models.

Env vars:
  DELTA_LAKE_BASE          S3 base path, e.g. s3a://delta-lake
  FOUNDRY_URL              Palantir Foundry base URL
  FOUNDRY_TOKEN            Foundry API token
  FOUNDRY_ONTOLOGY_RID     Ontology RID, default: ri.ontology.main.ontology.amd-ml
  KAFKA_BOOTSTRAP_SERVERS  For offset queries
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from pyspark.sql import SparkSession
from pyspark.sql.functions import col

logger = logging.getLogger(__name__)


class LineageGraph:
    def __init__(self, spark: SparkSession) -> None:
        self.spark = spark
        self._base = os.environ.get("DELTA_LAKE_BASE", "s3a://delta-lake")
        self._foundry_url = os.environ["FOUNDRY_URL"]
        self._foundry_token = os.environ["FOUNDRY_TOKEN"]
        self._ontology_rid = os.environ.get(
            "FOUNDRY_ONTOLOGY_RID", "ri.ontology.main.ontology.amd-ml"
        )
        self._bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_ontology_object(self, object_type: str, pk: str) -> dict[str, Any]:
        """
        Fetch a single object from the Palantir Foundry Ontology API.

        Makes a GET request to:
            {FOUNDRY_URL}/api/v2/ontologies/{ontology_rid}/objects/{object_type}/{pk}

        Args:
            object_type: Ontology object type name (e.g. "TrainingRun").
            pk: Primary key value for the object.

        Returns:
            Parsed JSON response body on HTTP 200, or {} on any error.
        """
        url = (
            f"{self._foundry_url}/api/v2/ontologies"
            f"/{self._ontology_rid}/objects/{object_type}/{pk}"
        )
        headers = {"Authorization": f"Bearer {self._foundry_token}"}
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to fetch ontology object %s/%s: %s", object_type, pk, exc
            )
            return {}

    def _get_kafka_offsets_at_timestamp(
        self, topic: str, timestamp_ms: int
    ) -> dict[str, int]:
        """
        Retrieve per-partition Kafka offsets for a topic at a given epoch millisecond
        timestamp.

        Uses the confluent_kafka AdminClient to list topic partitions and then
        call offsets_for_times.

        Args:
            topic: Kafka topic name.
            timestamp_ms: Unix epoch timestamp in milliseconds.

        Returns:
            Mapping of "topic:partition" strings to offset integers.
            Returns {} if confluent_kafka is unavailable or any error occurs.
        """
        try:
            from confluent_kafka.admin import AdminClient  # type: ignore[import]
            from confluent_kafka import TopicPartition  # type: ignore[import]
        except ImportError:
            logger.warning(
                "confluent_kafka not available; skipping Kafka offset lookup"
            )
            return {}

        try:
            admin = AdminClient({"bootstrap.servers": self._bootstrap_servers})
            cluster_meta = admin.list_topics(topic, timeout=10)
            topic_meta = cluster_meta.topics.get(topic)
            if topic_meta is None:
                logger.warning("Topic %s not found in Kafka cluster metadata", topic)
                return {}

            offsets: dict[str, int] = {}
            for pid in topic_meta.partitions:
                tp = TopicPartition(topic, pid, timestamp_ms)
                result = admin.offsets_for_times([tp], timeout=10)
                for resolved_tp in result:
                    if resolved_tp.offset >= 0:
                        offsets[f"{topic}:{resolved_tp.partition}"] = resolved_tp.offset
                    else:
                        # No message at or after the timestamp; record -1
                        offsets[f"{topic}:{resolved_tp.partition}"] = resolved_tp.offset
            return offsets
        except Exception as exc:  # noqa: BLE001
            logger.warning("Kafka offset lookup failed for topic %s: %s", topic, exc)
            return {}

    # ------------------------------------------------------------------
    # Public lineage APIs
    # ------------------------------------------------------------------

    def trace_forward(self, raw_file_path: str) -> dict[str, Any]:
        """
        Trace a raw S3 file forward through the lineage graph to discover all
        downstream dataset versions, training runs, and trained models that
        depend on it.

        Args:
            raw_file_path: S3 URI of the raw file (e.g. "s3a://bucket/path/file.jsonl").

        Returns:
            Dictionary with keys:
              - raw_file (str)
              - document_ids (list[str])
              - dataset_versions (list[str])
              - run_ids (list[str])
              - model_ids (list[str])
        """
        # 1. Resolve document_ids from the bronze corpus table
        try:
            doc_ids = (
                self.spark.table("bronze.raw_text_corpus")
                .filter(col("file_path") == raw_file_path)
                .select("document_id")
                .rdd.flatMap(lambda r: [r["document_id"]])
                .collect()
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not query bronze.raw_text_corpus (table may not exist): %s", exc
            )
            doc_ids = []

        if not doc_ids:
            logger.warning(
                "No documents found for raw file %s in bronze.raw_text_corpus",
                raw_file_path,
            )
            return {
                "raw_file": raw_file_path,
                "document_ids": [],
                "dataset_versions": [],
                "run_ids": [],
                "model_ids": [],
            }

        # 2. Query dataset registry for versions linked to the bronze table.
        #    NOTE: production would use column-level lineage to match individual
        #    document_ids; here we return all registry entries for
        #    "bronze.raw_text_corpus" as a practical approximation.
        version_ids: list[str] = []
        try:
            registry_rows = (
                self.spark.table("metadata.dataset_registry")
                .filter(col("table_name") == "bronze.raw_text_corpus")
                .select("version_id", "snapshot_version")
                .collect()
            )
            version_ids = [r["version_id"] for r in registry_rows]
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not query metadata.dataset_registry: %s", exc
            )

        if not version_ids:
            return {
                "raw_file": raw_file_path,
                "document_ids": doc_ids,
                "dataset_versions": [],
                "run_ids": [],
                "model_ids": [],
            }

        # 3. Collect all run_ids that consumed these dataset versions
        run_ids: list[str] = []
        try:
            run_ids_nested = (
                self.spark.table("metadata.dataset_registry")
                .filter(col("version_id").isin(version_ids))
                .select("used_in_run_ids")
                .collect()
            )
            for row in run_ids_nested:
                run_ids.extend(json.loads(row["used_in_run_ids"]))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not collect run_ids from dataset registry: %s", exc)

        # 4. Resolve model_ids via the Foundry Ontology
        model_ids: list[str] = []
        for run_id in run_ids:
            run_obj = self._get_ontology_object("TrainingRun", run_id)
            model_id = run_obj.get("model_id") or run_obj.get("modelId")
            if model_id and model_id not in model_ids:
                model_ids.append(model_id)

        return {
            "raw_file": raw_file_path,
            "document_ids": doc_ids,
            "dataset_versions": version_ids,
            "run_ids": run_ids,
            "model_ids": model_ids,
        }

    def trace_backward(self, model_id: str) -> dict[str, Any]:
        """
        Trace a model version backward through the lineage graph to discover
        the training run, dataset version, Kafka offsets, and raw source files
        that produced it.

        Args:
            model_id: Identifier of the trained model / model version.

        Returns:
            Dictionary with keys:
              - model_id (str)
              - run_id (str | None)
              - dataset_version_id (str | None)
              - delta_snapshot_version (int | None)
              - kafka_offsets (dict[str, int])
              - raw_source_files (list[str])
        """
        partial: dict[str, Any] = {
            "model_id": model_id,
            "run_id": None,
            "dataset_version_id": None,
            "delta_snapshot_version": None,
            "kafka_offsets": {},
            "raw_source_files": [],
        }

        # 1. Fetch ModelVersion object from Foundry Ontology
        model_obj = self._get_ontology_object("ModelVersion", model_id)
        if not model_obj:
            logger.warning("ModelVersion %s not found in Foundry Ontology", model_id)
            return partial

        # 2. Extract training_run_id
        training_run_id: str | None = (
            model_obj.get("training_run_id") or model_obj.get("trainingRunId")
        )
        if not training_run_id:
            logger.warning(
                "ModelVersion %s has no training_run_id field", model_id
            )
            return partial

        partial["run_id"] = training_run_id

        # 3. Fetch TrainingRun object (for completeness / extra metadata)
        run_obj = self._get_ontology_object("TrainingRun", training_run_id)
        if not run_obj:
            logger.warning(
                "TrainingRun %s not found in Foundry Ontology", training_run_id
            )

        # 4. Find the dataset version used in this training run
        version_id: str | None = None
        snapshot_version: int | None = None
        created_at_dt: datetime | None = None

        try:
            registry_rows = (
                self.spark.table("metadata.dataset_registry")
                .filter(col("used_in_run_ids").contains(training_run_id))
                .select("version_id", "snapshot_version", "created_at")
                .collect()
            )
            if len(registry_rows) > 1:
                logger.warning(
                    "Multiple dataset registry entries found for run %s; using first",
                    training_run_id,
                )
            if registry_rows:
                first = registry_rows[0]
                version_id = first["version_id"]
                snapshot_version = first["snapshot_version"]
                created_at_dt = first["created_at"]
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not query metadata.dataset_registry for run %s: %s",
                training_run_id,
                exc,
            )

        partial["dataset_version_id"] = version_id
        partial["delta_snapshot_version"] = snapshot_version

        # 5. Kafka offsets at dataset creation time
        kafka_offsets: dict[str, int] = {}
        if created_at_dt is not None:
            ts_ms = int(created_at_dt.timestamp() * 1000)
            kafka_offsets = self._get_kafka_offsets_at_timestamp(
                "processed.training.corpus", ts_ms
            )
        partial["kafka_offsets"] = kafka_offsets

        # 6. Approximate source files from bronze table using created_at ± 24h.
        #    NOTE: production would use column-level lineage to get exact file list;
        #    this time-range approximation is intentional and documented.
        source_files: list[str] = []
        if created_at_dt is not None:
            try:
                window_start = created_at_dt - timedelta(hours=24)
                window_end = created_at_dt + timedelta(hours=24)
                source_files = (
                    self.spark.table("bronze.raw_text_corpus")
                    .filter(
                        (col("ingested_at") >= window_start)
                        & (col("ingested_at") <= window_end)
                    )
                    .select("file_path")
                    .distinct()
                    .rdd.flatMap(lambda r: [r["file_path"]])
                    .collect()
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not query bronze.raw_text_corpus for source files: %s", exc
                )

        partial["raw_source_files"] = source_files
        return partial


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Data lineage graph CLI")
    subparsers = parser.add_subparsers(dest="command")

    fwd = subparsers.add_parser("trace-forward")
    fwd.add_argument("--file", required=True, help="Raw S3 file path")

    bwd = subparsers.add_parser("trace-backward")
    bwd.add_argument("--model-id", required=True)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    spark = (
        SparkSession.builder
        .appName("lineage-graph")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )

    graph = LineageGraph(spark)

    if args.command == "trace-forward":
        result = graph.trace_forward(args.file)
    else:
        result = graph.trace_backward(args.model_id)

    print(json.dumps(result, default=str, indent=2))
    spark.stop()
