import { describe, it, expect } from "vitest";
import { buildIntent, hashIntent, InsufficientDataError } from "../src/intents/buildIntent";
import { Recommendation, VaultSnapshot } from "../src/types";

const vault: VaultSnapshot = {
  vaultId: 1,
  owner: "ST1TEST",
  asset: "SBTC",
  idleBalance: 10_000_000n,
  totalBalance: 10_000_000n,
  allocations: {},
  riskConfig: {
    maxExposureBps: 3000,
    maxTxAmount: 100_000_000n,
    maxSlippageBps: 50,
    autonomousEnabled: true,
    cooldownBlocks: 6,
    lastUsedNonce: 4,
    lastExecutionHeight: 100,
  },
};

describe("buildIntent", () => {
  it("throws InsufficientDataError for a non-REBALANCE recommendation", () => {
    const rec: Recommendation = {
      decision: "HOLD",
      vaultId: 1,
      asset: "SBTC",
      reason: "n/a",
      expectedBenefit: "n/a",
      riskAssessment: "n/a",
      confidence: 1,
      generatedAt: new Date().toISOString(),
    };
    expect(() => buildIntent(rec, vault)).toThrow(InsufficientDataError);
  });

  it("throws InsufficientDataError when required fields are missing", () => {
    const rec: Recommendation = {
      decision: "REBALANCE",
      vaultId: 1,
      asset: "SBTC",
      reason: "n/a",
      expectedBenefit: "n/a",
      riskAssessment: "n/a",
      confidence: 0.6,
      generatedAt: new Date().toISOString(),
      // amount/destStrategyId/maxSlippageBps/deadline intentionally omitted
    };
    expect(() => buildIntent(rec, vault)).toThrow(InsufficientDataError);
  });

  it("builds an intent with a nonce strictly greater than the vault's last used nonce, carrying the asset through", () => {
    const rec: Recommendation = {
      decision: "REBALANCE",
      vaultId: 1,
      asset: "SBTC",
      destStrategyId: 2,
      amount: "1000000",
      maxSlippageBps: 50,
      deadline: 500,
      reason: "n/a",
      expectedBenefit: "n/a",
      riskAssessment: "n/a",
      confidence: 0.6,
      generatedAt: new Date().toISOString(),
    };
    const intent = buildIntent(rec, vault);
    expect(intent.nonce).toBe(vault.riskConfig.lastUsedNonce + 1);
    expect(intent.amount).toBe(1_000_000n);
    expect(intent.destStrategyId).toBe(2);
    expect(intent.asset).toBe("SBTC");
  });

  it("hashIntent is deterministic for identical intents, and differs by asset", () => {
    const intent = {
      vaultId: 1,
      action: "REBALANCE" as const,
      asset: "SBTC" as const,
      destStrategyId: 1,
      amount: 100n,
      maxSlippageBps: 50,
      nonce: 1,
      deadline: 10,
    };
    expect(hashIntent(intent)).toBe(hashIntent({ ...intent }));
    expect(hashIntent(intent)).not.toBe(hashIntent({ ...intent, asset: "STX" }));
  });
});
