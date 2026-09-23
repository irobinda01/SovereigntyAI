import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DecisionRecord, OnChainValidation, ProtocolContext, VaultSnapshot } from "../src/types";

// Only the chain reads, the LLM and the on-disk store are replaced here. The
// logic under test - the analysis, intent construction, lifecycle statuses
// and the execution gate - is the real production code.

const state = vi.hoisted(() => ({
  ctx: null as unknown as ProtocolContext,
  vault: null as unknown as VaultSnapshot,
  validation: null as unknown as OnChainValidation,
  records: [] as DecisionRecord[],
  submitCalls: 0,
  evaluateCalls: [] as Array<{ sender: string; role: string }>,
}));

vi.mock("../src/data/protocolState", () => ({
  getProtocolContext: async () => state.ctx,
  getVaultSnapshot: async () => state.vault,
  getExecutionEnvironment: async () => state.ctx.environment,
  isAuthorizedExecutor: async () => true,
  evaluateIntentOnChain: async (_i: unknown, sender: string, role: string) => {
    state.evaluateCalls.push({ sender, role });
    return state.validation;
  },
}));

vi.mock("../src/analysis/llmNarrator", () => ({ narrateWithLLM: async (r: unknown) => r }));

vi.mock("../src/store", () => ({
  recordDecision: (r: Omit<DecisionRecord, "id" | "timestamp">) => {
    const full = { ...r, id: `rec-${state.records.length + 1}`, timestamp: "2026-01-01T00:00:00.000Z" } as DecisionRecord;
    state.records.unshift(full);
    return full;
  },
  updateDecision: (id: string, patch: Partial<DecisionRecord>) => {
    const i = state.records.findIndex((r) => r.id === id);
    if (i === -1) return undefined;
    state.records[i] = { ...state.records[i], ...patch };
    return state.records[i];
  },
}));

vi.mock("../src/execution/submitIntent", () => ({
  submitRebalanceIntent: async () => {
    state.submitCalls++;
    return { txId: "0xdeadbeef", executorAddress: "ST1EXEC" };
  },
}));

vi.mock("../src/monitoring/txMonitor", () => ({ waitForConfirmation: async () => ({ status: "confirmed" }) }));

import { runRecommendation, executeValidatedIntent } from "../src/pipeline";
import { config } from "../src/config";
import { baseCtx, baseVault } from "./fixtures";

const strategy = { strategyId: 1, name: "approved-strategy", contract: "ST1.strat", asset: "SBTC" as const, active: true, maxAllocationBps: 10000 };
const PASSED: OnChainValidation = {
  source: "execution-engine.evaluate-rebalance-intent",
  status: "PASSED",
  detail: "Every on-chain rule accepted this intent.",
  evaluatedAs: "owner",
  evaluatedAtBlock: 1000,
  strategyExecutionEnabled: false,
};

beforeEach(() => {
  state.records = [];
  state.submitCalls = 0;
  state.evaluateCalls = [];
  state.ctx = baseCtx({ activeStrategies: [strategy] });
  state.vault = baseVault();
  state.validation = PASSED;
  config.network = "testnet";
  config.executorPrivateKey = undefined;
});

