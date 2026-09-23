import { NextResponse } from "next/server";
import { agentCore, serializeBigints } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recommendation + intent + on-chain (read-only) risk validation + environment
// gate, for one asset pool of one vault. NEVER signs or broadcasts anything.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const vaultId = Number(id);
  const raw = (new URL(req.url).searchParams.get("asset") ?? "").toUpperCase();
  if (!Number.isInteger(vaultId) || vaultId <= 0) return NextResponse.json({ error: "Invalid vault id." }, { status: 400 });
  if (raw !== "STX" && raw !== "SBTC") return NextResponse.json({ error: 'Query param "asset" must be "STX" or "SBTC".' }, { status: 400 });

  try {
    const { pipeline } = await agentCore();
    const { recommendation, record } = await pipeline.runRecommendation(vaultId, raw);
    return NextResponse.json(serializeBigints({ recommendation, recordId: record.id, record }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: message.includes("not found on-chain") ? 404 : 502 });
  }
}
