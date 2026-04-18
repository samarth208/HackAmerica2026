// Read DESIGN.md and CLAUDE.md before modifying.

import { type ZodSchema } from "zod";
import { ApiError } from "./errors";

const MAX_RETRIES = 3;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const BACKOFF_MS = [1000, 2000, 4000] as const;

// TODO: Replace console.error calls with OpenTelemetry spans when OTel SDK is wired up.

export async function fetchWithRetry<T>(
  url: string,
  schema: ZodSchema<T>,
  init?: RequestInit
): Promise<T> {
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]));
    }

    let response: Response;
    try {
      response = await fetch(API_BASE + url, init);
    } catch (networkErr) {
      const message = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error("[fetchWithRetry] Network error", { url, attempt, error: message });
      lastError = new ApiError(0, "network_error", message);
      continue;
    }

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:logout"));
      throw new ApiError(401, "unauthorized", "Session expired. Please log in again.");
    }

    if (!response.ok) {
      let code = "unknown_error";
      let message = `HTTP ${response.status}`;

      try {
        const body = (await response.json()) as { code?: string; message?: string };
        if (body.code) code = body.code;
        if (body.message) message = body.message;
      } catch {
        // body is not JSON — use defaults
      }

      const apiErr = new ApiError(response.status, code, message);
      console.error("[fetchWithRetry] Non-OK response", { url, status: response.status, attempt, code });

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastError = apiErr;
        continue;
      }

      throw apiErr;
    }

    const json: unknown = await response.json();
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      const message = parsed.error.message;
      console.error("[fetchWithRetry] Schema validation failed", { url, attempt, issues: parsed.error.issues });
      throw new ApiError(0, "schema_mismatch", message);
    }

    return parsed.data;
  }

  throw lastError ?? new ApiError(0, "max_retries_exceeded", `Failed after ${MAX_RETRIES} retries: ${url}`);
}
