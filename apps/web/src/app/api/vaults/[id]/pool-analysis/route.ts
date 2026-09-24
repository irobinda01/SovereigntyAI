import { NextResponse } from "next/server";
import { agentCore } from "@/lib/server/agentCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Compares one asset pool of one vault against the real Mainnet ecosystem protocols
// (live contract checks + live TVL) and the vault's own on-chain limits. ANALYSIS ONLY:
// it builds no intent, writes no decision record, and never signs or broadcasts.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const vaultId = Number(id);
  const raw = (new URL(req.url).searchParams.get("asset") ?? "").toUpperCase();
  if (!Number.isInteger(vaultId) || vaultId <= 0) return NextResponse.json({ error: "Invalid vault id." }, { status: 400 });
  if (raw !== "STX" && raw !== "SBTC") return NextResponse.json({ error: 'Query param "asset" must be "STX" or "SBTC".' }, { status: 400 });

  try {
    const { poolAnalysis, state } = await agentCore();
    const chain = await state.getProtocolContext();
    const vault = await state.getVaultSnapshot(vaultId, raw, chain);
    if (!vault) return NextResponse.json({ error: `Vault ${vaultId} not found on-chain.` }, { status: 404 });
    const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
    const result = await poolAnalysis.analyzePoolAgainstEcosystem(vault, chain, network);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