describe("recommendation pipeline on Testnet", () => {
  it("HOLD: recorded as RECOMMENDED with nothing to execute and no on-chain evaluation", async () => {
    state.ctx = baseCtx({ activeStrategies: [] });
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.recommendation.decision).toBe("HOLD");
    expect(record.status).toBe("RECOMMENDED");
    expect(record.execution).toEqual({ state: "NOT_APPLICABLE", txId: null });
    expect(record.validation).toBeNull();
    expect(state.evaluateCalls).toHaveLength(0);
  });

  it("REBALANCE that passes on-chain validation ends TESTNET_BLOCKED - not executed, no tx id, allocation unchanged", async () => {
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.recommendation.decision).toBe("REBALANCE");
    expect(record.intent).not.toBeNull();
    expect(record.intent!.sourceStrategy).toBe("idle");
    expect(record.validation!.status).toBe("PASSED");
    expect(record.status).toBe("TESTNET_BLOCKED");
    expect(record.execution).toEqual({ state: "NOT_EXECUTED_TESTNET", txId: null });
    // the record carries the real current allocation and the proposed one side by side
    expect(record.currentAllocation!.idleBps).toBe(10000);
    expect(record.proposedAllocation!.idleBps).toBeLessThan(10000);
    // and the vault snapshot the AI read is unchanged (the pipeline never writes to chain)
    expect(state.vault.idleBalance).toBe(10_000_000n);
    expect(state.submitCalls).toBe(0);
  });

  it("an intent rejected by the on-chain rules is REJECTED with the contract's own error code - never 'passed'", async () => {
    state.validation = { ...PASSED, status: "FAILED", errorCode: 312, detail: "Rejected by on-chain rule (error u312)." };
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.status).toBe("REJECTED");
    expect(record.validation!.errorCode).toBe(312);
    expect(record.execution.state).toBe("NOT_SUBMITTED");
  });

  it("if on-chain evaluation is UNAVAILABLE the intent is NOT treated as validated", async () => {
    state.validation = { ...PASSED, status: "UNAVAILABLE", detail: "network down" };
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.status).toBe("RECOMMENDED");
    expect(record.validation!.status).toBe("UNAVAILABLE");
    expect(record.status).not.toBe("VALIDATED");
    expect(record.status).not.toBe("TESTNET_BLOCKED");
  });

  it("evaluates as the vault OWNER when autonomy is off, and as the AI executor when it is on and configured", async () => {
    state.vault = baseVault({ riskConfig: { ...baseVault().riskConfig, autonomousEnabled: false } });
    await runRecommendation(1, "SBTC");
    expect(state.evaluateCalls.at(-1)).toEqual({ sender: "ST1TEST", role: "owner" });

    state.vault = baseVault();
    // a valid testnet private key format (compressed, 66 hex) - only the address derivation is exercised
    config.executorPrivateKey = "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
    await runRecommendation(1, "SBTC");
    expect(state.evaluateCalls.at(-1)!.role).toBe("executor");
  });

  it("the intent carries the exact fields the spec defines (vault, action, source, destination, amount, limits, nonce, deadline)", async () => {
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.intent).toMatchObject({
      vaultId: 1,
      action: "REBALANCE",
      asset: "SBTC",
      sourceStrategy: "idle",
      destStrategyId: 1,
      maxSlippageBps: 50,
      maxExposureBps: 3000,
      nonce: 1,
      deadline: 1000 + config.intentDeadlineWindowBlocks,
    });
    expect(record.intent!.amount).toBeGreaterThan(0n);
  });
});

describe("execution gate (service layer)", () => {
  it("executeValidatedIntent on Testnet returns the TESTNET_BLOCKED record and NEVER submits, even for an autonomous vault with a configured executor key", async () => {
    config.executorPrivateKey = "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
    const record = await executeValidatedIntent(1, "SBTC");
    expect(record.status).toBe("TESTNET_BLOCKED");
    expect(record.execution).toEqual({ state: "NOT_EXECUTED_TESTNET", txId: null });
    expect(state.submitCalls).toBe(0);
  });

  it("a mainnet-configured service still refuses while the CHAIN says execution is disabled", async () => {
    config.network = "mainnet";
    state.ctx = baseCtx({
      activeStrategies: [strategy],
      environment: { network: "MAINNET", strategyExecutionEnabled: false },
    });
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.status).toBe("TESTNET_BLOCKED");
    expect(state.submitCalls).toBe(0);
  });

  it("a mainnet service whose chain has execution armed reaches VALIDATED (and only then may submit)", async () => {
    config.network = "mainnet";
    state.ctx = baseCtx({
      activeStrategies: [strategy],
      environment: { network: "MAINNET", strategyExecutionEnabled: true },
    });
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.status).toBe("VALIDATED");
    expect(record.execution.state).toBe("NOT_SUBMITTED");
  });

  it("a testnet-configured service refuses even if the chain (hypothetically) reports execution enabled", async () => {
    config.network = "testnet";
    state.ctx = baseCtx({
      activeStrategies: [strategy],
      environment: { network: "MAINNET", strategyExecutionEnabled: true },
    });
    const { record } = await runRecommendation(1, "SBTC");
    expect(record.status).toBe("TESTNET_BLOCKED");
  });
});

describe("submitRebalanceIntent hard gate", () => {
  it("throws ExecutionBlockedError on testnet BEFORE reading the executor key or building any transaction", async () => {
    vi.resetModules();
    vi.doUnmock("../src/execution/submitIntent");
    const { submitRebalanceIntent } = await import("../src/execution/submitIntent");
    const { ExecutionBlockedError } = await import("../src/execution/gate");
    const { config: cfg } = await import("../src/config");
    cfg.network = "testnet";
    delete process.env.EXECUTOR_PRIVATE_KEY; // if the key were read first this would throw a different error
    await expect(
      submitRebalanceIntent(
        {
          vaultId: 1, action: "REBALANCE", asset: "SBTC", sourceStrategy: "idle", destStrategyId: 1,
          amount: 1n, maxSlippageBps: 50, maxExposureBps: 3000, nonce: 1, deadline: 2000,
        },
        "ST1.strat"
      )
    ).rejects.toBeInstanceOf(ExecutionBlockedError);
  });
});
