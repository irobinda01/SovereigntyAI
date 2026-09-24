import { agentCore } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Streams the assistant's reply as Server-Sent Events, produced by the agent's own
// chat handler (agent/src/chat/chatHandler.ts) running in-process. Read-only:
// it never signs or broadcasts anything.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { messages, vaultId, asset } = body ?? {};
  if (!Array.isArray(messages) || messages.some((m) => typeof m?.content !== "string")) {
    return Response.json({ error: "Body must include a `messages` array of {role, content}." }, { status: 400 });
  }
  const parsedAsset = asset === "STX" || asset === "SBTC" ? asset : null;
  const parsedVaultId = Number.isInteger(vaultId) ? Number(vaultId) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const sink = {
        writeHead: () => {},
        write: (chunk: string) => {
          if (!closed) controller.enqueue(encoder.encode(chunk));
        },
        end: () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        },
      };
      try {
        const { chat } = await agentCore();
        await chat.streamChat(sink, messages, parsedVaultId, parsedAsset);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sink.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      } finally {
        sink.end();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
