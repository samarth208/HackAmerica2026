"""
Great Expectations suite for bronze.gpu_telemetry Delta Lake table.

Env vars:
  DELTA_LAKE_BASE       S3 base path, e.g. s3a://delta-lake
  SLACK_WEBHOOK_URL     Slack incoming webhook for failure alerts
  GE_DOCS_BUCKET        S3 bucket for DataDocs, e.g. ge-data-docs
  GE_BUCKET             S3 bucket for expectations/validations store
  SPARK_MASTER          Spark master URL, e.g. local[*] or spark://host:7077
"""
from __future__ import annotations

import os
import sys
import json
import logging
from datetime import datetime, timezone

import great_expectations as gx
from great_expectations.core import ExpectationSuite, ExpectationConfiguration
from great_expectations.checkpoint import Checkpoint
from great_expectations.data_context import AbstractDataContext

logger = logging.getLogger(__name__)

SUITE_NAME = "bronze.gpu_telemetry.suite"
CHECKPOINT_NAME = "bronze_gpu_telemetry_checkpoint"


def build_suite() -> ExpectationSuite:
    """
    Creates and returns a fully configured ExpectationSuite for the
    bronze.gpu_telemetry Delta Lake table.

    Returns:
        ExpectationSuite: Configured suite with all column and table expectations.
    """
    suite = ExpectationSuite(expectation_suite_name=SUITE_NAME)

    # 1. Non-null constraints on key identity / time columns
    for col in ("node_id", "device_id", "timestamp_ms"):
        suite.add_expectation(
            ExpectationConfiguration(
                expectation_type="expect_column_values_to_not_be_null",
                kwargs={"column": col},
            )
        )

    # 2. GPU utilisation must be a valid percentage
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "utilization_pct",
                "min_value": 0.0,
                "max_value": 100.0,
            },
        )
    )

    # 3. Temperature within safe operating envelope
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "temperature_c",
                "min_value": 20.0,
                "max_value": 120.0,
            },
        )
    )

    # 4. Power draw must be strictly positive (no upper bound)
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "power_draw_w",
                "min_value": 0.0,
                # max_value intentionally None — no upper cap defined
                "max_value": None,
            },
        )
    )

    # 5. Timestamp freshness proxy.
    #
    #    Full custom expectation classes (e.g. ExpectTimestampFreshness) require
    #    GX plugin registration via the plugins/ directory and
    #    `great_expectations.yml` plugin_module_name entry.  Until that wiring is
    #    in place we use the built-in range expectation on the raw millisecond
    #    column as a proxy — the pipeline must pre-compute
    #    (current_epoch_ms - 60_000) and pass it as min_value at runtime via an
    #    Evaluation Parameter so that the bound stays dynamic.
    #
    #    The meta field documents intent for future plugin migration.
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "timestamp_ms",
                # Evaluation Parameter injected at checkpoint run time:
                #   {"freshness_floor_ms": current_epoch_ms - 60_000}
                "min_value": {"$PARAMETER": "freshness_floor_ms"},
                "max_value": None,
            },
            meta={
                "custom_type": "timestamp_freshness",
                "max_lag_seconds": 60,
                "note": (
                    "Proxy for ExpectTimestampFreshness. The real custom class "
                    "requires GX plugin registration. min_value is supplied as an "
                    "Evaluation Parameter (current_epoch_ms - 60_000) at runtime."
                ),
            },
        )
    )

    # 6. Row-count sanity check.
    #
    #    max_value is None here because the dynamically computed 7-day average
    #    upper bound must be resolved by the orchestration layer before the
    #    checkpoint runs (e.g. queried from a metrics store and injected as an
    #    Evaluation Parameter).  Update this expectation's max_value or pass
    #    {"7d_row_count_upper": <value>} in evaluation_parameters at run time.
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_table_row_count_to_be_between",
            kwargs={
                "min_value": 1,
                # max_value should be set dynamically to the 7-day rolling
                # average row count (± some multiple of std-dev) before the
                # checkpoint executes.  Left as None until that metrics
                # pipeline is wired up.
                "max_value": None,
            },
        )
    )

    return suite


