// Read DESIGN.md and CLAUDE.md before modifying.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Edit3,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { getModels } from "@/api/inference";
import {
  useAgentChat,
  type Attachment,
  type ChatSession,
  type ContentBlock,
  type Message,
  type ToolCallBlock,
} from "@/features/agent-chat/useAgentChat";
import { ContextAttachmentPicker } from "@/features/agent-chat/ContextAttachmentPicker";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSIONS_KEY = "aegis-chat-sessions";

const SUGGESTED_PROMPTS = [
  "Summarize the top P1 alerts in the last 24 hours",
  "What is the current GPU utilization across the cluster?",
  "Show me training runs with loss spikes",
  "Which model versions are deployed in production?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadAllSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as ChatSession[]).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  } catch {
    return [];
  }
}

/** Detect language hint from a fenced code block opener, e.g. ```python */
function detectLanguage(fence: string): string {
  const match = fence.match(/^```(\w+)/);
  return match?.[1] ?? "text";
}

// ─── Code block renderer ──────────────────────────────────────────────────────

interface CodeBlockProps {
  code: string;
  language: string;
}

function CodeBlock({ code, language }: CodeBlockProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between bg-surface px-3 py-1.5">
        <span className="font-data text-xs text-text-muted">{language}</span>
        <button
          onClick={handleCopy}
          className="font-label text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={atomOneDark}
        customStyle={{
          margin: 0,
          padding: "0.75rem 1rem",
          fontSize: "0.75rem",
          background: "transparent",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ─── Text block renderer (handles fenced code blocks) ────────────────────────

function TextContent({ text }: { text: string }): React.ReactElement {
  // Split on code fences
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n");
          const language = detectLanguage(lines[0] ?? "");
          const code = lines.slice(1, -1).join("\n");
          return <CodeBlock key={i} code={code} language={language} />;
        }
        // Plain text — render line breaks
        const textLines = part.split("\n");
        return (
          <span key={i}>
            {textLines.map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </span>
        );
      })}
    </>
  );
}

// ─── Tool call panel ──────────────────────────────────────────────────────────

function ToolCallPanel({
  block,
}: {
  block: ToolCallBlock;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const hasResult = block.result !== undefined;
  const hasError = block.error !== undefined;

  const statusColor = hasError
    ? "text-threat-red"
    : hasResult
    ? "text-threat-green"
    : "text-text-muted";

  return (
    <div className="my-2 rounded-md border border-border overflow-hidden">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 bg-surface px-3 py-2 text-left hover:bg-bg transition-colors"
      >
        <Wrench size={12} className={statusColor} />
        <span className="font-data text-xs text-text-primary flex-1">
          {block.name}
        </span>
        <span className={`font-data text-xs ${statusColor}`}>
          {hasError ? "error" : hasResult ? "done" : "pending…"}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-text-muted" />
        ) : (
          <ChevronRight size={12} className="text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-border text-xs font-data">
          <div className="px-3 py-2">
            <p className="font-label text-text-muted text-[10px] uppercase tracking-wide mb-1">
              Input
            </p>
            <pre className="text-text-primary whitespace-pre-wrap break-all leading-relaxed">
              {block.input}
            </pre>
          </div>
          {hasResult && (
            <div className="px-3 py-2">
              <p className="font-label text-text-muted text-[10px] uppercase tracking-wide mb-1">
                Result
              </p>
              <pre className="text-threat-green whitespace-pre-wrap break-all leading-relaxed">
                {block.result}
              </pre>
            </div>
          )}
          {hasError && (
            <div className="px-3 py-2">
              <p className="font-label text-text-muted text-[10px] uppercase tracking-wide mb-1">
                Error
              </p>
              <pre className="text-threat-red whitespace-pre-wrap break-all leading-relaxed">
                {block.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}): React.ReactElement {
  const isUser = message.role === "user";

  return (
    <div
      data-testid={isUser ? "user-message" : "assistant-message"}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-start`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? "bg-accent" : "bg-surface border border-border"
        }`}
      >
        {isUser ? (
          <User size={13} className="text-white" />
        ) : (
          <Bot size={13} className="text-text-muted" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[72%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-accent/10 border border-accent/20"
            : "bg-surface border border-border"
        }`}
      >
        {message.blocks.map((block: ContentBlock, i) => {
          if (block.type === "text") {
            return (
              <p
                key={i}
                className="font-ui text-sm text-text-primary leading-relaxed"
              >
                <TextContent text={block.text} />
              </p>
            );
          }
          return <ToolCallPanel key={i} block={block} />;
        })}

        {/* Streaming cursor */}
        {isStreaming && message.isStreaming && (
          <span className="inline-block w-1 h-4 bg-accent animate-pulse ml-0.5 rounded-sm align-middle" />
        )}
      </div>
    </div>
  );
}

// ─── Empty state / suggested prompts ─────────────────────────────────────────

