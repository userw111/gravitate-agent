"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { DynamicDataTable } from "@/components/DynamicDataTable";

type ToolCallStatus = "pending" | "executing" | "success" | "error";

type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
};

type ChatClientProps = {
  model?: string;
  onModelChange?: (model: string) => void;
  thinkingEffort?: "low" | "medium" | "high";
};

export default function ChatClient({
  model: modelProp,
  onModelChange,
  thinkingEffort = "high",
}: ChatClientProps = {}) {
  function ThinkingBubble({ text, animate = false }: { text: string; animate?: boolean }) {
    const [expanded, setExpanded] = React.useState(false);
    const [dotCount, setDotCount] = React.useState(1);

    React.useEffect(() => {
      if (expanded || !animate) return;
      const id = setInterval(() => {
        setDotCount((d) => (d % 3) + 1);
      }, 500);
      return () => clearInterval(id);
    }, [expanded, animate]);

    const label = expanded ? "Thinking" : animate ? `Thinking${".".repeat(dotCount)}` : "Thinking";

    return (
      <div className="max-w-[95%] sm:max-w-[85%] md:max-w-[75%] lg:max-w-[60%] xl:max-w-[50%] 2xl:max-w-[45%] w-fit inline-block rounded-lg px-4 py-3 text-xs leading-relaxed bg-foreground/8 text-foreground/70 border border-foreground/15 shadow-sm wrap-break-word">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="flex items-center justify-between gap-2 w-full text-left"
        >
          <div className="font-semibold text-foreground/80">{label}</div>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-foreground/10 text-foreground/60">
            {expanded ? "Hide" : "Show"}
          </span>
        </button>
        {expanded && (
          <div className="mt-2 whitespace-pre-wrap wrap-break-word text-foreground/65">
            {text}
          </div>
        )}
      </div>
    );
  }
  // Core chat state
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [placeholder, setPlaceholder] = React.useState("Ask anything…");
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [model, setModel] = React.useState(modelProp || "openai/gpt-5");

  // Sync model prop changes
  React.useEffect(() => {
    if (modelProp && modelProp !== model) {
      setModel(modelProp);
    }
  }, [modelProp, model]);

  // Check if conversation has started
  const hasStartedConversation = messages.length > 0;

  React.useEffect(() => {
    const c = scrollContainerRef.current;
    if (c) {
      c.scrollTop = c.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount and when user presses "/" or Cmd/Ctrl+K
  React.useEffect(() => {
    inputRef.current?.focus();
    const onGlobalKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTypingInField = tag === "textarea" || tag === "input";
      if ((e.key === "/" && !isTypingInField) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  // Autosize textarea
  const autosize = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const max = 160; // px
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, []);

  React.useEffect(() => {
    if (inputRef.current) autosize(inputRef.current);
  }, [input, autosize]);

  // Draft persistence
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("chat:inputDraft");
      if (saved) setInput(saved);
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem("chat:inputDraft", input);
    } catch {}
  }, [input]);

  // Rotate helpful placeholder until user types
  React.useEffect(() => {
    if (input.trim()) return;
    const hints = [
      "Summarize this document…",
      "Brainstorm 5 outreach angles for…",
      "Turn these bullets into an email…",
      "Explain like I’m 5: ",
      "Generate follow-up questions about…",
    ];
    let i = 0;
    setPlaceholder(hints[i]);
    const id = setInterval(() => {
      i = (i + 1) % hints.length;
      if (!input.trim()) setPlaceholder(hints[i]);
    }, 4500);
    return () => clearInterval(id);
  }, [input]);

  // Build user message history for quick recall with ArrowUp/ArrowDown
  const userHistory = React.useMemo(
    () => messages.filter((m) => m.role === "user").map((m) => m.content),
    [messages]
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Create a placeholder message for streaming
    const assistantMessageId = nextMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", toolCalls: [] }]);

    let accumulatedContent = "";
    let accumulatedReasoning = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, model, thinkingEffort }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === "content") {
              accumulatedContent += data.content || "";
              setMessages((prev) => {
                const updated = [...prev];
                const existing = updated[assistantMessageId];
                updated[assistantMessageId] = {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning: accumulatedReasoning || existing?.reasoning || undefined,
                  toolCalls: existing?.toolCalls ?? [],
                };
                return updated;
              });
            } else if (data.type === "reasoning") {
              accumulatedReasoning += data.content || "";
              setMessages((prev) => {
                const updated = [...prev];
                const existing = updated[assistantMessageId];
                updated[assistantMessageId] = {
                  role: "assistant",
                  content: existing?.content ?? accumulatedContent,
                  reasoning: accumulatedReasoning || undefined,
                  toolCalls: existing?.toolCalls ?? [],
                };
                return updated;
              });
            } else if (data.type === "tool_call") {
              // Tool call initiated - update message to show tool usage
              setMessages((prev) => {
                const updated = [...prev];
                const existing = updated[assistantMessageId];
                const currentToolCalls = existing?.toolCalls ? [...existing.toolCalls] : [];
                const status: ToolCallStatus =
                  (typeof data.status === "string" ? (data.status as ToolCallStatus) : undefined) ||
                  "executing";
                const callIndex = currentToolCalls.findIndex((tc) => tc.id === data.toolCallId);

                if (callIndex >= 0) {
                  currentToolCalls[callIndex] = {
                    ...currentToolCalls[callIndex],
                    arguments: data.arguments ?? currentToolCalls[callIndex].arguments,
                    status,
                  };
                } else {
                  currentToolCalls.push({
                    id: data.toolCallId,
                    name: data.toolName,
                    arguments: data.arguments ?? "",
                    status,
                  });
                }

                updated[assistantMessageId] = {
                  role: "assistant",
                  content:
                    accumulatedContent ||
                    existing?.content ||
                    "Looking up client information...",
                  reasoning: accumulatedReasoning || existing?.reasoning || undefined,
                  toolCalls: currentToolCalls,
                };
                return updated;
              });
            } else if (data.type === "tool_result") {
              setMessages((prev) => {
                const updated = [...prev];
                const existing = updated[assistantMessageId];
                if (!existing) return updated;

                const currentToolCalls = existing.toolCalls ? [...existing.toolCalls] : [];
                const callIndex = currentToolCalls.findIndex((tc) => tc.id === data.toolCallId);
                const status: ToolCallStatus =
                  data.status === "error" || data.error ? "error" : "success";
                const toolName =
                  (typeof data.toolName === "string" && data.toolName) ||
                  (callIndex >= 0 ? currentToolCalls[callIndex].name : "client_lookup");

                if (callIndex >= 0) {
                  currentToolCalls[callIndex] = {
                    ...currentToolCalls[callIndex],
                    status,
                    result: data.result,
                    error: data.error,
                  };
                } else {
                  currentToolCalls.push({
                    id: data.toolCallId,
                    name: toolName,
                    arguments: "",
                    status,
                    result: data.result,
                    error: data.error,
                  });
                }

                updated[assistantMessageId] = {
                  role: "assistant",
                  content: accumulatedContent || existing.content,
                  reasoning: accumulatedReasoning || existing.reasoning,
                  toolCalls: currentToolCalls,
                };
                return updated;
              });
            } else if (data.type === "done") {
              // Final update with any remaining reasoning
              if (data.reasoning) {
                accumulatedReasoning = data.reasoning;
              }
              setMessages((prev) => {
                const updated = [...prev];
                const existing = updated[assistantMessageId];
                updated[assistantMessageId] = {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning: accumulatedReasoning || existing?.reasoning || undefined,
                  toolCalls: existing?.toolCalls ?? [],
                };
                return updated;
              });
            }
          } catch (parseError) {
            // Skip invalid JSON
            console.error("Failed to parse SSE data:", parseError);
          }
        }
      }
    } catch (err) {
      const aborted = (err as any)?.name === "AbortError";
      if (aborted) {
        setMessages((prev) => {
          const updated = [...prev];
          const existing = updated[assistantMessageId];
          updated[assistantMessageId] = {
            role: "assistant",
            content: accumulatedContent || "Stopped.",
            reasoning: accumulatedReasoning || existing?.reasoning || undefined,
            toolCalls: existing?.toolCalls ?? [],
          };
          return updated;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const existing = updated[assistantMessageId];
          updated[assistantMessageId] = {
            role: "assistant",
            content:
              accumulatedContent ||
              "Sorry, I ran into an error reaching the AI provider. Please try again.",
            reasoning: accumulatedReasoning || existing?.reasoning || undefined,
            toolCalls: existing?.toolCalls ?? [],
          };
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    autosize(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
      return;
    }
    // Enter sends, Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
      return;
    }
    // Esc clears
    if (e.key === "Escape") {
      e.preventDefault();
      setInput("");
      return;
    }
    // ArrowUp recalls previous user prompt when input empty
    if (e.key === "ArrowUp" && !input.trim() && userHistory.length > 0) {
      e.preventDefault();
      const nextIndex = historyIndex === null ? userHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(userHistory[nextIndex] || "");
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(0, (userHistory[nextIndex] || "").length);
      });
      return;
    }
    // ArrowDown cycles forward through history
    if (e.key === "ArrowDown" && historyIndex !== null) {
      e.preventDefault();
      const nextIndex = Math.min(userHistory.length - 1, historyIndex + 1);
      setHistoryIndex(nextIndex);
      setInput(userHistory[nextIndex] || "");
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(0, (userHistory[nextIndex] || "").length);
      });
      return;
    }
  }

  // Center the chatbox when no conversation has started
  if (!hasStartedConversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          {/* Welcome message */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-light tracking-tight mb-2">AI Chat</h1>
            <p className="text-sm text-foreground/60">
              Start a conversation to get started
            </p>
          </div>

          {/* Centered chat input */}
          <form onSubmit={handleSend} className="w-full">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={handleChange}
                placeholder={placeholder}
                rows={1}
                ref={inputRef}
                className="flex-1 resize-none rounded-lg border border-foreground/10 bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                onKeyDown={handleKeyDown}
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex h-11 items-center rounded-lg bg-foreground/80 px-4 text-sm font-medium text-background hover:opacity-90"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex h-11 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity disabled:opacity-50 hover:opacity-90"
                >
                  Send
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Normal chat view when conversation has started
  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-4 bg-background"
      >
        {messages.map((m, idx) => {
          const isAssistant = m.role === "assistant";
          return (
            <div
              key={idx}
              className={`flex flex-col ${isAssistant ? "items-start" : "items-end"} gap-3`}
            >
              {isAssistant && (m.reasoning || (isLoading && idx === messages.length - 1)) && (
                <ThinkingBubble 
                  text={m.reasoning || ""} 
                  animate={isLoading && idx === messages.length - 1} 
                />
              )}
            {isAssistant && m.toolCalls && m.toolCalls.length > 0 && (
              <div className="max-w-[95%] sm:max-w-[85%] md:max-w-[75%] lg:max-w-[60%] xl:max-w-[50%] 2xl:max-w-[45%] w-full flex flex-col space-y-2">
                {m.toolCalls.map((tc) => {
                  const statusConfig = (() => {
                    switch (tc.status) {
                      case "success":
                        return {
                          icon: "✅",
                          label: "Success",
                          card: "border-emerald-200/70 shadow-[0_10px_30px_-22px_rgba(16,185,129,0.8)] dark:border-emerald-900/40",
                          badge: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/40",
                          spinner: "border-emerald-400/70",
                        };
                      case "error":
                        return {
                          icon: "❌",
                          label: "Failed",
                          card: "border-rose-200/70 shadow-[0_10px_30px_-22px_rgba(244,63,94,0.65)] dark:border-rose-900/40",
                          badge: "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-900/40",
                          spinner: "border-rose-400/70",
                        };
                      case "executing":
                        return {
                          icon: "⏳",
                          label: "Running",
                          card: "border-sky-200/70 shadow-[0_10px_30px_-22px_rgba(56,189,248,0.65)] dark:border-sky-900/40",
                          badge: "bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-900/40",
                          spinner: "border-sky-400/70",
                        };
                      default:
                        return {
                          icon: "ℹ️",
                          label: "Pending",
                          card: "border-foreground/10",
                          badge: "bg-foreground/10 text-foreground/70 border border-foreground/15",
                          spinner: "border-foreground/40",
                        };
                    }
                  })();

                  const parsedArgs = (() => {
                    try {
                      return JSON.parse(tc.arguments) as Record<string, unknown>;
                    } catch {
                      return {} as Record<string, unknown>;
                    }
                  })();

                  const queryParam =
                    typeof parsedArgs.query === "string" ? parsedArgs.query.trim() : "";
                  const limitParam =
                    typeof parsedArgs.limit === "number" ? parsedArgs.limit : undefined;
                  const queryDescription = queryParam
                    ? `query: "${queryParam}"`
                    : "query: all clients";
                  const paramsLine = limitParam
                    ? `${queryDescription} • limit: ${limitParam}`
                    : queryDescription;

                  const sanitizeData = (value: unknown): unknown => {
                    if (Array.isArray(value)) {
                      return value
                        .map((item) => sanitizeData(item))
                        .filter((item) => {
                          if (item === null || item === undefined) return false;
                          if (Array.isArray(item)) return item.length > 0;
                          if (typeof item === "object") {
                            return Object.keys(item as Record<string, unknown>).length > 0;
                          }
                          return true;
                        });
                    }
                    if (value && typeof value === "object") {
                      const sanitized: Record<string, unknown> = {};
                      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
                        const normalizedKey = key.toLowerCase();
                        const isIdLike =
                          normalizedKey === "id" ||
                          normalizedKey === "_id" ||
                          normalizedKey.endsWith("id") ||
                          normalizedKey.endsWith("_id") ||
                          normalizedKey.startsWith("id") ||
                          normalizedKey.includes("id_") ||
                          normalizedKey.includes("_id") ||
                          normalizedKey === "clientid" ||
                          normalizedKey === "transcriptid" ||
                          normalizedKey === "responseid" ||
                          normalizedKey === "ownerid" ||
                          normalizedKey === "_creationtime";
                        if (isIdLike) continue;
                        const sanitizedValue = sanitizeData(val);
                        if (
                          sanitizedValue === null ||
                          sanitizedValue === undefined ||
                          (Array.isArray(sanitizedValue) && sanitizedValue.length === 0) ||
                          (typeof sanitizedValue === "object" &&
                            !Array.isArray(sanitizedValue) &&
                            Object.keys(sanitizedValue as Record<string, unknown>).length === 0)
                        ) {
                          continue;
                        }
                        sanitized[key] = sanitizedValue;
                      }
                      return sanitized;
                    }
                    return value;
                  };

                  const hasDisplayableContent = (value: unknown): boolean => {
                    if (value === null || value === undefined) return false;
                    if (Array.isArray(value)) {
                      return value.some((item) => hasDisplayableContent(item));
                    }
                    if (typeof value === "object") {
                      return Object.keys(value as Record<string, unknown>).length > 0;
                    }
                    return true;
                  };

                  // Helper function to render data as a dynamic table
                  const renderDataTable = (data: unknown): React.ReactNode => {
                    // Handle arrays of objects - use DynamicDataTable with preview
                    if (Array.isArray(data) && data.length > 0) {
                      const firstItem = data[0];
                      if (typeof firstItem === "object" && firstItem !== null) {
                        return <DynamicDataTable data={data} maxRows={100} previewRows={3} showPreview={data.length > 3} />;
                      }
                    }

                    // Handle single object - convert to array for table
                    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                      const entries = Object.entries(data);
                      
                      // If it has nested arrays, render those as tables
                      for (const [key, value] of entries) {
                        if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
                          return (
                            <div className="mt-3 space-y-2">
                              <div className="text-xs font-medium">{key}:</div>
                              <DynamicDataTable data={value} maxRows={100} previewRows={3} showPreview={value.length > 3} />
                            </div>
                          );
                        }
                      }

                      // Simple key-value object - render as key-value pairs
                      if (entries.length > 0 && entries.every(([_, v]) => 
                        typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null || v === undefined
                      )) {
                        // Convert to array format for table
                        return <DynamicDataTable data={[data]} maxRows={1} showPreview={false} />;
                      }
                    }

                    return null;
                  };

                  const renderResult = () => {
                    if (tc.status !== "success" || !tc.result) return null;
                    const resultData =
                      typeof tc.result === "string"
                        ? (() => {
                            try {
                              return JSON.parse(tc.result as string);
                            } catch {
                              return tc.result;
                            }
                          })()
                        : tc.result;

                    // Handle client_lookup results - use table renderer with preview
                    if (
                      resultData &&
                      typeof resultData === "object" &&
                      "clients" in resultData &&
                      Array.isArray((resultData as any).clients)
                    ) {
                      const clients = (resultData as any).clients;
                      const tableRender = renderDataTable(clients);
                      if (tableRender) {
                        return (
                          <div className="mt-3">
                            <div className="text-xs font-medium mb-2">
                              Found {clients.length} {clients.length === 1 ? "client" : "clients"}
                            </div>
                            {tableRender}
                          </div>
                        );
                      }
                    }

                    // Handle batch linking results (link_unlinked_transcripts)
                    if (
                      resultData &&
                      typeof resultData === "object" &&
                      "matched" in resultData &&
                      "summary" in resultData
                    ) {
                      const summary = (resultData as any).summary as {
                        total: number;
                        matched: number;
                        unmatched: number;
                        executed: number;
                      };
                      const matched = (resultData as any).matched as Array<{
                        transcriptId: string;
                        transcriptTitle: string;
                        clientName: string | null;
                        matchReason: string;
                        confidence: "high" | "medium" | "low";
                      }>;
                      const unmatched = (resultData as any).unmatched as Array<{
                        transcriptId: string;
                        transcriptTitle: string;
                      }>;
                      const dryRun = (resultData as any).dryRun === true;
                      const executionResults = (resultData as any).executionResults as Array<{
                        transcriptId: string;
                        success: boolean;
                        error?: string;
                      }> | undefined;

                      return (
                        <div className="mt-3 space-y-3 rounded-md bg-foreground/5 px-3 py-3 text-foreground/90 dark:bg-white/5 dark:text-foreground/80 wrap-break-word">
                          <div className="space-y-1">
                            <div className="text-xs font-medium">
                              {dryRun ? "📋 Linking Plan" : "✅ Linking Results"}
                            </div>
                            <div className="text-xs opacity-80 wrap-break-word">
                              {summary.total} total • {summary.matched} matched • {summary.unmatched} unmatched
                              {!dryRun && ` • ${summary.executed} executed`}
                            </div>
                          </div>

                          {matched.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium opacity-70">
                                Matched ({matched.length}):
                              </div>
                              {matched.slice(0, 5).map((match, idx) => (
                                <div key={idx} className="text-xs opacity-80 pl-2 border-l-2 border-emerald-500/30 wrap-break-word">
                                  <div className="font-medium wrap-break-word">{match.transcriptTitle}</div>
                                  <div className="opacity-70 wrap-break-word">
                                    → {match.clientName || "Unknown client"} ({match.confidence})
                                  </div>
                                  {match.matchReason && (
                                    <div className="opacity-60 text-[10px] mt-0.5 wrap-break-word">
                                      {match.matchReason}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {matched.length > 5 && (
                                <div className="text-xs opacity-60">
                                  …and {matched.length - 5} more matches
                                </div>
                              )}
                            </div>
                          )}

                          {unmatched.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium opacity-70">
                                Unmatched ({unmatched.length}):
                              </div>
                              {unmatched.slice(0, 3).map((unmatch, idx) => (
                                <div key={idx} className="text-xs opacity-60 pl-2 wrap-break-word">
                                  • {unmatch.transcriptTitle}
                                </div>
                              ))}
                              {unmatched.length > 3 && (
                                <div className="text-xs opacity-50">
                                  …and {unmatched.length - 3} more
                                </div>
                              )}
                            </div>
                          )}

                          {executionResults && executionResults.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-foreground/10">
                              <div className="text-xs font-medium opacity-70">Execution:</div>
                              {executionResults.filter((r) => !r.success).length > 0 && (
                                <div className="text-xs text-rose-600 dark:text-rose-400">
                                  {executionResults.filter((r) => !r.success).length} failed
                                </div>
                              )}
                              {executionResults.filter((r) => r.success).length > 0 && (
                                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                                  {executionResults.filter((r) => r.success).length} succeeded
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Try to render as table first
                    const tableRender = renderDataTable(resultData);
                    if (tableRender) {
                      return tableRender;
                    }

                    // Fallback to JSON for complex structures
                    return (
                      <div className="mt-3">
                        <pre className="max-h-32 overflow-y-auto overflow-x-auto wrap-break-word rounded-md bg-foreground/5 px-3 py-2 text-[11px] leading-relaxed text-foreground/80 dark:bg-white/5 dark:text-foreground/75">
                          {JSON.stringify(resultData, null, 2)}
                        </pre>
                      </div>
                    );
                  };

                  return (
                    <div
                      key={tc.id}
                      className={`rounded-lg border px-4 py-3 text-xs shadow-sm transition-shadow bg-white text-foreground dark:bg-slate-950/40 dark:text-foreground/90 wrap-break-word ${statusConfig.card}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusConfig.badge}`}
                        >
                          <span>{statusConfig.icon}</span>
                          <span>{statusConfig.label}</span>
                        </span>
                        <span className="text-xs font-medium text-foreground/60 dark:text-foreground/50">
                          {tc.name}
                        </span>
                      </div>
                      <div className="rounded-md bg-foreground/5 px-2.5 py-1.5 font-mono text-[11px] text-foreground/70 dark:bg-white/5 dark:text-foreground/60 wrap-break-word overflow-x-auto">
                        {paramsLine}
                      </div>

                      {tc.status === "executing" && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-foreground/60">
                          <span
                            className={`h-3 w-3 animate-spin rounded-full border-2 border-solid border-t-transparent ${statusConfig.spinner}`}
                          />
                          <span>Running lookup…</span>
                        </div>
                      )}

                      {tc.status === "error" && tc.error && (
                        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/30 dark:text-rose-200">
                          {tc.error}
                        </div>
                      )}

                      {renderResult()}
                    </div>
                  );
                })}
              </div>
            )}
              {(!isAssistant || (m.content && m.content.trim() !== "")) && (
                <div
                  className={`max-w-[95%] sm:max-w-[85%] md:max-w-[75%] lg:max-w-[60%] xl:max-w-[50%] 2xl:max-w-[45%] w-fit inline-block rounded-xl px-4 py-3 text-sm leading-relaxed wrap-break-word shadow-sm ${
                    isAssistant
                      ? "bg-foreground/5 text-foreground border border-foreground/10"
                      : "bg-foreground text-background"
                  }`}
                >
                  {isAssistant ? (
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          code({ className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "");
                            const isInline = !match;
                            return isInline ? (
                              <code className="inline-code wrap-break-word" {...props}>
                                {children}
                              </code>
                            ) : (
                              <pre className="code-block overflow-x-auto wrap-break-word">
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </pre>
                            );
                          },
                          pre({ children }: any) {
                            return <>{children}</>;
                          },
                          p({ children }: any) {
                            return <p className="mb-2 last:mb-0">{children}</p>;
                          },
                          h1({ children }: any) {
                            return <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>;
                          },
                          h2({ children }: any) {
                            return <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>;
                          },
                          h3({ children }: any) {
                            return <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>;
                          },
                          ul({ children }: any) {
                            return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                          },
                          ol({ children }: any) {
                            return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                          },
                          li({ children }: any) {
                            return <li className="ml-2">{children}</li>;
                          },
                          a({ href, children }: any) {
                            return (
                              <a href={href} className="underline underline-offset-2 hover:opacity-80 break-all" target="_blank" rel="noopener noreferrer">
                                {children || href}
                              </a>
                            );
                          },
                          blockquote({ children }: any) {
                            return <blockquote className="border-l-4 border-foreground/30 pl-4 my-2 italic text-foreground/80">{children}</blockquote>;
                          },
                          hr() {
                            return <hr className="my-4 border-foreground/20" />;
                          },
                          strong({ children }: any) {
                            return <strong className="font-semibold">{children}</strong>;
                          },
                          em({ children }: any) {
                            return <em className="italic">{children}</em>;
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap wrap-break-word">{m.content}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (!messages.length || !messages[messages.length - 1]?.content) && (
          <div className="flex justify-start">
            <div className="max-w-[95%] sm:max-w-[85%] md:max-w-[75%] lg:max-w-[60%] xl:max-w-[50%] 2xl:max-w-[45%] w-fit inline-block rounded-xl px-4 py-3 text-sm bg-foreground/5 text-foreground/80 border border-foreground/10 shadow-sm">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="border-t border-foreground/10 bg-background">
        <div className="p-4 flex items-end gap-2">
          <textarea
            value={input}
            onChange={handleChange}
            placeholder={placeholder}
            rows={1}
            ref={inputRef}
            className="flex-1 resize-none rounded-lg border border-foreground/10 bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
            onKeyDown={handleKeyDown}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex h-10 items-center rounded-lg bg-foreground/80 px-4 text-sm font-medium text-background hover:opacity-90"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity disabled:opacity-50 hover:opacity-90"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
