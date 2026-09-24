export interface EcosystemProtocol {
  id: string;
  name: string;
  category: string;
  website: string;
  description: string;
  plainSummary: string;
  howItWorks: string[];
  risks: string[];
  mainnetContract: string;
  verification: {
    exists: boolean;
    txId?: string;
    blockHeight?: number;
    checkedAt: string;
    /** The check could not run right now and there is no earlier reading. NOT the same as "not deployed". */
    unreachable?: boolean;
    /** An earlier successful reading, shown because the latest check failed. */
    stale?: boolean;
  };
  /** Real, live total-value-locked figure from DefiLlama; null if unavailable. */
  tvlUsd: number | null;
}

export interface ProtocolAnalysis {
  protocolId: string;
  verified: boolean;
  contractExists: boolean;
  deployTx: string | null;
  stxPriceUsd: number | null;
  stxPriceChange24h: number | null;
  tvlUsd: number | null;
  analysis: string;
  caveats: string;
  generatedAt: string;
}

export interface StxMarketData {
  usd: number;
  usd24hChange: number;
  fetchedAt: string;
  /** Which public source answered (coingecko, binance, kraken, ...). */
  source?: string;
  /** True when every source was unreachable and this is the last good reading. */
  stale?: boolean;
  ageSeconds?: number;
}

// Same-origin: served by this app's own /api routes, which run the agent's code in-process.
async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `AI agent returned HTTP ${res.status}`);
  return body as T;
}

/**
 * Live protocol list with real contract-liveness and TVL checks, served by this
 * app's own server route - it does NOT depend on the AI agent being up.
 */
export async function listEcosystemProtocols(): Promise<EcosystemProtocol[]> {
  const res = await fetch("/api/ecosystem", { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) throw new Error(body?.error || `Ecosystem data returned HTTP ${res.status}`);
  return body as EcosystemProtocol[];
}

/**
 * Live STX/USD from this app's own server route, which queries several public
 * exchanges in parallel. It does NOT depend on the AI agent being up.
 */
export async function getStxMarketData(): Promise<StxMarketData> {
  const res = await fetch("/api/stx-price", { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.usd !== "number") throw new Error(body?.error || `STX price returned HTTP ${res.status}`);
  return body as StxMarketData;
}

export function analyzeEcosystemProtocol(id: string) {
  return agentFetch<ProtocolAnalysis>(`/api/ecosystem/strategies/${id}/analyze`, { method: "POST" });
}
