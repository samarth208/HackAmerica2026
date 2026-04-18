"""
Dataset registry backed by a Delta Lake table.
Tracks dataset versions, token counts, quality metrics, and which training runs used each version.

Env vars:
  DELTA_LAKE_BASE    S3 base path, e.g. s3a://delta-lake
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from delta.tables import DeltaTable
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lit, regexp_replace, when
from pyspark.sql.types import (
    StructType, StructField, StringType, LongType, TimestampType,
)

logger = logging.getLogger(__name__)

REGISTRY_TABLE = "metadata.dataset_registry"
REGISTRY_SCHEMA = StructType([
    StructField("version_id", StringType(), False),
    StructField("table_name", StringType(), False),
    StructField("snapshot_version", LongType(), False),
    StructField("token_count_by_source", StringType(), False),  # JSON map source→count
    StructField("quality_metrics_json", StringType(), False),   # JSON object
    StructField("created_at", TimestampType(), False),
    StructField("created_by", StringType(), False),
    StructField("used_in_run_ids", StringType(), False),        # JSON array of run_ids
])


class DatasetRegistry:
    def __init__(self, spark: SparkSession) -> None:
        self.spark = spark
        self._base = os.environ.get("DELTA_LAKE_BASE", "s3a://delta-lake")
        self._table_location = f"{self._base}/metadata/dataset_registry"
        self._ensure_table()

    def _ensure_table(self) -> None:
        """Create metadata.dataset_registry if it doesn't exist."""
        self.spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {REGISTRY_TABLE} (
                version_id STRING NOT NULL,
                table_name STRING NOT NULL,
                snapshot_version LONG NOT NULL,
                token_count_by_source STRING NOT NULL,
                quality_metrics_json STRING NOT NULL,
                created_at TIMESTAMP NOT NULL,
                created_by STRING NOT NULL,
                used_in_run_ids STRING NOT NULL
            )
            USING DELTA
            LOCATION '{self._table_location}'
        """)

    def register_dataset_version(
        self,
        table_name: str,
        created_by: str,
        token_counts: dict[str, int],
        quality_metrics: dict[str, Any],
    ) -> str:
        """
        Register a new dataset version in the registry.

        Gets the current Delta snapshot version for the given table, creates a
        registry entry with token counts and quality metrics, and writes it to
        the registry table.

        Args:
            table_name: Fully qualified Delta table name (e.g. "silver.training_corpus_clean").
            created_by: Identifier of the process or user creating this version.
            token_counts: Mapping of data source name to token count.
            quality_metrics: Arbitrary quality metric key-value pairs.

        Returns:
            The newly generated version_id UUID string.
        """
        history_df = DeltaTable.forName(self.spark, table_name).history(1)
        snapshot_version = history_df.select("version").first()["version"]

        version_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc)

        entry = {
            "version_id": version_id,
            "table_name": table_name,
            "snapshot_version": snapshot_version,
            "token_count_by_source": json.dumps(token_counts),
            "quality_metrics_json": json.dumps(quality_metrics),
            "created_at": created_at,
            "created_by": created_by,
            "used_in_run_ids": "[]",
        }

        row_df = self.spark.createDataFrame([entry], schema=REGISTRY_SCHEMA)
        row_df.write.format("delta").mode("append").saveAsTable(REGISTRY_TABLE)

        logger.info(
            "Registered dataset version %s for %s @ snapshot %s",
            version_id,
            table_name,
            snapshot_version,
        )
        return version_id

    def get_dataset_version(self, version_id: str) -> dict[str, Any]:
        """
        Retrieve a dataset version record by its version_id.

        Args:
            version_id: UUID string identifying the dataset version.

        Returns:
            Dictionary containing all registry fields, with JSON fields decoded
            back to Python objects.

        Raises:
            KeyError: If no record with the given version_id exists.
        """
        rows = (
            self.spark.table(REGISTRY_TABLE)
            .filter(col("version_id") == version_id)
            .collect()
        )
        if not rows:
            raise KeyError(f"Dataset version {version_id} not found")

        row = rows[0].asDict()
        row["token_count_by_source"] = json.loads(row["token_count_by_source"])
        row["quality_metrics_json"] = json.loads(row["quality_metrics_json"])
        row["used_in_run_ids"] = json.loads(row["used_in_run_ids"])
        return row

    def mark_used_in_run(self, version_id: str, run_id: str) -> None:
        """
        Atomically append a run_id to the used_in_run_ids JSON array for a
        dataset version, using a Delta MERGE update with Spark SQL string
        manipulation.

        Args:
            version_id: UUID of the dataset version to update.
            run_id: Training run ID to append.
        """
        delta_table = DeltaTable.forName(self.spark, REGISTRY_TABLE)
        delta_table.update(
            condition=col("version_id") == version_id,
            set={
                "used_in_run_ids": when(
                    col("used_in_run_ids") == "[]",
                    lit(f'["{run_id}"]'),
                ).otherwise(
                    regexp_replace(
                        col("used_in_run_ids"),
                        r"\]$",
                        f', "{run_id}"]',
                    )
                ),
            },
        )
        logger.info("Marked version %s used in run %s", version_id, run_id)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Dataset registry CLI")
    subparsers = parser.add_subparsers(dest="command")

    reg_parser = subparsers.add_parser("register", help="Register a new dataset version")
    reg_parser.add_argument("--table", required=True)
    reg_parser.add_argument("--created-by", required=True)
    reg_parser.add_argument("--token-counts", required=True, help="JSON string")
    reg_parser.add_argument("--quality-metrics", required=True, help="JSON string")

    get_parser = subparsers.add_parser("get", help="Get a dataset version")
    get_parser.add_argument("--version-id", required=True)

    mark_parser = subparsers.add_parser("mark-used", help="Mark version used in run")
    mark_parser.add_argument("--version-id", required=True)
    mark_parser.add_argument("--run-id", required=True)

    args = parser.parse_args()

    spark = (
        SparkSession.builder
        .appName("dataset-registry")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )

    registry = DatasetRegistry(spark)

    if args.command == "register":
        vid = registry.register_dataset_version(
            table_name=args.table,
            created_by=args.created_by,
            token_counts=json.loads(args.token_counts),
            quality_metrics=json.loads(args.quality_metrics),
        )
        print(f"Registered: {vid}")
    elif args.command == "get":
        entry = registry.get_dataset_version(args.version_id)
        print(json.dumps(entry, default=str, indent=2))
    elif args.command == "mark-used":
        registry.mark_used_in_run(args.version_id, args.run_id)
        print("Done")
    else:
        parser.print_help()

    spark.stop()
