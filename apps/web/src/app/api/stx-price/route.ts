import { NextResponse } from "next/server";

// Live STX/USD, resilient by construction:
//   - several independent public exchanges/aggregators are queried IN PARALLEL
//     and the first valid answer wins, so one provider being slow, blocked or
//     rate-limited (CoinGecko returns HTTP 429 often) never breaks the price;
//   - the result is cached briefly so page traffic can't trip rate limits;
//   - if EVERY provider fails, the last good value is served, clearly flagged
//     `stale` with its age - a real, older reading, never an invented number;
//   - only if there has never been a good reading does the route return 503.
// It runs on the web server, so it needs neither the AI agent nor CORS.

export const dynamic = "force-dynamic";

interface Quote {
  usd: number;
  usd24hChange: number;
  source: string;
}

const TIMEOUT_MS = 5_000;
const FRESH_MS = 20_000; // serve from cache without refetching
const STALE_MAX_MS = 60 * 60_000; // beyond this a cached value is too old to show

let cache: { quote: Quote; at: number } | null = null;
let inflight: Promise<Quote> | null = null;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const pct = (last: number, open: number) => (open > 0 ? ((last - open) / open) * 100 : NaN);

const PROVIDERS: Array<{ name: string; fetch: () => Promise<Omit<Quote, "source">> }> = [
  {
    name: "coingecko",
    fetch: async () => {
      const j = await getJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd&include_24hr_change=true");
      return { usd: Number(j.blockstack.usd), usd24hChange: Number(j.blockstack.usd_24h_change) };
    },
  },
  {
    name: "binance",
    fetch: async () => {
      const j = await getJson("https://api.binance.com/api/v3/ticker/24hr?symbol=STXUSDT");
      return { usd: Number(j.lastPrice), usd24hChange: Number(j.priceChangePercent) };
    },
  },
  {
    name: "kraken",
    fetch: async () => {
      const j = await getJson("https://api.kraken.com/0/public/Ticker?pair=STXUSD");
      const t = Object.values<any>(j.result)[0];
      const last = Number(t.c[0]);
      return { usd: last, usd24hChange: pct(last, Number(t.o)) };
    },
  },
  {
    name: "coinbase",
    fetch: async () => {
      const j = await getJson("https://api.exchange.coinbase.com/products/STX-USD/stats");
      const last = Number(j.last);
      return { usd: last, usd24hChange: pct(last, Number(j.open)) };
    },
  },
  {
    name: "gate",
    fetch: async () => {
      const j = await getJson("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=STX_USDT");
      return { usd: Number(j[0].last), usd24hChange: Number(j[0].change_percentage) };
    },
  },
  {
    name: "bybit",
    fetch: async () => {
      const j = await getJson("https://api.bybit.com/v5/market/tickers?category=spot&symbol=STXUSDT");
      const t = j.result.list[0];
      return { usd: Number(t.lastPrice), usd24hChange: Number(t.price24hPcnt) * 100 };
    },
  },
  {
    name: "mexc",
    fetch: async () => {
      const j = await getJson("https://api.mexc.com/api/v3/ticker/24hr?symbol=STXUSDT");
      return { usd: Number(j.lastPrice), usd24hChange: Number(j.priceChangePercent) * 100 };
    },
  },
];

const valid = (q: Omit<Quote, "source">) => Number.isFinite(q.usd) && q.usd > 0 && q.usd < 1_000 && Number.isFinite(q.usd24hChange) && Math.abs(q.usd24hChange) < 100;

/** First provider to return a sane quote wins; the rest are abandoned. */
async function fetchFresh(): Promise<Quote> {
  return Promise.any(
    PROVIDERS.map(async (p) => {
      const q = await p.fetch();
      if (!valid(q)) throw new Error(`${p.name}: implausible quote`);
      return { ...q, source: p.name };
    })
  );
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.at < FRESH_MS) {
    return NextResponse.json(body(cache, now, false));
  }

  try {
    inflight ??= fetchFresh().finally(() => {
      inflight = null;
    });
    const quote = await inflight;
    cache = { quote, at: Date.now() };
    return NextResponse.json(body(cache, Date.now(), false));
  } catch {
    if (cache && now - cache.at < STALE_MAX_MS) {
      return NextResponse.json(body(cache, now, true));
    }
    return NextResponse.json({ error: "No price source is reachable right now." }, { status: 503 });
  }
}

function body(c: { quote: Quote; at: number }, now: number, stale: boolean) {
  return {
    usd: c.quote.usd,
    usd24hChange: c.quote.usd24hChange,
    source: c.quote.source,
    fetchedAt: new Date(c.at).toISOString(),
    ageSeconds: Math.round((now - c.at) / 1000),
    stale,
  };
}