def build_checkpoint(
    context: AbstractDataContext,
    suite: ExpectationSuite,
    datasource_name: str,
) -> Checkpoint:
    """
    Creates and returns a Checkpoint for the bronze.gpu_telemetry suite.

    Args:
        context:        Active GX data context.
        suite:          The ExpectationSuite produced by build_suite().
        datasource_name: Name of the registered datasource in great_expectations.yml.

    Returns:
        Checkpoint: Configured checkpoint ready to be saved and run.
    """
    slack_webhook = os.environ.get("SLACK_WEBHOOK_URL", "")

    action_list = [
        # Store validation results in the validations store (S3 via yml config)
        {
            "name": "store_validation_result",
            "action": {
                "class_name": "StoreValidationResultAction",
            },
        },
        # Slack alert on validation failure
        {
            "name": "send_slack_notification_on_failure",
            "action": {
                "class_name": "SlackNotificationAction",
                "module_name": "great_expectations.checkpoint.actions",
                "slack_webhook": slack_webhook,
                "notify_on": "failure",
                "renderer": {
                    "module_name": "great_expectations.render.renderer.slack_renderer",
                    "class_name": "SlackRenderer",
                },
                # Extra context embedded in the notification via custom template
                "meta": {
                    "suite_name": SUITE_NAME,
                    "datasource_name": datasource_name,
                    "alert_timestamp_utc": datetime.now(timezone.utc).isoformat(),
                    "message_template": (
                        "[GX ALERT] Suite '{suite_name}' FAILED on datasource "
                        "'{datasource_name}' at {alert_timestamp_utc}. "
                        "Failed expectations: {failed_expectations_count}."
                    ),
                },
            },
        },
        # Rebuild DataDocs on S3 after every run (pass or fail)
        {
            "name": "update_data_docs",
            "action": {
                "class_name": "UpdateDataDocsAction",
                "site_names": ["s3_site"],
            },
        },
    ]

    checkpoint_config = {
        "name": CHECKPOINT_NAME,
        "config_version": 1.0,
        "class_name": "Checkpoint",
        "module_name": "great_expectations.checkpoint",
        "run_name_template": "%Y%m%d-%H%M%S-bronze-gpu-telemetry",
        "expectation_suite_name": suite.expectation_suite_name,
        "action_list": action_list,
        "validations": [
            {
                "batch_request": {
                    "datasource_name": datasource_name,
                    "data_connector_name": "bronze_gpu_telemetry",
                    "data_asset_name": "bronze_gpu_telemetry",
                    "batch_identifiers": {
                        "run_id": "latest",
                        "run_timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                },
                "expectation_suite_name": suite.expectation_suite_name,
            }
        ],
    }

    checkpoint = Checkpoint(
        name=CHECKPOINT_NAME,
        data_context=context,
        **{k: v for k, v in checkpoint_config.items() if k != "name"},
    )
    return checkpoint


def run_suite(context: AbstractDataContext, datasource_name: str) -> bool:
    """
    Orchestrates suite creation, checkpoint creation, and validation run.

    Args:
        context:        Active GX data context.
        datasource_name: Registered datasource name.

    Returns:
        bool: True if all expectations passed, False otherwise.
    """
    # Build and persist the suite
    suite = build_suite()
    context.add_or_update_expectation_suite(expectation_suite=suite)
    logger.info("Saved suite '%s' to context.", SUITE_NAME)

    # Build and persist the checkpoint
    checkpoint = build_checkpoint(context, suite, datasource_name)
    context.add_or_update_checkpoint(checkpoint=checkpoint)
    logger.info("Saved checkpoint '%s' to context.", CHECKPOINT_NAME)

    # Execute
    result = context.run_checkpoint(checkpoint_name=CHECKPOINT_NAME)

    success = result.success
    status = "PASSED" if success else "FAILED"
    logger.info(
        "Checkpoint '%s' %s. Suite: '%s'. Datasource: '%s'.",
        CHECKPOINT_NAME,
        status,
        SUITE_NAME,
        datasource_name,
    )
    return success


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    context = gx.get_context()
    datasource_name = os.environ.get("GE_DATASOURCE_NAME", "delta_lake_spark")
    success = run_suite(context, datasource_name)
    sys.exit(0 if success else 1)
