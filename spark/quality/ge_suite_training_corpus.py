"""
Great Expectations suite for silver.training_corpus_clean Delta Lake table.

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
import logging
from datetime import datetime, timezone

import great_expectations as gx
from great_expectations.core import ExpectationSuite, ExpectationConfiguration
from great_expectations.checkpoint import Checkpoint
from great_expectations.data_context import AbstractDataContext

logger = logging.getLogger(__name__)

SUITE_NAME = "silver.training_corpus_clean.suite"
CHECKPOINT_NAME = "silver_training_corpus_checkpoint"


def build_suite() -> ExpectationSuite:
    """
    Creates and returns a fully configured ExpectationSuite for the
    silver.training_corpus_clean Delta Lake table.

    Returns:
        ExpectationSuite: Configured suite with all column and table expectations.
    """
    suite = ExpectationSuite(expectation_suite_name=SUITE_NAME)

    # 1. Deduplication hash must be globally unique across the table
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_unique",
            kwargs={"column": "dedup_hash"},
        )
    )

    # 2. Token count must fit within model context window limits
    #    Lower bound of 100 filters out near-empty documents;
    #    upper bound of 32 768 matches a standard 32 k-token context window.
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "token_count_estimate",
                "min_value": 100,
                "max_value": 32768,
            },
        )
    )

    # 3. Only English-language documents are retained in the clean silver layer
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_in_set",
            kwargs={
                "column": "language_detected",
                "value_set": ["en"],
            },
        )
    )

    # 4. Quality score must be at least 0.6 (high-quality threshold).
    #    Implemented via expect_column_values_to_be_between because GX does not
    #    ship a standalone expect_column_values_to_be_greater_than expectation in
    #    the core library; the between check with max_value=1.0 is semantically
    #    equivalent and also validates the upper bound of the [0, 1] score range.
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_between",
            kwargs={
                "column": "quality_score",
                "min_value": 0.6,
                "max_value": 1.0,
            },
            meta={
                "intent": "expect_column_values_to_be_greater_than_or_equal_to 0.6",
            },
        )
    )

    # 5. PII must have been scrubbed before a document reaches the silver layer.
    #    Implemented via expect_column_values_to_be_in_set because GX core does
    #    not ship expect_column_values_to_equal; a single-element set is
    #    semantically identical.
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_in_set",
            kwargs={
                "column": "pii_detected",
                "value_set": [False],
            },
            meta={
                "intent": "expect_column_values_to_equal False — no PII allowed",
            },
        )
    )

    # 6. Non-null constraints on all critical identity and quality columns
    for col in (
        "document_id",
        "dedup_hash",
        "source",
        "quality_score",
        "quality_tier",
    ):
        suite.add_expectation(
            ExpectationConfiguration(
                expectation_type="expect_column_values_to_not_be_null",
                kwargs={"column": col},
            )
        )

    # 7. Only high/medium tier documents are admitted to the clean silver table
    suite.add_expectation(
        ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_in_set",
            kwargs={
                "column": "quality_tier",
                "value_set": ["high", "medium"],
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
    Creates and returns a Checkpoint for the silver.training_corpus_clean suite.

    Args:
        context:        Active GX data context.
        suite:          The ExpectationSuite produced by build_suite().
        datasource_name: Name of the registered datasource in great_expectations.yml.

    Returns:
        Checkpoint: Configured checkpoint ready to be saved and run.
    """
    slack_webhook = os.environ.get("SLACK_WEBHOOK_URL", "")

    action_list = [
        # Persist validation results to the S3 validations store
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
        "run_name_template": "%Y%m%d-%H%M%S-silver-training-corpus",
        "expectation_suite_name": suite.expectation_suite_name,
        "action_list": action_list,
        "validations": [
            {
                "batch_request": {
                    "datasource_name": datasource_name,
                    "data_connector_name": "silver_training_corpus",
                    "data_asset_name": "silver_training_corpus_clean",
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
