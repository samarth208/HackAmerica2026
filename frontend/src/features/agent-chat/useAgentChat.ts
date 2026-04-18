// Read DESIGN.md and CLAUDE.md before modifying.

import { useCallback, useEffect, useRef, useState } from "react";
import { chat } from "@/api/inference";
import type { ChatMessage } from "@/api/inference";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant";

export type ToolCallBlock = {
  type: "tool_call";
  id: string;
  name: string;
  input: string;   // raw JSON string
  result?: string;
  error?: string;
};

export type ContentBlock =
  | { type: "text"; text: string }
  | ToolCallBlock;

export type Message = {
  id: string;
  role: MessageRole;
  blocks: ContentBlock[];
  timestamp: number;
  isStreaming?: boolean;
};

export type Attachment = {
  type: "alert" | "model";
  id: string;
  label: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "aegis-chat-sessions";
const MAX_SESSIONS = 20;

// Regex patterns for streaming markers
const TOOL_CALL_RE = /^\[TOOL_CALL:(\{.*\})\]$/s;
const TOOL_RESULT_RE = /^\[TOOL_RESULT:(tc_[^:]+):([\s\S]*)\]$/s;
const TOOL_ERROR_RE = /^\[TOOL_ERROR:(tc_[^:]+):([\s\S]*)\]$/s;

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]): void {
  try {
    // Trim to MAX_SESSIONS, keeping most recently updated
    const trimmed = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

function upsertSession(session: ChatSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  saveSessions(sessions);
}

function removeSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  saveSessions(sessions);
}

function getSession(id: string): ChatSession | null {
  return loadSessions().find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function newId(prefix = "msg"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Convert session messages to ChatMessage array for the API, using text blocks only. */
function buildApiMessages(messages: Message[]): ChatMessage[] {
  return messages.map((msg) => {
    const textParts = msg.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { role: msg.role, content: textParts };
  });
}

/** Format attachments into a preamble string to prepend to the user message. */
function formatAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map(
    (a) => `[${a.type}:${a.id}] ${a.label}`
  );
  return lines.join("\n") + "\n\n";
}

// ---------------------------------------------------------------------------
// Streaming parser
// ---------------------------------------------------------------------------

/**
 * Parse a complete marker token from the accumulated stream buffer.
 * Returns the marker type + payload if recognised, otherwise null.
 */
function parseMarker(
  token: string
): null | { kind: "tool_call"; raw: string } | { kind: "tool_result"; id: string; result: string } | { kind: "tool_error"; id: string; error: string } {
  const tcMatch = token.match(TOOL_CALL_RE);
  if (tcMatch && tcMatch[1] != null) return { kind: "tool_call", raw: tcMatch[1] };

  const trMatch = token.match(TOOL_RESULT_RE);
  if (trMatch && trMatch[1] != null && trMatch[2] != null)
    return { kind: "tool_result", id: trMatch[1], result: trMatch[2] };

  const teMatch = token.match(TOOL_ERROR_RE);
  if (teMatch && teMatch[1] != null && teMatch[2] != null)
    return { kind: "tool_error", id: teMatch[1], error: teMatch[2] };

  return null;
}

/**
 * Apply a parsed chunk of streaming text to the current blocks array.
 * Returns a new blocks array (immutable update).
 *
 * Handles buffering for partial `[TOOL_*:...]` markers that may span
 * multiple SSE chunks.
 */
function applyChunk(
  chunk: string,
  blocks: ContentBlock[],
  markerBuffer: string
): { blocks: ContentBlock[]; markerBuffer: string } {
  let buf = markerBuffer + chunk;
  let updated = [...blocks];

  // Process the buffer character by character, extracting complete markers
  // or flushing as text when we can determine it's not a valid marker.
  while (buf.length > 0) {
    if (!buf.includes("[")) {
      // No marker possible — flush all as text
      updated = appendText(updated, buf);
      buf = "";
      break;
    }

    const openIdx = buf.indexOf("[");

    // Flush text before the opening bracket
    if (openIdx > 0) {
      updated = appendText(updated, buf.slice(0, openIdx));
      buf = buf.slice(openIdx);
    }

    // buf now starts with '['. Check if we have a complete marker.
    const closeIdx = findMatchingClose(buf);

    if (closeIdx === -1) {
      // Incomplete marker — hold in buffer and wait for more data
      break;
    }

    const candidate = buf.slice(0, closeIdx + 1);
    const parsed = parseMarker(candidate);

    if (parsed) {
      updated = applyMarker(updated, parsed);
    } else {
      // Looks like a bracket sequence but not a recognised marker — treat as text
      updated = appendText(updated, candidate);
    }

    buf = buf.slice(closeIdx + 1);
  }

  return { blocks: updated, markerBuffer: buf };
}

/**
 * Find the index of the closing `]` that matches the opening `[` at index 0
 * of `str`, respecting nested braces (but not nested brackets).
 * Returns -1 if no closing bracket is found yet.
 */
function findMatchingClose(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function appendText(blocks: ContentBlock[], text: string): ContentBlock[] {
  if (!text) return blocks;
  const last = blocks[blocks.length - 1];
  if (last && last.type === "text") {
    return [
      ...blocks.slice(0, -1),
      { type: "text", text: last.text + text },
    ];
  }
  return [...blocks, { type: "text", text }];
}

function applyMarker(
  blocks: ContentBlock[],
  parsed: ReturnType<typeof parseMarker>
): ContentBlock[] {
  if (!parsed) return blocks;

  if (parsed.kind === "tool_call") {
    try {
      const obj = JSON.parse(parsed.raw) as { id?: string; name?: string; input?: unknown };
      const toolBlock: ToolCallBlock = {
        type: "tool_call",
        id: obj.id ?? newId("tc"),
        name: obj.name ?? "unknown",
        input: typeof obj.input === "string" ? obj.input : JSON.stringify(obj.input ?? {}),
      };
      return [...blocks, toolBlock];
    } catch {
      // Malformed JSON in tool call — treat as text
      return appendText(blocks, parsed.raw);
    }
  }

  if (parsed.kind === "tool_result") {
    return blocks.map((b) =>
      b.type === "tool_call" && b.id === parsed.id
        ? { ...b, result: parsed.result }
        : b
    );
  }

  if (parsed.kind === "tool_error") {
    return blocks.map((b) =>
      b.type === "tool_call" && b.id === parsed.id
        ? { ...b, error: parsed.error }
        : b
    );
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentChat(sessionId: string | null): {
  session: ChatSession | null;
  isStreaming: boolean;
  error: string | null;
  sendMessage(content: string, attachments: Attachment[], model: string): Promise<void>;
  regenerateLastMessage(model: string): Promise<void>;
  clearSession(): void;
  loadSession(id: string): void;
  createSession(): string;
} {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);
  const [session, setSession] = useState<ChatSession | null>(
    sessionId ? getSession(sessionId) : null
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Sync when sessionId prop changes from outside
  useEffect(() => {
    setActiveSessionId(sessionId);
    setSession(sessionId ? getSession(sessionId) : null);
  }, [sessionId]);

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Internal: update session state + persist
  // ---------------------------------------------------------------------------

  const updateSession = useCallback((updated: ChatSession) => {
    upsertSession(updated);
    setSession(updated);
  }, []);

  // ---------------------------------------------------------------------------
  // Internal: stream assistant response
  // ---------------------------------------------------------------------------

  const streamAssistant = useCallback(
    async (
      currentSession: ChatSession,
      historyMessages: Message[],
      model: string
    ): Promise<void> => {
      // Abort any prior request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantMsgId = newId("msg");
      const now = Date.now();

      // Create placeholder assistant message
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        blocks: [],
        timestamp: now,
        isStreaming: true,
      };

      const sessionWithPlaceholder: ChatSession = {
        ...currentSession,
        messages: [...historyMessages, assistantMsg],
        updatedAt: now,
      };
      updateSession(sessionWithPlaceholder);
      setIsStreaming(true);
      setError(null);

      const apiMessages: ChatMessage[] = buildApiMessages(historyMessages);
      let blocks: ContentBlock[] = [];
      let markerBuffer = "";

      try {
        for await (const chunk of chat(apiMessages, model, controller.signal)) {
          if (controller.signal.aborted) break;

          const result = applyChunk(chunk, blocks, markerBuffer);
          blocks = result.blocks;
          markerBuffer = result.markerBuffer;

          // Update the streaming message in state
          setSession((prev) => {
            if (!prev) return prev;
            const msgs = prev.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, blocks } : m
            );
            return { ...prev, messages: msgs };
          });
        }

        // Flush any remaining marker buffer as text
        if (markerBuffer) {
          blocks = appendText(blocks, markerBuffer);
          markerBuffer = "";
        }

        // Finalise the assistant message (clear isStreaming flag)
        const finalMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          blocks,
          timestamp: now,
          isStreaming: false,
        };

        const finalSession: ChatSession = {
          ...currentSession,
          messages: [...historyMessages, finalMsg],
          updatedAt: Date.now(),
        };
        updateSession(finalSession);
      } catch (err) {
        if (controller.signal.aborted) {
          // Intentional abort — preserve whatever was streamed
          const partialMsg: Message = {
            id: assistantMsgId,
            role: "assistant",
            blocks,
            timestamp: now,
            isStreaming: false,
          };
          const partialSession: ChatSession = {
            ...currentSession,
            messages: [...historyMessages, partialMsg],
            updatedAt: Date.now(),
          };
          updateSession(partialSession);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          // Remove the placeholder on error
          const errorSession: ChatSession = {
            ...currentSession,
            messages: historyMessages,
            updatedAt: Date.now(),
          };
          updateSession(errorSession);
        }
      } finally {
        setIsStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [updateSession]
  );

  // ---------------------------------------------------------------------------
  // createSession
  // ---------------------------------------------------------------------------

  const createSession = useCallback((): string => {
    const id = newId("session");
    const now = Date.now();
    const newSession: ChatSession = {
      id,
      title: "New conversation",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    upsertSession(newSession);
    setActiveSessionId(id);
    setSession(newSession);
    return id;
  }, []);

  // ---------------------------------------------------------------------------
  // loadSession
  // ---------------------------------------------------------------------------

  const loadSession = useCallback((id: string) => {
    const loaded = getSession(id);
    setActiveSessionId(id);
    setSession(loaded);
  }, []);

  // ---------------------------------------------------------------------------
  // clearSession
  // ---------------------------------------------------------------------------

  const clearSession = useCallback(() => {
    if (!activeSessionId) return;
    abortRef.current?.abort();
    removeSession(activeSessionId);
    setSession(null);
    setActiveSessionId(null);
    setIsStreaming(false);
    setError(null);
  }, [activeSessionId]);

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (
      content: string,
      attachments: Attachment[],
      model: string
    ): Promise<void> => {
      if (isStreaming) return;

      // Ensure we have an active session
      let currentSession = activeSessionId ? getSession(activeSessionId) : null;
      if (!currentSession) {
        const id = newId("session");
        const now = Date.now();
        currentSession = {
          id,
          title: content.slice(0, 60) || "New conversation",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        upsertSession(currentSession);
        setActiveSessionId(id);
      }

      // Build user message
      const preamble = formatAttachments(attachments);
      const fullContent = preamble + content;

      const userMsg: Message = {
        id: newId("msg"),
        role: "user",
        blocks: [{ type: "text", text: fullContent }],
        timestamp: Date.now(),
      };

      // Derive a title from the first user message if the session is new
      const title =
        currentSession.messages.length === 0
          ? content.slice(0, 60) || "New conversation"
          : currentSession.title;

      const sessionWithUser: ChatSession = {
        ...currentSession,
        title,
        messages: [...currentSession.messages, userMsg],
        updatedAt: Date.now(),
      };
      updateSession(sessionWithUser);

      await streamAssistant(sessionWithUser, sessionWithUser.messages, model);
    },
    [isStreaming, activeSessionId, updateSession, streamAssistant]
  );

  // ---------------------------------------------------------------------------
  // regenerateLastMessage
  // ---------------------------------------------------------------------------

  const regenerateLastMessage = useCallback(
    async (model: string): Promise<void> => {
      if (isStreaming) return;
      if (!activeSessionId) return;

      const currentSession = getSession(activeSessionId);
      if (!currentSession || currentSession.messages.length === 0) return;

      // Drop trailing assistant messages, keep up to and including the last user message
      const messages = [...currentSession.messages];
      while (messages.length > 0 && messages.at(-1)?.role === "assistant") {
        messages.pop();
      }

      if (messages.length === 0) return;

      const trimmedSession: ChatSession = {
        ...currentSession,
        messages,
        updatedAt: Date.now(),
      };
      updateSession(trimmedSession);

      await streamAssistant(trimmedSession, messages, model);
    },
    [isStreaming, activeSessionId, updateSession, streamAssistant]
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    session,
    isStreaming,
    error,
    sendMessage,
    regenerateLastMessage,
    clearSession,
    loadSession,
    createSession,
  };
}
