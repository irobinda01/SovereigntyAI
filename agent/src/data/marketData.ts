// Real, public market data — never fabricated. CoinGecko's public API
// needs no key for these endpoints. Used only to ground the ecosystem
// strategy analysis in a real, current STX price; never used to invent
// a protocol-specific TVL/APY figure (see analysis/strategyAnalysis.ts).

export interface StxMarketData {
  usd: number;
  usd24hChange: number;
  fetchedAt: string;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const pct = (last: number, open: number) => (open > 0 ? ((last - open) / open) * 100 : NaN);

// Several independent public sources, queried in parallel; the first sane
// answer wins. CoinGecko alone rate-limits (HTTP 429) too often to rely on.
const SOURCES: Array<() => Promise<{ usd: number; usd24hChange: number }>> = [
  async () => {
    const j = await getJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd&include_24hr_change=true");
    return { usd: Number(j.blockstack.usd), usd24hChange: Number(j.blockstack.usd_24h_change) };
  },
  async () => {
    const j = await getJson("https://api.binance.com/api/v3/ticker/24hr?symbol=STXUSDT");
    return { usd: Number(j.lastPrice), usd24hChange: Number(j.priceChangePercent) };
  },
  async () => {
    const j = await getJson("https://api.exchange.coinbase.com/products/STX-USD/stats");
    return { usd: Number(j.last), usd24hChange: pct(Number(j.last), Number(j.open)) };
  },
  async () => {
    const j = await getJson("https://api.kraken.com/0/public/Ticker?pair=STXUSD");
    const tk = Object.values<any>(j.result)[0];
    return { usd: Number(tk.c[0]), usd24hChange: pct(Number(tk.c[0]), Number(tk.o)) };
  },
];

export async function getStxPrice(): Promise<StxMarketData> {
  const q = await Promise.any(
    SOURCES.map(async (s) => {
      const r = await s();
      if (!(Number.isFinite(r.usd) && r.usd > 0 && Number.isFinite(r.usd24hChange))) throw new Error("implausible quote");
      return r;
    })
  ).catch(() => {
    throw new Error("No STX price source is reachable");
  });
  return { usd: q.usd, usd24hChange: q.usd24hChange, fetchedAt: new Date().toISOString() };
}

/**
 * Real, live total-value-locked figure for one protocol, from DefiLlama's
 * public API (no key required). Returns null (never a guess) if the slug
 * is unlisted or the request fails — callers must render an explicit
 * "unavailable" state rather than fabricate a number.
 */
export async function getProtocolTvl(defiLlamaSlug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.llama.fi/tvl/${encodeURIComponent(defiLlamaSlug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const usd = Number(text);
    return Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}
