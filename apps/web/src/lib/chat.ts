export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamChatOptions {
  vaultId?: number;
  asset?: "STX" | "SBTC";
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Streams a chat response from the agent over Server-Sent Events using
 * a plain fetch + ReadableStream reader (native EventSource doesn't
 * support POST bodies, which we need to send the conversation history).
 */
export async function streamChat(messages: ChatMessage[], opts: StreamChatOptions): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, vaultId: opts.vaultId, asset: opts.asset }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    opts.onError(`AI agent returned HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      const lines = raw.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice("event: ".length).trim();
      let data: unknown;
      try {
        data = JSON.parse(dataLine.slice("data: ".length));
      } catch {
        continue;
      }
      if (event === "delta" && data && typeof (data as { text?: unknown }).text === "string") {
        opts.onDelta((data as { text: string }).text);
      } else if (event === "error") {
        opts.onError((data as { message?: string }).message || "AI agent error.");
      } else if (event === "note") {
        // informational only, e.g. "couldn't load live vault context" — not fatal
      } else if (event === "done") {
        opts.onDone();
      }
    }
  }
}
