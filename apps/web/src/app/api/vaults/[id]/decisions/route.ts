import { NextResponse } from "next/server";
import { agentCore, serializeBigints, withExpiry } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The agent's off-chain decision log for one vault (AI events, not chain state).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const vaultId = Number(id);
  if (!Number.isInteger(vaultId) || vaultId <= 0) return NextResponse.json({ error: "Invalid vault id." }, { status: 400 });
  try {
    const { store } = await agentCore();
    return NextResponse.json(serializeBigints(await withExpiry(store.listDecisions(vaultId))));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
