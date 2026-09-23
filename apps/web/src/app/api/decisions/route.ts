import { NextResponse } from "next/server";
import { agentCore, serializeBigints, withExpiry } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every recommendation the agent has produced for the current vault contract.
export async function GET() {
  try {
    const { store } = await agentCore();
    return NextResponse.json(serializeBigints(await withExpiry(store.listDecisions())));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
