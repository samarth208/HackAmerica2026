"""
Alert context assembler for Palantir AIP.
Fetches alert data, compute node features, GPU device state, and K8s events,
then assembles a structured context string for the AIP agent.

Env vars:
  FOUNDRY_URL              Palantir Foundry base URL
  FOUNDRY_TOKEN            Foundry API token
  FOUNDRY_ONTOLOGY_RID     Ontology RID (default: ri.ontology.main.ontology.amd-ml)
  FEATURE_STORE_URL        Feature store API base URL (e.g. http://feature-store-api:8080)
  FEATURE_STORE_API_KEY    API key for feature store
  K8S_NAMESPACE            Kubernetes namespace to query for events (default: ml-platform)
  K8S_IN_CLUSTER           "true" if running inside Kubernetes (default: "false")
"""
from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

CALL_TIMEOUT = 5.0  # seconds per external call


@dataclasses.dataclass
class AssemblerResult:
    context_string: str
    context_token_count: int
    entities_referenced: list[str]
    assembly_latency_ms: float
    missing_data: list[str]


class AlertNotFoundError(Exception):
    def __init__(self, alert_id: str) -> None:
        self.alert_id = alert_id
        super().__init__(f"Alert not found in Ontology: {alert_id}")


class AlertContextAssembler:
    def __init__(
        self,
        foundry_url: str,
        foundry_token: str,
        feature_store_url: str,
        feature_store_api_key: str,
        k8s_namespace: str,
    ) -> None:
        self._foundry_url = foundry_url.rstrip("/")
        self._foundry_token = foundry_token
        self._ontology_rid = os.environ.get(
            "FOUNDRY_ONTOLOGY_RID", "ri.ontology.main.ontology.amd-ml"
        )
        self._feature_store_url = feature_store_url.rstrip("/")
        self._feature_store_api_key = feature_store_api_key
        self._k8s_namespace = k8s_namespace

        # Lazy K8s client
        self._k8s_core_v1: Any = None

    def _init_k8s(self) -> None:
        if self._k8s_core_v1 is not None:
            return
        try:
            from kubernetes import client as k8s_client, config as k8s_config
            if os.environ.get("K8S_IN_CLUSTER", "false").lower() == "true":
                k8s_config.load_incluster_config()
            else:
                k8s_config.load_kube_config()
            self._k8s_core_v1 = k8s_client.CoreV1Api()
        except Exception as e:
            logger.warning("Kubernetes client init failed: %s", e)
            self._k8s_core_v1 = None

    async def _get_ontology_object(
        self, http: httpx.AsyncClient, object_type: str, pk: str
    ) -> dict:
        url = (
            f"{self._foundry_url}/api/v2/ontologies"
            f"/{self._ontology_rid}/objects/{object_type}/{pk}"
        )
        try:
            resp = await asyncio.wait_for(
                http.get(url, headers={"Authorization": f"Bearer {self._foundry_token}"}),
                timeout=CALL_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning("Ontology GET %s/%s returned %s", object_type, pk, resp.status_code)
            return {}
        except asyncio.TimeoutError:
            logger.warning("Ontology GET %s/%s timed out", object_type, pk)
            return {}
        except Exception as e:
            logger.warning("Ontology GET %s/%s failed: %s", object_type, pk, e)
            return {}

    async def _get_linked_objects(
        self, http: httpx.AsyncClient, object_type: str, pk: str, link_name: str
    ) -> list[dict]:
        url = (
            f"{self._foundry_url}/api/v2/ontologies"
            f"/{self._ontology_rid}/objects/{object_type}/{pk}/links/{link_name}"
        )
        try:
            resp = await asyncio.wait_for(
                http.get(url, headers={"Authorization": f"Bearer {self._foundry_token}"}),
                timeout=CALL_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", [])
            logger.warning(
                "Ontology link %s/%s/%s returned %s", object_type, pk, link_name, resp.status_code
            )
            return []
        except asyncio.TimeoutError:
            logger.warning("Ontology link %s/%s/%s timed out", object_type, pk, link_name)
            return []
        except Exception as e:
            logger.warning("Ontology link traversal failed: %s", e)
            return []

    async def _get_gpu_features(
        self,
        http: httpx.AsyncClient,
        node_id: str,
        missing_data: list[str],
    ) -> dict:
        url = f"{self._feature_store_url}/features/node/{node_id}?feature_view=gpu_node_health_fv"
        try:
            resp = await asyncio.wait_for(
                http.get(url, headers={"X-API-Key": self._feature_store_api_key}),
                timeout=CALL_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json().get("features", {})
            logger.warning("Feature store returned %s for node=%s", resp.status_code, node_id)
            missing_data.append("gpu_node_health_features")
            return {}
        except asyncio.TimeoutError:
            logger.warning("Feature store timed out for node=%s", node_id)
            missing_data.append("gpu_node_health_features")
            return {}
        except Exception as e:
            logger.warning("Feature store call failed for node=%s: %s", node_id, e)
            missing_data.append("gpu_node_health_features")
            return {}

    def _get_k8s_events(self, pod_name: str) -> list:
        self._init_k8s()
        if self._k8s_core_v1 is None:
            return []
        try:
            events = self._k8s_core_v1.list_namespaced_event(
                namespace=self._k8s_namespace,
                field_selector=f"involvedObject.name={pod_name}",
            )
            sorted_events = sorted(
                events.items,
                key=lambda e: e.last_timestamp or e.event_time or "",
                reverse=True,
            )
            return sorted_events[:5]
        except Exception as e:
            logger.warning("K8s event fetch failed for pod=%s: %s", pod_name, e)
            return []

    async def assemble_context(self, alert_id: str) -> AssemblerResult:
        t0 = time.time()
        missing_data: list[str] = []
        entities_referenced: list[str] = []

        async with httpx.AsyncClient(timeout=CALL_TIMEOUT) as http:
            # Step 1: Fetch alert from Ontology
            alert = await self._get_ontology_object(http, "Alert", alert_id)
            if not alert:
                raise AlertNotFoundError(alert_id)

            entities_referenced.append(f"Alert:{alert_id}")

            title = alert.get("title", "Unknown Alert")
            severity = alert.get("severity", "UNKNOWN")
            triggered_at = alert.get("triggered_at", "")
            node_id = alert.get("node_id", "")

            # Steps 2-5: parallel fetches
            # - ComputeNode (via node_id on alert, or via link traversal)
            # - GPU devices for that node
            # - GPU features from feature store
            # - K8s events (sync, run in executor)

            async def fetch_compute_node() -> dict:
                if node_id:
                    return await self._get_ontology_object(http, "ComputeNode", node_id)
                # Fall back to link traversal: Alert → triggers → Incident → affects → ComputeNode
                incidents = await self._get_linked_objects(http, "Alert", alert_id, "triggers")
                if not incidents:
                    return {}
                incident_id = incidents[0].get("incident_id", "")
                if not incident_id:
                    return {}
                nodes = await self._get_linked_objects(http, "Incident", incident_id, "affects")
                return nodes[0] if nodes else {}

            async def fetch_gpu_devices(compute_node: dict) -> list:
                cn_id = compute_node.get("node_id", node_id)
                if not cn_id:
                    return []
                devices = await self._get_linked_objects(http, "ComputeNode", cn_id, "hosts")
                return devices[:8]

            # Run compute_node fetch first (gpu_devices depends on it), others in parallel
            compute_node_task = asyncio.create_task(fetch_compute_node())
            gpu_features_task = asyncio.create_task(
                self._get_gpu_features(http, node_id or "unknown", missing_data)
            )

            # Run K8s events in thread executor (sync library)
            loop = asyncio.get_event_loop()
            pod_name = alert.get("pod_name", node_id or "")
            k8s_task = loop.run_in_executor(None, self._get_k8s_events, pod_name)

            # Gather parallel tasks
            compute_node, gpu_features, k8s_events = await asyncio.gather(
                compute_node_task,
                gpu_features_task,
                k8s_task,
                return_exceptions=False,
            )

            # Fetch GPU devices after compute_node resolves
            gpu_devices = await fetch_gpu_devices(compute_node)

            # Extract fields
            hostname = compute_node.get("hostname", node_id or "unknown")
            gpu_count = compute_node.get("gpu_count", len(gpu_devices))

            avg_util = gpu_features.get("avg_utilization_1h", "N/A")
            alert_count_24h = gpu_features.get("alert_count_24h", "N/A")

            if compute_node:
                entities_referenced.append(
                    f"ComputeNode:{compute_node.get('node_id', node_id)}"
                )
            for dev in gpu_devices:
                entities_referenced.append(f"GPUDevice:{dev.get('device_id', '')}")

            # Format K8s events
            events_formatted = "; ".join(
                [f"{e.reason}: {e.message}" for e in k8s_events if hasattr(e, "reason")]
            ) if k8s_events else "none"

            if not k8s_events:
                missing_data.append("k8s_events")

            # Assemble context string
            context_string = (
                f"[SYSTEM CONTEXT]\n"
                f"Alert: {title}, Severity: {severity}, Time: {triggered_at}\n"
                f"Affected Node: {hostname}, GPU Count: {gpu_count}\n"
                f"Current GPU Utilization: {avg_util}%\n"
                f"Recent Alerts on this Node: {alert_count_24h} in last 24h\n"
                f"Recent K8s Events: {events_formatted}\n"
                f"[END SYSTEM CONTEXT]"
            )

            token_count = int(len(context_string.split()) * 1.3)
            latency_ms = (time.time() - t0) * 1000

            return AssemblerResult(
                context_string=context_string,
                context_token_count=token_count,
                entities_referenced=entities_referenced,
                assembly_latency_ms=round(latency_ms, 2),
                missing_data=missing_data,
            )


async def _main() -> None:
    import argparse

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Alert context assembler")
    parser.add_argument("--alert-id", required=True, help="Alert ID to assemble context for")
    args = parser.parse_args()

    assembler = AlertContextAssembler(
        foundry_url=os.environ["FOUNDRY_URL"],
        foundry_token=os.environ["FOUNDRY_TOKEN"],
        feature_store_url=os.environ["FEATURE_STORE_URL"],
        feature_store_api_key=os.environ["FEATURE_STORE_API_KEY"],
        k8s_namespace=os.environ.get("K8S_NAMESPACE", "ml-platform"),
    )

    result = await assembler.assemble_context(args.alert_id)
    print(result.context_string)
    print(f"\n--- Assembly Stats ---")
    print(f"Token count: {result.context_token_count}")
    print(f"Latency: {result.assembly_latency_ms:.1f}ms")
    print(f"Missing data: {result.missing_data}")
    print(f"Entities: {result.entities_referenced}")


if __name__ == "__main__":
    asyncio.run(_main())
