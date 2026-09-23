// Structured types shared across the AI agent pipeline. Every field here
// is meant to be traceable back to a real on-chain read or an explicit
// "insufficient data" marker - nothing here is ever populated with a
// placeholder or invented number.

export type StrategyId = number;
export type Asset = "STX" | "SBTC";
export const ASSETS: Asset[] = ["STX", "SBTC"];

export type NetworkName = "testnet" | "mainnet";

export interface StrategySnapshot {
  strategyId: StrategyId;
  name: string;
  contract: string;
  asset: Asset;
  active: boolean;
  maxAllocationBps: number;
}

export interface AssetRiskConfig {
  maxExposureBps: number; // per-strategy concentration cap
  maxTxAmount: bigint; // in this asset's own smallest unit (microSTX or sats)
  maxSlippageBps: number;
  minIdleBps: number; // aggregate idle-liquidity floor
  autonomousEnabled: boolean;
  cooldownBlocks: number;
  lastUsedNonce: number;
  lastExecutionHeight: number;
}

export interface VaultSnapshot {
  vaultId: number;
  owner: string;
  name: string;
  purpose: number;
  supportsAsset: boolean;
  paused: boolean;
  asset: Asset;
  idleBalance: bigint;
  totalBalance: bigint; // the pool's NAV for this asset (idle + allocated)
  shareSupply: bigint; // receipt shares outstanding for this (vault, asset) class
  allocations: Record<StrategyId, bigint>;
  // Exposure/slippage/cooldown/min-idle/autonomous-mode are shared vault-wide
  // across both assets on-chain (see risk-guard-v7.clar); maxTxAmount is the
  // one field that's genuinely asset-specific, already resolved to the right
  // value for `asset` above.
  riskConfig: AssetRiskConfig;
}

export interface ExecutionEnvironment {
  network: "TESTNET" | "MAINNET";
  strategyExecutionEnabled: boolean; // as reported by risk-guard-v7 on-chain
}

export interface ProtocolContext {
  blockHeight: number;
  protocolPaused: boolean;
  approvedSbtcAsset: string | null;
  activeStrategies: StrategySnapshot[];
  environment: ExecutionEnvironment;
}

export type RecommendationDecision = "REBALANCE" | "REDUCE_EXPOSURE" | "HOLD" | "INSUFFICIENT_DATA";

/** Allocation of one asset pool, in basis points of the pool's total. Derived from real on-chain balances only. */
export interface AllocationView {
  idleBps: number;
  strategies: Array<{ strategyId: StrategyId; name: string; bps: number; amount: string }>;
}

export interface Recommendation {
  decision: RecommendationDecision;
  vaultId: number;
  asset: Asset;
  destStrategyId?: StrategyId;
  amount?: string; // in `asset`'s smallest unit, as a decimal string to avoid float precision issues
  reason: string;
  expectedBenefit: string;
  riskAssessment: string;
  confidence: number; // informational only - NEVER used to bypass on-chain checks
  maxSlippageBps?: number;
  deadline?: number;
  generatedAt: string;
}

export interface ExecutionIntent {
  vaultId: number;
  action: "REBALANCE";
  asset: Asset;
  sourceStrategy: "idle";
  destStrategyId: StrategyId;
  amount: bigint;
  maxSlippageBps: number;
  maxExposureBps: number;
  nonce: number;
  deadline: number;
}

// Lifecycle of a recommendation / intent. The distinction is deliberate and
// must never be blurred in the UI:
//   RECOMMENDED     - the AI proposed something; nothing has been checked yet
//   VALIDATING      - being evaluated against the vault's on-chain risk rules
//   VALIDATED       - Clarity's read-only evaluation accepted the intent
//   TESTNET_BLOCKED - validated, but strategy execution is disabled on Testnet
//   EXECUTED        - a real transaction was confirmed on-chain
//   FAILED          - a submitted transaction failed on-chain
//   EXPIRED         - the intent's deadline passed before execution
//   REJECTED        - the vault's rules (or missing data) rejected it
export type IntentStatus =
  | "RECOMMENDED"
  | "VALIDATING"
  | "VALIDATED"
  | "TESTNET_BLOCKED"
  | "EXECUTED"
  | "FAILED"
  | "EXPIRED"
  | "REJECTED";

export interface OnChainValidation {
  /** Where the verdict came from. Always the deployed execution-engine's read-only evaluation. */
  source: "execution-engine.evaluate-rebalance-intent";
  status: "PASSED" | "FAILED" | "UNAVAILABLE";
  errorCode?: number;
  detail: string;
  evaluatedAs: "owner" | "executor";
  evaluatedAtBlock: number;
  strategyExecutionEnabled?: boolean;
}

export type ExecutionState =
  | "NOT_APPLICABLE" // HOLD / advisory: nothing to execute
  | "NOT_EXECUTED_TESTNET" // blocked by the testnet execution gate - no transaction was submitted
  | "NOT_SUBMITTED" // not executed for a non-testnet reason (rejected / not validated)
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED";

export interface DecisionRecord {
  id: string;
  timestamp: string;
  vaultId: number;
  /** The vault contract this record refers to - vault ids restart on every deployment, so records are scoped by contract. */
  vaultContract: string;
  network: NetworkName;
  asset: Asset;
  recommendation: Recommendation;
  currentAllocation: AllocationView | null;
  proposedAllocation: AllocationView | null;
  intent: ExecutionIntent | null;
  intentHash: string | null;
  validation: OnChainValidation | null;
  status: IntentStatus;
  execution: { state: ExecutionState; txId: string | null };
  rejectionReason: string | null;
}
