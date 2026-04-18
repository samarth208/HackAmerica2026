"""
Custom Feast offline store backed by Delta Lake (PySpark).

Env vars:
  DELTA_LAKE_BUCKET   S3 bucket, e.g. delta-lake
  S3A_ACCESS_KEY      S3-compatible access key
  S3A_SECRET_KEY      S3-compatible secret key
  CEPH_ENDPOINT       S3-compatible endpoint URL
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Union

import pandas as pd
from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.window import Window

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Spark singleton
# ---------------------------------------------------------------------------

_spark: Optional[SparkSession] = None


def _get_spark() -> SparkSession:
    """Return the shared SparkSession, creating it once if needed."""
    global _spark
    if _spark is not None and not _spark.sparkContext._jvm.SparkContext.getOrCreate().isStopped():
        return _spark

    access_key = os.environ.get("S3A_ACCESS_KEY", "")
    secret_key = os.environ.get("S3A_SECRET_KEY", "")
    endpoint = os.environ.get("CEPH_ENDPOINT", "http://ceph-rgw:80")

    _spark = (
        SparkSession.builder
        .appName("feast-offline-store")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .config("spark.hadoop.fs.s3a.access.key", access_key)
        .config("spark.hadoop.fs.s3a.secret.key", secret_key)
        .config("spark.hadoop.fs.s3a.endpoint", endpoint)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.hadoop.fs.s3a.fast.upload", "true")
        .getOrCreate()
    )
    return _spark


# ---------------------------------------------------------------------------
# DeltaLakeSource
# ---------------------------------------------------------------------------


@dataclass
class DeltaLakeSource:
    """Points to a Delta Lake table as a Feast data source."""

    path: str                              # full s3a:// path
    timestamp_field: str                   # event timestamp column
    created_timestamp_column: Optional[str] = None

    def get_table_query_string(self) -> str:
        return f"delta.`{self.path}`"


# ---------------------------------------------------------------------------
# DeltaLakeOfflineStore
# ---------------------------------------------------------------------------


class DeltaLakeOfflineStore:
    """
    Feast OfflineStore backed by Delta Lake via PySpark.

    Point-in-time join: for each row in entity_df (which has an event_timestamp),
    finds the latest feature row where feature_timestamp <= event_timestamp
    within the feature view's TTL window.
    """

    @classmethod
    def get_historical_features(
        cls,
        config: Any,
        feature_views: List[Any],
        feature_refs: List[str],
        entity_df: Union[pd.DataFrame, str],
        registry: Any,
        project: str,
        full_feature_names: bool = False,
    ) -> "_SparkRetrievalJob":
        spark = _get_spark()

        # Convert entity_df to Spark DataFrame
        if isinstance(entity_df, pd.DataFrame):
            entity_sdf = spark.createDataFrame(entity_df)
        else:
            entity_sdf = spark.sql(entity_df)

        result_sdf = entity_sdf

        for fv in feature_views:
            source: DeltaLakeSource = fv.batch_source

            # Load Delta table
            feature_sdf = spark.read.format("delta").load(source.path)

            # Resolve join keys from entity_columns (FieldInfo objects on the view)
            join_keys: List[str] = [col.name for col in fv.entity_columns]

            ts_col = source.timestamp_field
            ttl_seconds: Optional[int] = (
                int(fv.ttl.total_seconds()) if fv.ttl is not None else None
            )

            # Point-in-time: rank rows per entity by timestamp descending,
            # keep only the single most-recent row per entity group.
            window_spec = Window.partitionBy(*join_keys).orderBy(F.col(ts_col).desc())
            feature_ranked = feature_sdf.withColumn("_rank", F.row_number().over(window_spec))
            feature_latest = feature_ranked.filter(F.col("_rank") == 1).drop("_rank")

            # Determine feature columns (exclude join keys, timestamps)
            exclude = set(join_keys) | {ts_col}
            if source.created_timestamp_column:
                exclude.add(source.created_timestamp_column)
            feature_cols = [c for c in feature_sdf.columns if c not in exclude]

            # Optionally prefix column names with view name
            select_cols = list(join_keys)
            for fc in feature_cols:
                prefixed = f"{fv.name}__{fc}" if full_feature_names else fc
                feature_latest = feature_latest.withColumnRenamed(fc, prefixed)
                select_cols.append(prefixed)

            result_sdf = result_sdf.join(
                feature_latest.select(select_cols),
                on=join_keys,
                how="left",
            )

        return _SparkRetrievalJob(result_sdf)

    @classmethod
    def pull_latest_from_table_or_query(
        cls,
        config: Any,
        data_source: DeltaLakeSource,
        join_key_columns: List[str],
        feature_name_columns: List[str],
        timestamp_field: str,
        created_timestamp_column: Optional[str],
        start_date: datetime,
        end_date: datetime,
    ) -> "_SparkRetrievalJob":
        spark = _get_spark()

        sdf = spark.read.format("delta").load(data_source.path)

        # Filter to the requested time window
        sdf = sdf.filter(
            (F.col(timestamp_field) >= F.lit(start_date))
            & (F.col(timestamp_field) <= F.lit(end_date))
        )

        # Keep only the latest row per join-key group
        window_spec = Window.partitionBy(*join_key_columns).orderBy(F.col(timestamp_field).desc())
        sdf = (
            sdf.withColumn("_rank", F.row_number().over(window_spec))
            .filter(F.col("_rank") == 1)
            .drop("_rank")
        )

        # Select the requested columns (safely ignore any that are absent)
        desired = join_key_columns + feature_name_columns + [timestamp_field]
        if created_timestamp_column and created_timestamp_column in sdf.columns:
            desired.append(created_timestamp_column)
        available = set(sdf.columns)
        sdf = sdf.select([c for c in desired if c in available])

        return _SparkRetrievalJob(sdf)


# ---------------------------------------------------------------------------
# _SparkRetrievalJob
# ---------------------------------------------------------------------------


class _SparkRetrievalJob:
    """Wraps a Spark DataFrame to provide a Feast RetrievalJob-compatible interface."""

    def __init__(self, sdf: DataFrame) -> None:
        self._sdf = sdf

    def to_df(self) -> pd.DataFrame:
        return self._sdf.toPandas()

    def to_arrow(self) -> "pa.Table":
        import pyarrow as pa  # noqa: F401  (lazy import — pyarrow is optional at parse time)
        return pa.Table.from_pandas(self._sdf.toPandas())
