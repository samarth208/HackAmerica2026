# Kafka Layer — Environment Variables

## gpu_telemetry_producer.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated Kafka broker list | `kafka-brokers.kafka.svc:9092` | Yes |
| `KAFKA_SECURITY_PROTOCOL` | Kafka client security protocol | `PLAINTEXT` (default: `PLAINTEXT`) | Optional |
| `KAFKA_SSL_CA_LOCATION` | Filesystem path to the CA certificate bundle; required when `KAFKA_SECURITY_PROTOCOL=SSL` | `/etc/ssl/certs/ca-bundle.crt` | Required if SSL |
| `NODE_NAME` | Kubernetes node name; injected via the downward API (`spec.nodeName`) | `gpu-node-01` | Yes |
| `SCHEMA_PATH` | Absolute path to the `gpu_telemetry_event.avsc` Avro schema file | `/schemas/gpu_telemetry_event.avsc` (default: `/schemas/gpu_telemetry_event.avsc`) | Optional |

## inference_log_producer.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated Kafka broker list | `kafka-brokers.kafka.svc:9092` | Yes |
| `KAFKA_SECURITY_PROTOCOL` | Kafka client security protocol | `PLAINTEXT` (default: `PLAINTEXT`) | Optional |
| `KAFKA_SSL_CA_LOCATION` | Filesystem path to the CA certificate bundle; required when `KAFKA_SECURITY_PROTOCOL=SSL` | `/etc/ssl/certs/ca-bundle.crt` | Required if SSL |
| `VLLM_HOST` | Hostname or cluster-DNS name of the running vLLM Prometheus metrics endpoint | `vllm-service.inference.svc` | Yes |
| `VLLM_PORT` | TCP port on which vLLM exposes its `/metrics` endpoint | `8000` (default: `8000`) | Optional |
| `MODEL_ID` | Identifier string for the served model; embedded in every produced event | `amd-llama-3-70b` | Yes |
| `MODEL_VERSION` | Version string for the served model; embedded in every produced event | `v1.2.0` | Yes |
| `SCHEMA_PATH` | Absolute path to the `inference_log_event.avsc` Avro schema file | `/schemas/inference_log_event.avsc` (default: `/schemas/inference_log_event.avsc`) | Optional |
| `DLQ_TOPIC` | Kafka topic name for the dead-letter queue; receives records that fail Avro serialization | `raw.dlq.inference.logs` (default: `raw.dlq.inference.logs`) | Optional |

## alert_enrichment_job.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated Kafka broker list consumed and produced to by the Flink job | `kafka-brokers.kafka.svc:9092` | Yes |
| `FOUNDRY_URL` | Base URL of the Palantir Foundry instance used for Ontology API lookups | `https://foundry.ml-platform.internal` | Yes |
| `FOUNDRY_TOKEN` | Bearer token for authenticating against the Palantir Foundry Ontology API | `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...` | Yes |
| `FOUNDRY_ONTOLOGY_RID` | Palantir Ontology resource identifier for the AMD ML ontology | `ri.ontology.main.ontology.amd-ml` (default: `ri.ontology.main.ontology.amd-ml`) | Optional |
| `FLINK_PARALLELISM` | Default parallelism for all Flink operators in the job graph | `16` (default: `16`) | Optional |
| `S3_CHECKPOINT_BUCKET` | S3/Ceph bucket name used to store Flink RocksDB checkpoints | `ceph-bucket` (default: `ceph-bucket`) | Optional |

## corpus_processor_job.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated Kafka broker list for the metadata Kafka sink | `kafka-brokers.kafka.svc:9092` | Yes |
| `S3_RAW_DOCUMENTS_PREFIX` | S3 URI prefix watched continuously by the FileSource for new JSON-lines documents | `s3://raw-documents/` (default: `s3://raw-documents/`) | Optional |
| `S3_DELTA_LAKE_PREFIX` | S3 URI prefix for Delta Lake bronze-layer write paths (training and rejected corpora) | `s3://delta-lake/bronze` (default: `s3://delta-lake/bronze`) | Optional |
| `S3_CHECKPOINT_BUCKET` | S3/Ceph bucket name used to store Flink RocksDB checkpoints | `ceph-bucket` (default: `ceph-bucket`) | Optional |
| `FLINK_PARALLELISM` | Default parallelism for all Flink operators in the job graph | `16` (default: `16`) | Optional |