function EmptyChat({
  onPrompt,
}: {
  onPrompt: (p: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Zap size={22} className="text-accent" />
      </div>
      <div className="text-center">
        <p className="font-label text-base text-text-primary mb-1">
          AEGIS Agent
        </p>
        <p className="font-ui text-sm text-text-muted">
          Ask anything about your cluster, models, or alerts.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            data-testid="suggested-prompt"
            onClick={() => onPrompt(prompt)}
            className="text-left rounded-lg border border-border bg-surface hover:border-accent/30 hover:bg-accent/5 px-3 py-2.5 transition-colors"
          >
            <p className="font-ui text-xs text-text-muted leading-relaxed">
              {prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentChatPage(): React.ReactElement {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<ChatSession[]>(
    loadAllSessions
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedModel, setSelectedModel] = useState("default");
  const [availableModels, setAvailableModels] = useState<
    { id: string; name: string }[]
  >([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const {
    session,
    isStreaming,
    error,
    sendMessage,
    regenerateLastMessage,
    clearSession,
    createSession,
    loadSession,
  } = useAgentChat(activeSessionId);

  // Load models on mount
  useEffect(() => {
    getModels()
      .then((ms) => setAvailableModels(ms))
      .catch(() => {
        // graceful — stick with default
      });
  }, []);

  // Keep allSessions in sync after any session change
  useEffect(() => {
    setAllSessions(loadAllSessions());
  }, [session]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputText]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleNewChat(): void {
    const id = createSession();
    setActiveSessionId(id);
    setInputText("");
    setAttachments([]);
  }

  function handleSelectSession(id: string): void {
    loadSession(id);
    setActiveSessionId(id);
    setInputText("");
    setAttachments([]);
  }

  function handleDeleteSession(e: React.MouseEvent, id: string): void {
    e.stopPropagation();
    if (id === activeSessionId) {
      clearSession();
      setActiveSessionId(null);
    } else {
      // Remove from localStorage directly
      try {
        const sessions = loadAllSessions().filter((s) => s.id !== id);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        setAllSessions(sessions);
      } catch {
        // ignore
      }
    }
    setAllSessions(loadAllSessions());
  }

  const handleSend = useCallback(async (): Promise<void> => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    // Create a session if none
    let sid = activeSessionId;
    if (!sid) {
      sid = createSession();
      setActiveSessionId(sid);
    }

    setInputText("");
    setAttachments([]);
    await sendMessage(text, attachments, selectedModel);
    setAllSessions(loadAllSessions());
  }, [
    inputText,
    isStreaming,
    activeSessionId,
    attachments,
    selectedModel,
    sendMessage,
    createSession,
  ]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleSuggestedPrompt(prompt: string): void {
    setInputText(prompt);
    textareaRef.current?.focus();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const messages = session?.messages ?? [];

  const canRegenerate = useMemo(
    () =>
      !isStreaming &&
      messages.length > 0 &&
      messages[messages.length - 1]?.role === "assistant",
    [isStreaming, messages]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      {sidebarOpen && (
        <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-surface overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-border">
            <span className="font-label text-xs text-text-muted uppercase tracking-wide">
              Conversations
            </span>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 rounded-md bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 px-2 py-1 font-label text-xs transition-colors"
            >
              <Plus size={11} />
              New
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto py-1">
            {allSessions.length === 0 ? (
              <p className="px-3 py-4 font-ui text-xs text-text-muted text-center">
                No conversations yet
              </p>
            ) : (
              allSessions.map((s) => (
                <button
                  key={s.id}
                  data-testid="chat-session"
                  onClick={() => handleSelectSession(s.id)}
                  className={`group flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-bg ${
                    s.id === activeSessionId
                      ? "bg-bg border-l-2 border-accent"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <MessageSquare
                    size={13}
                    className="mt-0.5 shrink-0 text-text-muted"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-xs text-text-primary truncate leading-tight">
                      {s.title}
                    </p>
                    <p className="font-data text-[10px] text-text-muted mt-0.5">
                      {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="shrink-0 mt-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-threat-red transition-all"
                    aria-label="Delete conversation"
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg transition-colors"
              aria-label="Toggle sidebar"
            >
              <Edit3 size={14} />
            </button>
            <span className="font-label text-sm text-text-primary">
              {session?.title ?? "AEGIS Agent"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canRegenerate && (
              <button
                onClick={() => void regenerateLastMessage(selectedModel)}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-primary font-label text-xs transition-colors"
              >
                <RotateCcw size={12} />
                Regenerate
              </button>
            )}
            {isStreaming && (
              <div className="flex items-center gap-1.5 text-text-muted font-label text-xs">
                <RefreshCw size={12} className="animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyChat onPrompt={handleSuggestedPrompt} />
          ) : (
            <>
              {messages.map((msg: Message) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming}
                />
              ))}
              {error && (
                <p className="font-ui text-sm text-threat-red text-center py-2">
                  {error}
                </p>
              )}
              <div ref={threadEndRef} />
            </>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
          {/* Input row */}
          <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-accent/30 transition-colors">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the agent… (Shift+Enter for new line)"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-transparent font-ui text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50 leading-relaxed py-0.5"
              style={{ maxHeight: "160px" }}
            />
            <button
              data-testid="send-message"
              onClick={() => void handleSend()}
              disabled={!inputText.trim() || isStreaming}
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-accent disabled:opacity-40 hover:bg-accent/80 transition-colors"
              aria-label="Send message"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center gap-2 mt-2">
            <ContextAttachmentPicker
              attachments={attachments}
              onChange={setAttachments}
            />

            {/* Model selector */}
            <div className="relative flex items-center">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none rounded-md border border-border bg-surface pl-2.5 pr-6 py-1.5 font-label text-xs text-text-muted focus:border-accent/30 focus:outline-none cursor-pointer"
              >
                <option value="default">Default</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={11}
                className="absolute right-1.5 text-text-muted pointer-events-none"
              />
            </div>

            <span className="ml-auto font-label text-[10px] text-text-muted">
              Shift+Enter for new line
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
