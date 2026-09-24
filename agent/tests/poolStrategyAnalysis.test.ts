import { describe, it, expect, vi, afterEach } from "vitest";
import { analyzePoolAgainstEcosystem } from "../src/analysis/poolStrategyAnalysis";
import { ECOSYSTEM_PROTOCOLS } from "../src/data/ecosystemProtocols";
import { baseCtx, baseVault } from "./fixtures";

// Network is stubbed so the test exercises the analysis logic only: which
// protocols qualify, how they rank, and how the vault's own limits size a
// hypothetical position. The live checks themselves are exercised in production.
function stubNetwork(opts: { missing?: string[]; down?: boolean; tvl?: Record<string, number> } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (opts.down) throw new Error("network unreachable");
      if (url.includes("/extended/v1/contract/")) {
        const missing = (opts.missing ?? []).some((m) => url.includes(m));
        return missing ? new Response("{}", { status: 404 }) : Response.json({ tx_id: "0xabc", block_height: 1 });
      }
      if (url.includes("api.llama.fi/tvl/")) {
        const slug = decodeURIComponent(url.split("/tvl/")[1]);
        return new Response(String(opts.tvl?.[slug] ?? 1_000_000));
      }
      if (url.includes("coingecko")) return Response.json({ blockstack: { usd: 0.5, usd_24h_change: 1 } });
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

const stxVault = (o = {}) => baseVault({ asset: "STX", idleBalance: 100_000_000n, totalBalance: 100_000_000n, ...o });

describe("analyzePoolAgainstEcosystem", () => {
  it("never executes anything and says so", async () => {
    stubNetwork();
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    expect(r.executed).toBe(false);
    expect(r.executionNote).toMatch(/nothing was executed/i);
  });

  it("only ranks protocols whose published description covers the pool's asset", async () => {
    stubNetwork();
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    const ranked = r.strategies.filter((s) => s.rank !== null).map((s) => s.protocolId);
    expect(ranked.sort()).toEqual(["alex", "arkadiko", "stackingdao", "zest"]);
    const granite = r.strategies.find((s) => s.protocolId === "granite")!;
    expect(granite.verdict).toBe("EXCLUDED");
    expect(granite.reasons.join(" ")).toMatch(/does not include STX/);
    // unknown asset support is excluded, never assumed
    expect(r.strategies.find((s) => s.protocolId === "velar")!.verdict).toBe("EXCLUDED");
  });

  it("ranks lower-risk categories first, then deeper TVL", async () => {
    stubNetwork({ tvl: { zest: 5_000_000, stackingdao: 90_000_000, alex: 900_000_000, arkadiko: 800_000_000 } });
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    const order = r.strategies.filter((s) => s.rank !== null).map((s) => s.protocolId);
    // tier 1 (Liquid Staking, Lending) by TVL, then tier 2 (AMM), then tier 3 (CDP), regardless of TVL
    expect(order).toEqual(["stackingdao", "zest", "alex", "arkadiko"]);
    expect(r.topPickId).toBe("stackingdao");
  });

  it("excludes a protocol whose contract is definitively missing, and one that cannot be checked", async () => {
    stubNetwork({ missing: ["amm-swap-pool-v1-1"] });
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    const alex = r.strategies.find((s) => s.protocolId === "alex")!;
    expect(alex.contractLive).toBe(false);
    expect(alex.verdict).toBe("EXCLUDED");

    vi.unstubAllGlobals();
    stubNetwork({ down: true });
    const down = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    expect(down.strategies.every((s) => s.contractLive === null)).toBe(true);
    expect(down.topPickId).toBeNull();
    expect(down.strategies.find((s) => s.protocolId === "alex")!.reasons.join(" ")).toMatch(/could not be verified/);
  });

  it("sizes a hypothetical position from the vault's own limits", async () => {
    stubNetwork();
    // 30% exposure cap, 5% min idle: cap binds (30 STX of 100)
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    expect(r.pool.maxDeployable).toBe("30000000");
    const top = r.strategies.find((s) => s.rank === 1)!;
    expect(top.hypotheticalAllocation?.bpsOfPool).toBe(3000);
    expect(top.hypotheticalAllocation?.shareOfProtocolTvlPct).not.toBeNull();

    // max tx size binds
    const small = await analyzePoolAgainstEcosystem(
      stxVault({ riskConfig: { ...stxVault().riskConfig, maxTxAmount: 1_000_000n } }),
      baseCtx(),
      "testnet"
    );
    expect(small.pool.maxDeployable).toBe("1000000");
  });

  it("sizes nothing and explains why for an empty, paused or protocol-paused pool", async () => {
    stubNetwork();
    const empty = await analyzePoolAgainstEcosystem(stxVault({ idleBalance: 0n, totalBalance: 0n }), baseCtx(), "testnet");
    expect(empty.pool.maxDeployable).toBe("0");
    expect(empty.blockers[0]).toMatch(/holds no STX/);
    expect(empty.strategies.every((s) => s.hypotheticalAllocation === null)).toBe(true);
    // still compares strategies even when nothing can be deployed
    expect(empty.topPickId).not.toBeNull();

    const paused = await analyzePoolAgainstEcosystem(stxVault({ paused: true }), baseCtx(), "testnet");
    expect(paused.blockers.join(" ")).toMatch(/paused by its owner/);
    const gov = await analyzePoolAgainstEcosystem(stxVault(), baseCtx({ protocolPaused: true }), "testnet");
    expect(gov.blockers.join(" ")).toMatch(/paused by governance/);
  });

  it("never asserts an APY/yield figure", async () => {
    stubNetwork();
    const r = await analyzePoolAgainstEcosystem(stxVault(), baseCtx(), "testnet");
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%\s*(apy|apr|yield)/i);
    expect(r.limitations.join(" ")).toMatch(/No APY/);
  });

  it("covers every protocol in the ecosystem list exactly once", async () => {
    stubNetwork();
    const r = await analyzePoolAgainstEcosystem(baseVault({ asset: "SBTC" }), baseCtx(), "testnet");
    expect(r.strategies.map((s) => s.protocolId).sort()).toEqual(ECOSYSTEM_PROTOCOLS.map((p) => p.id).sort());
    expect(r.strategies.filter((s) => s.rank !== null).map((s) => s.protocolId).sort()).toEqual(["alex", "granite", "zest"]);
  });
});
