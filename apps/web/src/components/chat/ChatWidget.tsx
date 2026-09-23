"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { streamChat, ChatMessage } from "@/lib/chat";
import { Button } from "@/components/ui/Button";

interface DisplayMessage extends ChatMessage {
  id: string;
  pending?: boolean;
  error?: string;
}

const SUGGESTIONS = [
  "Can the AI move my funds without my permission?",
  "What happens if a rebalance exceeds my limits?",
  "What is Zest Protocol?",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const history: ChatMessage[] = [...messages.map(({ role, content }) => ({ role, content })), { role: "user", content: trimmed }];

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", pending: true }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(history, {
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta, pending: false } : m))
          );
        },
        onDone: () => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
        },
        onError: (message) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false, error: message } : m)));
        },
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/10 transition-transform duration-200 hover:scale-105",
          open && "rotate-90"
        )}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3C7.03 3 3 6.58 3 11c0 2.39 1.19 4.53 3.08 5.98-.1.98-.5 2.4-1.58 3.52 0 0 2.13-.22 3.9-1.42.93.28 1.94.42 3 .42.97 0 1.9-.13 2.75-.35"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="18" cy="15" r="4.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M18 13.3v1.7l1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div
        className={clsx(
          "fixed bottom-24 right-6 z-40 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/10 transition-all duration-200 ease-out",
          open ? "pointer-events-auto h-[520px] max-h-[70vh] translate-y-0 opacity-100" : "pointer-events-none h-0 translate-y-4 opacity-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-foreground">SovereigntyAI Assistant</div>
            <div className="text-xs text-muted">Real-time · informational only</div>
          </div>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div>
              <p className="text-xs text-muted">
                Ask about the protocol, a vault, risk limits, or any of the real ecosystem protocols on the
                home page. This chat is informational only — it can never move funds.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border-strong px-3 py-2 text-left text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-surface-raised text-foreground"
                )}
              >
                {m.content || (m.pending && <TypingDots />)}
                {m.error && <p className="mt-1 text-xs text-danger">{m.error}</p>}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the assistant..."
            disabled={streaming}
            className="flex-1 rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
          />
          <Button type="submit" size="sm" disabled={streaming || !input.trim()}>
            {streaming ? "..." : "Send"}
          </Button>
        </form>
      </div>
    </>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-2"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
