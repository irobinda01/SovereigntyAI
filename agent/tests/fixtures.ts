import { ProtocolContext, VaultSnapshot } from "../src/types";

// These fixtures exercise the decision engine's LOGIC against hand-built
// input states. They are unit-test inputs only - nothing here is shown to a
// user; the running service always builds VaultSnapshot from live chain reads.

export function baseVault(overrides: Partial<VaultSnapshot> = {}): VaultSnapshot {
  return {
    vaultId: 1,
    owner: "ST1TEST",
    name: "Test Treasury",
    purpose: 2,
    supportsAsset: true,
    paused: false,
    asset: "SBTC",
    idleBalance: 10_000_000n,
    totalBalance: 10_000_000n,
    shareSupply: 10_000_000n,
    allocations: {},
    riskConfig: {
      maxExposureBps: 3000,
      maxTxAmount: 100_000_000n,
      maxSlippageBps: 50,
      minIdleBps: 500,
      autonomousEnabled: true,
      cooldownBlocks: 6,
      lastUsedNonce: 0,
      lastExecutionHeight: 0,
    },
    ...overrides,
  };
}

export function baseCtx(overrides: Partial<ProtocolContext> = {}): ProtocolContext {
  return {
    blockHeight: 1000,
    protocolPaused: false,
    approvedSbtcAsset: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
    activeStrategies: [],
    environment: { network: "TESTNET", strategyExecutionEnabled: false },
    ...overrides,
  };
}
