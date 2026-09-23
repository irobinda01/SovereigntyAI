import { AllocationView, ProtocolContext, Recommendation, VaultSnapshot } from "../types";
import { config } from "../config";
import { sanitizeForDisplay } from "../safety/untrustedData";

const ASSET_LABEL: Record<string, string> = { STX: "STX", SBTC: "sBTC" };
const ASSET_UNIT: Record<string, string> = { STX: "microSTX", SBTC: "sats" };

const BPS = 10_000n;

/**
 * The analysis layer. This is deliberately NOT a black box "trust the AI"
 * component - every branch below is traceable to real on-chain state
 * fetched moments earlier, and every numeric bound quoted in a
 * recommendation's reasoning is read from the vault's own configured
 * risk-guard limits, never invented.
 *
 * It does NOT depend on the vault's autonomous flag. Autonomy decides WHO
 * may submit an intent (the AI executor vs the owner); it never decides
 * whether the AI may analyse and recommend. Recommendations are always
 * available; execution is a separate, gated matter (see docs/ai-agent.md).
 *
 * Operates on exactly one asset pool per call (`vault.asset`, "STX" or
 * "SBTC") - the two are separate share classes and are analysed, validated
 * and (on mainnet) executed completely independently. Only a strategy
 * registered for that exact asset is ever considered.
 *
 * HONESTY CONSTRAINT: this MVP ships with zero verified, audited external
 * yield strategies on Stacks Testnet. There is therefore no real yield/APY
 * signal to compare strategies against. Rather than fabricate one, this
 * engine can only ever recommend:
 *   - HOLD, when there is nothing safe or useful to propose,
 *   - REBALANCE, a bounded, rule-based allocation of idle capital into the
 *     single protocol-approved strategy for this asset (when one exists),
 *     sized to respect the vault owner's own configured limits - not a
 *     claim about expected yield,
 *   - REDUCE_EXPOSURE (advisory), when a strategy already exceeds the
 *     owner's configured concentration cap,
 *   - INSUFFICIENT_DATA, whenever a fact this function needs could not be
 *     established from real state.
 */
