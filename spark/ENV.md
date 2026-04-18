# Spark + Delta Lake Layer — Environment Variables

All sensitive values must be injected via environment variables. No hardcoded credentials anywhere.

---

## spark/delta_tables.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `DELTA_LAKE_BASE` | S3-compatible base path for all Delta Lake tables (bronze / silver / gold) | `s3a://delta-lake` | Optional (default: `s3a://delta-lake`) |

---

## spark/quality/ge_suite_gpu_telemetry.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL for GX validation failure alerts | `https://hooks.slack.com/services/T.../B.../xxx` | Optional (default: `""` — alerts silently skipped) |
| `GE_DATASOURCE_NAME` | Name of the registered Great Expectations datasource in `great_expectations.yml` | `delta_lake_spark` | Optional (default: `delta_lake_spark`) |

---

## spark/quality/ge_suite_training_corpus.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL for GX validation failure alerts | `https://hooks.slack.com/services/T.../B.../xxx` | Optional (default: `""` — alerts silently skipped) |
| `GE_DATASOURCE_NAME` | Name of the registered Great Expectations datasource in `great_expectations.yml` | `delta_lake_spark` | Optional (default: `delta_lake_spark`) |

---

## spark/lineage/dataset_registry.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `DELTA_LAKE_BASE` | S3-compatible base path used to locate the `metadata.dataset_registry` Delta table | `s3a://delta-lake` | Optional (default: `s3a://delta-lake`) |

---

## spark/lineage/lineage_graph.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `DELTA_LAKE_BASE` | S3-compatible base path for Delta Lake table access | `s3a://delta-lake` | Optional (default: `s3a://delta-lake`) |
| `FOUNDRY_URL` | Palantir Foundry base URL for Ontology API calls | `https://foundry.example.com` | **Required** (raises `KeyError` if missing) |
| `FOUNDRY_TOKEN` | Palantir Foundry Bearer token for Ontology API authentication | `eyJhbGciOi...` | **Required** (raises `KeyError` if missing) |
| `FOUNDRY_ONTOLOGY_RID` | Foundry Ontology resource identifier | `ri.ontology.main.ontology.amd-ml` | Optional (default: `ri.ontology.main.ontology.amd-ml`) |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list for offset-at-timestamp queries in backward lineage tracing | `kafka-broker-0:9092,kafka-broker-1:9092` | Optional (default: `""` — Kafka offset lookup skipped) |

---

## spark/spark-application.yaml (Kubernetes Secrets / ConfigMaps)

| Variable / Secret Key | Source | Description | Example Value |
|---|---|---|---|
| `S3A_ACCESS_KEY` | Secret: `s3a-credentials`, key: `access-key` | S3-compatible object store access key ID | `AKIAIOSFODNN7EXAMPLE` |
| `S3A_SECRET_KEY` | Secret: `s3a-credentials`, key: `secret-key` | S3-compatible object store secret access key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `CEPH_ENDPOINT` | Secret: `ceph-config`, key: `endpoint` | Ceph (or other S3-compatible) object store endpoint URL | `https://ceph.storage.internal:443` |

### great_expectations.yml placeholder variables (resolved at GX runtime)

| Variable | Description | Example Value |
|---|---|---|
| `SPARK_MASTER` | Spark master URL injected into the GX SparkDF execution engine config | `spark://spark-master:7077` or `local[*]` |
| `GE_BUCKET` | S3 bucket for Great Expectations expectations, validations, and checkpoint stores | `ge-expectations` |
| `GE_DOCS_BUCKET` | S3 bucket for Great Expectations DataDocs static site | `ge-data-docs` |
