// Read DESIGN.md and CLAUDE.md before modifying.

import { ApiError } from "./errors";
import { z } from "zod";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number(),
  description: z.string(),
});

export const ModelMetricsSchema = z.object({
  modelId: z.string(),
  requestsPerSec: z.number(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  errorRate: z.number(),
});

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type ModelMetrics = z.infer<typeof ModelMetricsSchema>;

// ---------------------------------------------------------------------------
// chat — streaming async generator
// ---------------------------------------------------------------------------

export async function* chat(
  messages: ChatMessage[],
  modelId: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(API_BASE + "/api/inference/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, modelId, stream: true }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, "chat_error", text);
  }

  const body = response.body as ReadableStream<Uint8Array>;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = events.pop() ?? "";

      for (const event of events) {
        const eventLine = event.trim();
        if (!eventLine.startsWith("data: ")) {
          continue;
        }

        if (eventLine === "data: [DONE]") {
          return;
        }

        try {
          const parsed = JSON.parse(eventLine.slice(6)) as { delta?: string };
          yield parsed.delta ?? "";
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new ApiError(500, "stream_error", message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// getModels
// ---------------------------------------------------------------------------

export async function getModels(): Promise<Model[]> {
  const response = await fetch(API_BASE + "/api/inference/models");

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, "get_models_error", text);
  }

  return z.array(ModelSchema).parse(await response.json());
}

// ---------------------------------------------------------------------------
// getModelMetrics
// ---------------------------------------------------------------------------

export async function getModelMetrics(modelId: string): Promise<ModelMetrics> {
  const response = await fetch(`${API_BASE}/api/inference/models/${modelId}/metrics`);

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, "get_model_metrics_error", text);
  }

  return ModelMetricsSchema.parse(await response.json());
}

// ---------------------------------------------------------------------------
// cancelRequest
// ---------------------------------------------------------------------------

export async function cancelRequest(requestId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/inference/requests/${requestId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, "cancel_request_error", text);
  }
}
