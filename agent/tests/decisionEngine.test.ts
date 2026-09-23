import { describe, it, expect } from "vitest";
import { analyze, currentAllocation, proposedAllocation } from "../src/analysis/decisionEngine";
import { StrategySnapshot } from "../src/types";

import { baseCtx, baseVault } from "./fixtures";

const sbtcStrategy = (over: Partial<StrategySnapshot> = {}): StrategySnapshot => ({
  strategyId: 1,
  name: "approved-strategy",
  contract: "ST1.strat",
  asset: "SBTC",
  active: true,
  maxAllocationBps: 10000,
  ...over,
});

describe("decisionEngine.analyze", () => {
  it("HOLDs when the protocol is paused, regardless of everything else", () => {
    const rec = analyze(baseVault(), baseCtx({ protocolPaused: true, activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/paused/i);
  });

  it("HOLDs when the vault itself is paused", () => {
    const rec = analyze(baseVault({ paused: true }), baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/paused/i);
  });

  it("HOLDs for an asset the vault was not created to hold", () => {
    const rec = analyze(baseVault({ supportsAsset: false }), baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/not created to hold/i);
  });

  it("HOLDs when the vault holds none of the asset yet", () => {
    const rec = analyze(
      baseVault({ totalBalance: 0n, idleBalance: 0n, shareSupply: 0n }),
      baseCtx({ activeStrategies: [sbtcStrategy()] })
    );
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/holds no/i);
  });

  it("STILL RECOMMENDS with autonomous mode off - autonomy decides who submits, not whether the AI may recommend", () => {
    const vault = baseVault({ riskConfig: { ...baseVault().riskConfig, autonomousEnabled: false } });
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("REBALANCE");
  });

  it("HOLDs with high confidence when no strategy is active - never invents a yield opportunity", () => {
    const rec = analyze(baseVault(), baseCtx({ activeStrategies: [] }));
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/no.*strategy/i);
    expect(rec.confidence).toBe(1);
  });

  it("HOLDs when idle balance is zero", () => {
    const rec = analyze(
      baseVault({ idleBalance: 0n }),
      baseCtx({ activeStrategies: [sbtcStrategy()] })
    );
    expect(rec.decision).toBe("HOLD");
  });

  it("only considers strategies registered for the vault's own asset", () => {
    const rec = analyze(
      baseVault({ asset: "SBTC" }),
      baseCtx({ activeStrategies: [sbtcStrategy({ name: "stx-only", asset: "STX" })] })
    );
    expect(rec.decision).toBe("HOLD");
    expect(rec.reason).toMatch(/no.*strategy/i);
  });

  it("REBALANCEs a bounded amount that respects the vault's own exposure cap", () => {
    const rec = analyze(baseVault(), baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("REBALANCE");
    expect(rec.destStrategyId).toBe(1);
    const amount = BigInt(rec.amount!);
    expect(amount).toBeLessThanOrEqual(3_000_000n); // 30% of 10_000_000
    expect(amount).toBeGreaterThan(0n);
  });

  it("never proposes an amount exceeding the vault's configured max transaction size", () => {
    const vault = baseVault({
      riskConfig: { ...baseVault().riskConfig, maxExposureBps: 9000, maxTxAmount: 500_000n },
    });
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("REBALANCE");
    expect(BigInt(rec.amount!)).toBeLessThanOrEqual(500_000n);
  });

  it("respects the vault's OWN idle-liquidity floor, not just the protocol's", () => {
    // 60% min idle -> at most 40% of the pool may leave idle, even though the exposure cap allows 90%
    const vault = baseVault({
      riskConfig: { ...baseVault().riskConfig, maxExposureBps: 9000, minIdleBps: 6000 },
    });
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("REBALANCE");
    expect(BigInt(rec.amount!)).toBeLessThanOrEqual(4_000_000n);
  });

  it("rounds the idle reserve UP so the contract's floor-division never rejects the proposal (boundary case)", () => {
    // total 1_000_003, min idle 20%: reserve must be ceil(200000.6)=200001, not 200000
    const vault = baseVault({
      totalBalance: 1_000_003n,
      idleBalance: 1_000_003n,
      riskConfig: { ...baseVault().riskConfig, maxExposureBps: 9000, minIdleBps: 2000 },
    });
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    const amount = BigInt(rec.amount!);
    const idleAfter = vault.idleBalance - amount;
    // exactly the on-chain formula: floor(idleAfter * 10000 / total) >= minIdleBps
    expect((idleAfter * 10_000n) / vault.totalBalance).toBeGreaterThanOrEqual(2000n);
  });

  it("HOLDs when already at the exposure limit", () => {
    const vault = baseVault({ idleBalance: 7_000_000n, allocations: { 1: 3_000_000n } });
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("HOLD");
  });

  it("advises REDUCE_EXPOSURE (no executable intent) when a strategy already exceeds the owner's cap", () => {
    const vault = baseVault({ idleBalance: 5_000_000n, allocations: { 1: 5_000_000n } }); // 50% vs a 30% cap
    const rec = analyze(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.decision).toBe("REDUCE_EXPOSURE");
    expect(BigInt(rec.amount!)).toBe(2_000_000n); // the excess over 30%
    expect(rec.riskAssessment).toMatch(/advisory/i);
  });

  it("never claims a yield/APY figure that was not actually observed", () => {
    const rec = analyze(baseVault(), baseCtx({ activeStrategies: [sbtcStrategy()] }));
    expect(rec.expectedBenefit.toLowerCase()).not.toMatch(/\d+(\.\d+)?%\s*apy/);
  });

  it("REBALANCEs STX independently, with its own unit labels", () => {
    const vault = baseVault({ asset: "STX" });
    const ctx = baseCtx({
      activeStrategies: [sbtcStrategy({ strategyId: 2, name: "stx-strategy", asset: "STX" })],
    });
    const rec = analyze(vault, ctx);
    expect(rec.decision).toBe("REBALANCE");
    expect(rec.asset).toBe("STX");
    expect(rec.reason).toMatch(/STX/);
    expect(rec.reason).toMatch(/microSTX/);
  });
});

describe("allocation views (derived from real balances only)", () => {
  it("current allocation reports idle and per-strategy shares in bps of the pool", () => {
    const vault = baseVault({ idleBalance: 7_000_000n, allocations: { 1: 3_000_000n } });
    const view = currentAllocation(vault, baseCtx({ activeStrategies: [sbtcStrategy()] }))!;
    expect(view.idleBps).toBe(7000);
    expect(view.strategies).toEqual([{ strategyId: 1, name: "approved-strategy", bps: 3000, amount: "3000000" }]);
  });

  it("is null for an empty pool - no invented percentages", () => {
    const vault = baseVault({ totalBalance: 0n, idleBalance: 0n });
    expect(currentAllocation(vault, baseCtx())).toBeNull();
  });

  it("proposed allocation moves exactly the recommended amount from idle to the destination", () => {
    const vault = baseVault();
    const ctx = baseCtx({ activeStrategies: [sbtcStrategy()] });
    const rec = analyze(vault, ctx);
    const proposed = proposedAllocation(vault, ctx, rec)!;
    const moved = BigInt(rec.amount!);
    expect(BigInt(proposed.strategies[0].amount)).toBe(moved);
    expect(proposed.idleBps).toBe(Number(((vault.idleBalance - moved) * 10_000n) / vault.totalBalance));
  });

  it("proposed allocation is null for anything that is not a REBALANCE", () => {
    const vault = baseVault();
    const ctx = baseCtx();
    expect(proposedAllocation(vault, ctx, analyze(vault, ctx))).toBeNull();
  });
});
