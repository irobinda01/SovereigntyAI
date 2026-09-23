import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { narrateWithLLM } from "../src/analysis/llmNarrator";
import { config } from "../src/config";
import { ProtocolContext, Recommendation, VaultSnapshot } from "../src/types";

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
    lastUsedNonce: 0,
    lastExecutionHeight: 0,
  },
};

const ctx: ProtocolContext = {
  blockHeight: 1000,
  protocolPaused: false,
  approvedSbtcAsset: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
  activeStrategies: [],
};

const recommendation: Recommendation = {
  decision: "HOLD",
  vaultId: 1,
  asset: "SBTC",
  reason: "deterministic reason",
  expectedBenefit: "n/a",
  riskAssessment: "n/a",
  confidence: 1,
  generatedAt: new Date().toISOString(),
};

describe("narrateWithLLM", () => {
  const originalKey = config.anthropicApiKey;

  beforeEach(() => {
    (config as { anthropicApiKey?: string }).anthropicApiKey = undefined;
  });
  afterEach(() => {
    (config as { anthropicApiKey?: string }).anthropicApiKey = originalKey;
  });

  it("returns the recommendation unchanged when no API key is configured", async () => {
    const result = await narrateWithLLM(recommendation, vault, ctx);
    expect(result).toEqual(recommendation);
  });

  it("never changes enforceable fields even conceptually (same object identity for those fields)", async () => {
    const result = await narrateWithLLM(recommendation, vault, ctx);
    expect(result.decision).toBe(recommendation.decision);
    expect(result.destStrategyId).toBe(recommendation.destStrategyId);
    expect(result.amount).toBe(recommendation.amount);
    expect(result.maxSlippageBps).toBe(recommendation.maxSlippageBps);
    expect(result.deadline).toBe(recommendation.deadline);
    expect(result.confidence).toBe(recommendation.confidence);
  });
});
