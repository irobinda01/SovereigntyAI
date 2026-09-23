import { NextResponse } from "next/server";
import { ECOSYSTEM_PROTOCOLS, type EcosystemProtocol } from "@/lib/ecosystemProtocols";

// Live ecosystem data for the home page, served by the web app itself so it
// works without the AI agent. Per protocol it does two REAL checks:
//   - is the mainnet contract actually deployed (Hiro API, two hosts raced)
//   - current TVL (DefiLlama)
// Resilience rules:
//   - all protocols are checked in parallel, each with a hard timeout;
//   - results are cached for 5 minutes (protects the free public APIs);
//   - if a check fails because the network/API is unreachable (not because the
//     contract is truly missing), the LAST GOOD value for that protocol is kept
//     and flagged `stale`. It is never replaced by an invented figure, and a
//     protocol is never reported "not found" just because an API had a bad moment;
//   - a definitive 404 from Hiro is the only thing that yields exists:false.

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 6_000;
const FRESH_MS = 5 * 60_000;

interface Verification {
  exists: boolean;
  txId?: string;
  blockHeight?: number;
  checkedAt: string;
  /** Could not be checked right now and there is no earlier good reading. */
  unreachable?: boolean;
  /** An earlier successful reading, shown because the live check failed just now. */
  stale?: boolean;
}

interface Entry {
  verification: Verification | null;
  tvlUsd: number | null;
  verifiedAt: number;
  tvlAt: number;
}

const cache = new Map<string, Entry>();

async function timedFetch(url: string): Promise<Response> {
  return fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
}

/** Definitive answer only: a deployed contract, or a real 404. Anything else throws (=> unknown). */
async function verifyContract(contract: string): Promise<Verification> {
  const hosts = ["https://api.hiro.so", "https://api.mainnet.hiro.so"];
  const checkedAt = new Date().toISOString();
  return Promise.any(
    hosts.map(async (host) => {
      const res = await timedFetch(`${host}/extended/v1/contract/${contract}`);
      if (res.status === 404) return { exists: false, checkedAt } as Verification;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tx_id: string; block_height?: number };
      return { exists: true, txId: data.tx_id, blockHeight: data.block_height, checkedAt } as Verification;
    })
  );
}

async function fetchTvl(slug: string): Promise<number> {
  const res = await timedFetch(`https://api.llama.fi/tvl/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const n = Number(await res.text());
  if (!Number.isFinite(n) || n < 0) throw new Error("bad TVL");
  return n;
}

async function refresh(p: EcosystemProtocol): Promise<Entry> {
  const prev = cache.get(p.id);
  const [v, t] = await Promise.allSettled([verifyContract(p.mainnetContract), p.defiLlamaSlug ? fetchTvl(p.defiLlamaSlug) : Promise.resolve(null)]);
  const now = Date.now();
  const entry: Entry = {
    verification: v.status === "fulfilled" ? v.value : prev?.verification ?? null,
    tvlUsd: t.status === "fulfilled" ? t.value : prev?.tvlUsd ?? null,
    verifiedAt: v.status === "fulfilled" ? now : prev?.verifiedAt ?? 0,
    tvlAt: t.status === "fulfilled" ? now : prev?.tvlAt ?? 0,
  };
  cache.set(p.id, entry);
  return entry;
}

let inflight: Promise<unknown> | null = null;

export async function GET() {
  const now = Date.now();
  const needsRefresh = ECOSYSTEM_PROTOCOLS.some((p) => {
    const e = cache.get(p.id);
    return !e || now - Math.min(e.verifiedAt || 0, e.tvlAt || 0) > FRESH_MS;
  });

  if (needsRefresh) {
    inflight ??= Promise.all(ECOSYSTEM_PROTOCOLS.map(refresh)).finally(() => {
      inflight = null;
    });
    await inflight;
  }

  const results = ECOSYSTEM_PROTOCOLS.map((p) => {
    const e = cache.get(p.id);
    const fresh = e && e.verifiedAt > 0 && Date.now() - e.verifiedAt < FRESH_MS * 2;
    const verification: Verification = e?.verification
      ? { ...e.verification, stale: !fresh || undefined }
      : { exists: false, unreachable: true, checkedAt: new Date().toISOString() };
    return { ...p, verification, tvlUsd: e?.tvlUsd ?? null };
  });

  return NextResponse.json(results);
}
