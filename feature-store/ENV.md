# Feature Store Layer — Environment Variables

All sensitive values injected via environment variables or Kubernetes Secrets.

---

## feature-store/feast/feature_store.yaml

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `FEAST_REGISTRY_BUCKET` | S3 bucket name where Feast registry protobuf is stored | `feast-registry` | Yes |
| `REDIS_HOST` | Hostname of the Redis online store | `redis-master.ml-platform.svc` | Yes |
| `REDIS_PORT` | TCP port of the Redis online store | `6379` | Yes |
| `REDIS_PASSWORD` | Password for Redis authentication | *(secret)* | Yes |

---

## feature-store/feast/feature_definitions.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `DELTA_LAKE_BUCKET` | S3 bucket name for Delta Lake tables used as Feast data sources (`silver/gpu_telemetry_hourly`, `bronze/inference_logs`, `bronze/training_metrics`) | `delta-lake` | Optional — defaults to `delta-lake` |

---

## feature-store/feast/feature_store_components.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `S3A_ACCESS_KEY` | S3-compatible access key for Spark/Hadoop s3a filesystem | *(secret)* | Optional — defaults to `""` (uses instance role if empty) |
| `S3A_SECRET_KEY` | S3-compatible secret key for Spark/Hadoop s3a filesystem | *(secret)* | Optional — defaults to `""` (uses instance role if empty) |
| `CEPH_ENDPOINT` | S3-compatible endpoint URL for Ceph object storage | `http://ceph-rgw:80` | Optional — defaults to `http://ceph-rgw:80` |
| `DELTA_LAKE_BUCKET` | S3 bucket name for Delta Lake tables (same as feature_definitions.py, shared env) | `delta-lake` | Optional — defaults to `delta-lake` |

---

## feature-store/api/main.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `FEATURE_STORE_API_KEY` | API key validated in the `X-API-Key` request header for all authenticated endpoints | *(secret)* | Optional — defaults to `""` (all requests rejected if unset) |
| `MTLS_ENABLED` | Enable mutual TLS client CN validation (`"true"` or `"false"`) | `true` | Optional — defaults to `false` |
| `ALLOWED_CLIENT_CNS` | Comma-separated list of permitted TLS client certificate Common Names | `svc-aip,svc-dashboard` | Optional — defaults to `""` (no CN restriction) |
| `REDIS_HOST` | Hostname of the Redis cache backing the feature serve layer | `redis-master.ml-platform.svc` | Optional — defaults to `localhost` |
| `REDIS_PORT` | TCP port of the Redis cache | `6379` | Optional — defaults to `6379` |
| `REDIS_PASSWORD` | Password for Redis authentication | *(secret)* | Optional — defaults to `""` (no auth) |
| `FEAST_REPO_PATH` | Filesystem path to the directory containing `feature_store.yaml` | `/app/feast` | Optional — defaults to `/app/feast` |
| `DELTA_LAKE_BUCKET` | S3 bucket for Delta Lake fallback queries (used by Feast offline store configured in `feature_store.yaml`) | `delta-lake` | Optional — informational reference |

---

## feature-store/assembler/context_assembler.py

| Variable | Description | Example Value | Required |
|---|---|---|---|
| `FOUNDRY_URL` | Base URL of the Palantir Foundry instance | `https://foundry.ml-platform.internal` | Yes — `os.environ["FOUNDRY_URL"]` |
| `FOUNDRY_TOKEN` | Bearer token for Palantir Foundry API authentication | *(secret)* | Yes — `os.environ["FOUNDRY_TOKEN"]` |
| `FOUNDRY_ONTOLOGY_RID` | Resource Identifier of the Foundry Ontology | `ri.ontology.main.ontology.amd-ml` | Optional — defaults to `ri.ontology.main.ontology.amd-ml` |
| `FEATURE_STORE_URL` | Base URL of the Feature Store API service | `http://feature-store-api.ml-platform.svc:8080` | Yes — `os.environ["FEATURE_STORE_URL"]` |
| `FEATURE_STORE_API_KEY` | API key sent as `X-API-Key` header to the Feature Store API | *(secret)* | Yes — `os.environ["FEATURE_STORE_API_KEY"]` |
| `K8S_NAMESPACE` | Kubernetes namespace queried for pod events | `ml-platform` | Optional — defaults to `ml-platform` |
| `K8S_IN_CLUSTER` | Set to `"true"` when assembler runs inside Kubernetes (selects `load_incluster_config`) | `true` | Optional — defaults to `false` |

---

## feature-store/api/k8s-deployment.yaml (Kubernetes Sources)

All environment variables are bulk-injected into the `feature-store-api` container via `envFrom`. Individual variable bindings are listed below for reference.

| Variable / Key | Source | Description | Example Value |
|---|---|---|---|
| `FEAST_REPO_PATH` | ConfigMap: `feature-store-config` | Path to `feature_store.yaml` inside the container | `/app/feast` |
| `REDIS_HOST` | ConfigMap: `feature-store-config` | Redis service hostname | `redis-master.ml-platform.svc` |
| `REDIS_PORT` | ConfigMap: `feature-store-config` | Redis TCP port | `6379` |
| `MTLS_ENABLED` | ConfigMap: `feature-store-config` | Enable mTLS client CN check | `true` |
| `ALLOWED_CLIENT_CNS` | ConfigMap: `feature-store-config` | Permitted client cert CNs | `svc-aip,svc-dashboard` |
| `DELTA_LAKE_BUCKET` | ConfigMap: `feature-store-config` | S3 bucket for Delta Lake | `delta-lake` |
| `FEAST_REGISTRY_BUCKET` | ConfigMap: `feature-store-config` | S3 bucket for Feast registry | `feast-registry` |
| `CEPH_ENDPOINT` | ConfigMap: `feature-store-config` | Ceph RGW endpoint URL | `http://ceph-rgw.storage.svc:80` |
| `FEATURE_STORE_API_KEY` | Secret: `feature-store-secrets` | API key for `X-API-Key` auth | *(secret)* |
| `REDIS_PASSWORD` | Secret: `feature-store-secrets` | Redis auth password | *(secret)* |
| `S3A_ACCESS_KEY` | Secret: `feature-store-secrets` | S3-compatible access key | *(secret)* |
| `S3A_SECRET_KEY` | Secret: `feature-store-secrets` | S3-compatible secret key | *(secret)* |
| `feature-store-tls` (volume) | Secret: `feature-store-tls` | TLS certificate and key mounted at `/etc/tls` | *(certificate files)* |
