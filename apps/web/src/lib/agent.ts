import type { Asset } from "./onchain";

// Types mirror agent/src/types.ts. The agent is an OFF-CHAIN service: its
// records (recommendations, intents, validation verdicts, blocked executions)
// are AI events, not blockchain state, and the UI labels them as such.

export type IntentStatus =
  | "RECOMMENDED"
  | "VALIDATING"
  | "VALIDATED"
  | "TESTNET_BLOCKED"
  | "EXECUTED"
  | "FAILED"
  | "EXPIRED"
  | "REJECTED";

export interface Recommendation {
  decision: "REBALANCE" | "REDUCE_EXPOSURE" | "HOLD" | "INSUFFICIENT_DATA";
  vaultId: number;
  asset: Asset;
  destStrategyId?: number;
  amount?: string;
  reason: string;
  expectedBenefit: string;
  riskAssessment: string;
  confidence: number;
  maxSlippageBps?: number;
  deadline?: number;
  generatedAt: string;
}

export interface AllocationView {
  idleBps: number;
  strategies: Array<{ strategyId: number; name: string; bps: number; amount: string }>;
}

export interface ExecutionIntentView {
  vaultId: number;
  action: "REBALANCE";
  asset: Asset;
  sourceStrategy: "idle";
  destStrategyId: number;
  amount: string;
  maxSlippageBps: number;
  maxExposureBps: number;
  nonce: number;
  deadline: number;
}

export interface OnChainValidation {
  source: string;
  status: "PASSED" | "FAILED" | "UNAVAILABLE";
  errorCode?: number;
  detail: string;
  evaluatedAs: "owner" | "executor";
  evaluatedAtBlock: number;
  strategyExecutionEnabled?: boolean;
}

export type ExecutionState =
  | "NOT_APPLICABLE"
  | "NOT_EXECUTED_TESTNET"
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED";

export interface DecisionRecord {
  id: string;
  timestamp: string;
  vaultId: number;
  vaultContract: string;
  network: "testnet" | "mainnet";
  asset: Asset;
  recommendation: Recommendation;
  currentAllocation: AllocationView | null;
  proposedAllocation: AllocationView | null;
  intent: ExecutionIntentView | null;
  intentHash: string | null;
  validation: OnChainValidation | null;
  status: IntentStatus;
  execution: { state: ExecutionState; txId: string | null };
  rejectionReason: string | null;
  /** Read-time enrichment: has the intent's block-height deadline passed? null when unknown / no intent. */
  expired?: boolean | null;
}

// Same-origin: the web server runs the agent's pipeline itself (lib/server/agentCore.ts),
// so this works with no separate agent process. (Chat and the AI protocol analysis
// still use the standalone agent service.)
async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `AI agent returned HTTP ${res.status}`);
  }
  return body as T;
}

/** Generates a recommendation, builds an intent, validates it against the deployed contracts (read-only) and applies the environment gate. Never signs or broadcasts. */
export function getRecommendation(vaultId: number, asset: Asset) {
  return agentFetch<{ recommendation: Recommendation; recordId: string; record: DecisionRecord }>(
    `/api/vaults/${vaultId}/recommendation?asset=${asset}`,
    { method: "POST" }
  );
}

export function getVaultDecisions(vaultId: number) {
  return agentFetch<DecisionRecord[]>(`/api/vaults/${vaultId}/decisions`);
}

export function getAllDecisions() {
  return agentFetch<DecisionRecord[]>("/api/decisions");
}
