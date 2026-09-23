import { createHash } from "node:crypto";
import { ExecutionIntent, Recommendation, VaultSnapshot } from "../types";

export class InsufficientDataError extends Error {}

/**
 * Converts a REBALANCE recommendation into a structured execution intent
 * with a fresh nonce and deadline. This function performs no chain
 * writes — it only assembles the typed arguments execution-engine.clar
 * will independently re-validate. See docs/ai-agent.md "AI proposes,
 * Clarity disposes".
 */
export function buildIntent(recommendation: Recommendation, vault: VaultSnapshot): ExecutionIntent {
  if (recommendation.decision !== "REBALANCE") {
    throw new InsufficientDataError(`Cannot build an intent from a ${recommendation.decision} recommendation.`);
  }
  if (
    recommendation.destStrategyId === undefined ||
    !recommendation.amount ||
    recommendation.maxSlippageBps === undefined ||
    recommendation.deadline === undefined
  ) {
    throw new InsufficientDataError("Recommendation is missing required fields for a REBALANCE intent.");
  }

  const amount = BigInt(recommendation.amount);
  if (amount <= 0n) {
    throw new InsufficientDataError("Recommended amount must be positive.");
  }

  return {
    vaultId: vault.vaultId,
    action: "REBALANCE",
    asset: recommendation.asset,
    sourceStrategy: "idle",
    destStrategyId: recommendation.destStrategyId,
    amount,
    maxSlippageBps: recommendation.maxSlippageBps,
    maxExposureBps: vault.riskConfig.maxExposureBps,
    nonce: vault.riskConfig.lastUsedNonce + 1,
    deadline: recommendation.deadline,
  };
}

export function hashIntent(intent: ExecutionIntent): string {
  const canonical = JSON.stringify({
    vaultId: intent.vaultId,
    action: intent.action,
    asset: intent.asset,
    sourceStrategy: intent.sourceStrategy,
    destStrategyId: intent.destStrategyId,
    amount: intent.amount.toString(),
    maxSlippageBps: intent.maxSlippageBps,
    maxExposureBps: intent.maxExposureBps,
    nonce: intent.nonce,
    deadline: intent.deadline,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
