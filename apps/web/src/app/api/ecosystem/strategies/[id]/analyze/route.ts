import { NextResponse } from "next/server";
import { agentCore } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI analysis of one real ecosystem protocol, grounded only in live-verified facts
// (agent/src/analysis/strategyAnalysis.ts). Read-only; never signs or broadcasts.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { analysis, protocols } = await agentCore();
    const protocol = protocols.getProtocol(id);
    if (!protocol) return NextResponse.json({ error: "Unknown protocol id" }, { status: 404 });
    return NextResponse.json(await analysis.analyzeProtocol(protocol));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
