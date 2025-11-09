"use client";

import * as React from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
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
      const data = (await res.json()) as { reply: string; reasoning?: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, reasoning: data.reasoning }]);
    } catch (err) {
      const aborted = (err as any)?.name === "AbortError";
      if (aborted) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Stopped." },
        ]);
      } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I ran into an error reaching the AI provider. Please try again.",
        },
      ]);
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
        className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-4 bg-background"
      >
        {messages.map((m, idx) => {
          const isAssistant = m.role === "assistant";
          return (
            <div
              key={idx}
              className={`flex flex-col ${isAssistant ? "items-start" : "items-end"} gap-2`}
            >
              {isAssistant && m.reasoning && (
                <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-xs leading-relaxed bg-foreground/5 text-foreground/60 border border-foreground/10">
                  <div className="font-medium mb-1 text-foreground/70">Thinking:</div>
                  <div className="whitespace-pre-wrap">{m.reasoning}</div>
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  isAssistant
                    ? "bg-foreground/5 text-foreground"
                    : "bg-foreground text-background"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-foreground/5 text-foreground/80">
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