export function analyze(vault: VaultSnapshot, ctx: ProtocolContext): Recommendation {
  const now = new Date().toISOString();
  const label = ASSET_LABEL[vault.asset];
  const unit = ASSET_UNIT[vault.asset];

  const base = {
    vaultId: vault.vaultId,
    asset: vault.asset,
    generatedAt: now,
  };
  const hold = (reason: string, confidence = 1, riskAssessment = "n/a"): Recommendation => ({
    ...base,
    decision: "HOLD",
    reason,
    expectedBenefit: "n/a",
    riskAssessment,
    confidence,
  });

  if (ctx.protocolPaused) {
    return hold(
      "Protocol is currently paused by governance. No new allocation is possible.",
      0,
      "n/a - new allocations are blocked at the protocol level regardless of any recommendation."
    );
  }

  if (!vault.supportsAsset) {
    return hold(`This vault was not created to hold ${label}, so there is nothing to analyse for it.`);
  }

  if (vault.paused) {
    return hold("This vault is paused by its owner. No new allocation is possible until it is unpaused.");
  }

  if (vault.totalBalance <= 0n) {
    return hold(`This vault holds no ${label} yet, so there is no capital to allocate.`);
  }

  const assetStrategies = ctx.activeStrategies.filter((s) => s.asset === vault.asset);
  if (assetStrategies.length === 0) {
    return hold(
      `No ${label} strategy is currently registered and active in strategy-registry on this network. There is nowhere approved to allocate idle ${label}, so all funds correctly remain idle.`
    );
  }

  // Exactly one strategy per asset is supported end-to-end in the MVP.
  // Pick the first active one for this asset; there is no ranking logic
  // to fabricate.
  const strategy = { ...assetStrategies[0], name: sanitizeForDisplay(assetStrategies[0].name) };
  const currentAllocation = vault.allocations[strategy.strategyId] ?? 0n;

  const maxExposureAmount = (vault.totalBalance * BigInt(vault.riskConfig.maxExposureBps)) / BPS;

  // Already above the owner's own concentration cap -> advisory only.
  if (currentAllocation > maxExposureAmount) {
    const excess = currentAllocation - maxExposureAmount;
    return {
      ...base,
      decision: "REDUCE_EXPOSURE",
      destStrategyId: strategy.strategyId,
      amount: excess.toString(),
      reason: `${strategy.name} currently holds more ${label} than your configured ${vault.riskConfig.maxExposureBps / 100}% per-strategy cap allows; ${excess} ${unit} exceeds it.`,
      expectedBenefit: "Brings the vault back inside the limits its owner configured.",
      riskAssessment:
        "Advisory only: unwinding a strategy position requires an owner-signed action that the protocol does not yet automate.",
      confidence: 1,
    };
  }

  if (vault.idleBalance <= 0n) {
    return hold(`Vault has no idle ${label} available to allocate.`);
  }

  const maxProtocolAmount = (vault.totalBalance * BigInt(strategy.maxAllocationBps)) / BPS;
  const roomUnderExposureCap = maxExposureAmount - currentAllocation;
  const roomUnderProtocolCap = maxProtocolAmount > currentAllocation ? maxProtocolAmount - currentAllocation : 0n;

  // The vault's own idle-liquidity floor. CEILING division, so the resulting
  // idle share (which the contract floors) can never land a hair below the
  // floor and get rejected on-chain.
  const minIdleBps = BigInt(vault.riskConfig.minIdleBps);
  const minLiquidityReserve = (vault.totalBalance * minIdleBps + BPS - 1n) / BPS;
  const idleAfterReserve = vault.idleBalance > minLiquidityReserve ? vault.idleBalance - minLiquidityReserve : 0n;

  let amount = idleAfterReserve;
  if (amount > roomUnderExposureCap) amount = roomUnderExposureCap;
  if (amount > roomUnderProtocolCap) amount = roomUnderProtocolCap;
  if (amount > vault.riskConfig.maxTxAmount) amount = vault.riskConfig.maxTxAmount;

  if (amount <= 0n) {
    return hold(
      `Vault is already at or near its configured limits for ${strategy.name} (${vault.riskConfig.maxExposureBps / 100}% per-strategy cap, ${vault.riskConfig.minIdleBps / 100}% minimum idle liquidity); no further ${label} allocation fits.`,
      1,
      "Existing allocation already respects configured limits; no action needed."
    );
  }

  return {
    ...base,
    decision: "REBALANCE",
    destStrategyId: strategy.strategyId,
    amount: amount.toString(),
    reason: `Idle ${label} detected (${vault.idleBalance} ${unit}) with an active, protocol-approved strategy ("${strategy.name}"). Proposing an allocation within your configured per-strategy cap (${vault.riskConfig.maxExposureBps / 100}%), minimum idle liquidity (${vault.riskConfig.minIdleBps / 100}%) and transaction-size limits.`,
    expectedBenefit:
      "No verified real-time yield signal is available for this strategy on this network (see docs/strategies.md) - this recommendation reflects capital deployment within configured bounds, not a yield forecast.",
    riskAssessment: `Resulting allocation stays within your ${vault.riskConfig.maxExposureBps / 100}% per-strategy cap, keeps at least ${vault.riskConfig.minIdleBps / 100}% idle, and stays within the protocol's ${strategy.maxAllocationBps / 100}% cap for this strategy; Clarity will independently re-verify every one of these numbers on-chain.`,
    confidence: 0.6,
    maxSlippageBps: vault.riskConfig.maxSlippageBps,
    deadline: ctx.blockHeight + config.intentDeadlineWindowBlocks,
  };
}

const bpsOf = (part: bigint, total: bigint): number => (total <= 0n ? 0 : Number((part * BPS) / total));

/** The pool's real current allocation, derived only from on-chain balances. */
export function currentAllocation(vault: VaultSnapshot, ctx: ProtocolContext): AllocationView | null {
  if (vault.totalBalance <= 0n) return null;
  return {
    idleBps: bpsOf(vault.idleBalance, vault.totalBalance),
    strategies: ctx.activeStrategies
      .filter((s) => s.asset === vault.asset)
      .map((s) => {
        const amount = vault.allocations[s.strategyId] ?? 0n;
        return {
          strategyId: s.strategyId,
          name: sanitizeForDisplay(s.name),
          bps: bpsOf(amount, vault.totalBalance),
          amount: amount.toString(),
        };
      }),
  };
}

/** What the allocation WOULD be if a REBALANCE recommendation were executed. Null for every other decision. */
export function proposedAllocation(
  vault: VaultSnapshot,
  ctx: ProtocolContext,
  rec: Recommendation
): AllocationView | null {
  if (rec.decision !== "REBALANCE" || !rec.amount || rec.destStrategyId === undefined) return null;
  const amount = BigInt(rec.amount);
  const idle = vault.idleBalance - amount;
  return {
    idleBps: bpsOf(idle, vault.totalBalance),
    strategies: ctx.activeStrategies
      .filter((s) => s.asset === vault.asset)
      .map((s) => {
        const next = (vault.allocations[s.strategyId] ?? 0n) + (s.strategyId === rec.destStrategyId ? amount : 0n);
        return {
          strategyId: s.strategyId,
          name: sanitizeForDisplay(s.name),
          bps: bpsOf(next, vault.totalBalance),
          amount: next.toString(),
        };
      }),
  };
}
