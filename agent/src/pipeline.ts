import {
  evaluateIntentOnChain,
  getProtocolContext,
  getVaultSnapshot,
  isAuthorizedExecutor,
} from "./data/protocolState";
import { analyze, currentAllocation, proposedAllocation } from "./analysis/decisionEngine";
import { narrateWithLLM } from "./analysis/llmNarrator";
import { buildIntent, hashIntent, InsufficientDataError } from "./intents/buildIntent";
import { submitRebalanceIntent } from "./execution/submitIntent";
import { executionBlockedReason, ExecutionBlockedError } from "./execution/gate";
import { waitForConfirmation } from "./monitoring/txMonitor";
import { recordDecision, updateDecision } from "./store";
import { config, contractId, executorAddress } from "./config";
import { Asset, DecisionRecord, ExecutionIntent, OnChainValidation, Recommendation } from "./types";

/**
 * The recommendation pipeline. For one asset pool of one vault:
 *
 *   real on-chain state
 *     -> deterministic analysis (+ optional LLM narration of the text only)
 *     -> RECOMMENDED
 *     -> structured intent (nonce, deadline, amount, slippage, exposure)
 *     -> VALIDATING: the DEPLOYED contracts' read-only evaluation of every rule
 *     -> VALIDATED | REJECTED
 *     -> environment gate -> TESTNET_BLOCKED (testnet) | VALIDATED (armed mainnet)
 *
 * This function NEVER signs or broadcasts anything and never reads the
 * executor key. Whether funds may actually move is decided elsewhere
 * (executeValidatedIntent + the on-chain gate), and on Testnet the answer is
 * always no.
 */
export async function runRecommendation(
  vaultId: number,
  asset: Asset
): Promise<{ recommendation: Recommendation; record: DecisionRecord }> {
  const ctx = await getProtocolContext();
  const vault = await getVaultSnapshot(vaultId, asset, ctx);
  if (!vault) throw new Error(`Vault ${vaultId} not found on-chain.`);

  const deterministic = analyze(vault, ctx);
  const recommendation = await narrateWithLLM(deterministic, vault, ctx);

  const base = {
    vaultId,
    vaultContract: contractId("sovereignty-vault"),
    network: config.network,
    asset,
    recommendation,
    currentAllocation: currentAllocation(vault, ctx),
    proposedAllocation: proposedAllocation(vault, ctx, recommendation),
  };

  // Nothing actionable: HOLD / INSUFFICIENT_DATA / advisory REDUCE_EXPOSURE.
  if (recommendation.decision !== "REBALANCE") {
    const record = recordDecision({
      ...base,
      intent: null,
      intentHash: null,
      validation: null,
      status: "RECOMMENDED",
      execution: { state: "NOT_APPLICABLE", txId: null },
      rejectionReason: null,
    });
    return { recommendation, record };
  }

  let intent: ExecutionIntent;
  try {
    intent = buildIntent(recommendation, vault);
  } catch (err) {
    const reason = err instanceof InsufficientDataError ? err.message : String(err);
    const record = recordDecision({
      ...base,
      intent: null,
      intentHash: null,
      validation: null,
      status: "REJECTED",
      execution: { state: "NOT_SUBMITTED", txId: null },
      rejectionReason: reason,
    });
    return { recommendation, record };
  }

  const record = recordDecision({
    ...base,
    intent,
    intentHash: hashIntent(intent),
    validation: null,
    status: "VALIDATING",
    execution: { state: "NOT_SUBMITTED", txId: null },
    rejectionReason: null,
  });

  // Evaluate as the identity that WOULD submit: the AI executor for an
  // autonomous vault (when one is configured and registered), otherwise the owner.
  let sender = vault.owner;
  let role: "owner" | "executor" = "owner";
  const executor = vault.riskConfig.autonomousEnabled ? executorAddress() : null;
  if (executor && (await isAuthorizedExecutor(executor))) {
    sender = executor;
    role = "executor";
  }

  const validation: OnChainValidation = await evaluateIntentOnChain(intent, sender, role, ctx.blockHeight);

  if (validation.status === "FAILED") {
    const updated = updateDecision(record.id, {
      validation,
      status: "REJECTED",
      rejectionReason: validation.detail,
    });
    return { recommendation, record: updated ?? record };
  }

  if (validation.status === "UNAVAILABLE") {
    // Never treat "could not check" as "passed".
    const updated = updateDecision(record.id, {
      validation,
      status: "RECOMMENDED",
      rejectionReason: validation.detail,
    });
    return { recommendation, record: updated ?? record };
  }

  // PASSED on-chain. Now the environment gate.
  const blocked = executionBlockedReason(ctx.environment);
  const updated = updateDecision(record.id, {
    validation,
    status: blocked ? "TESTNET_BLOCKED" : "VALIDATED",
    execution: { state: blocked ? "NOT_EXECUTED_TESTNET" : "NOT_SUBMITTED", txId: null },
    rejectionReason: null,
  });
  return { recommendation, record: updated ?? record };
}

/**
 * Attempts to execute the current recommendation. On Testnet this ALWAYS
 * stops at the gate: it returns the TESTNET_BLOCKED record, never reads the
 * executor key, and submits nothing. Only an armed mainnet deployment whose
 * validated intent belongs to an autonomous vault can reach the signing code.
 */
export async function executeValidatedIntent(vaultId: number, asset: Asset): Promise<DecisionRecord> {
  const { record } = await runRecommendation(vaultId, asset);
  if (record.status !== "VALIDATED" || !record.intent) return record; // includes TESTNET_BLOCKED

  const ctx = await getProtocolContext();
  const vault = await getVaultSnapshot(vaultId, asset, ctx);
  if (!vault || !vault.riskConfig.autonomousEnabled) {
    return updateDecision(record.id, {
      status: "REJECTED",
      rejectionReason: "Autonomous mode is not enabled for this vault; the owner must submit this intent themselves.",
    }) ?? record;
  }
  if (!config.executorPrivateKey) {
    return updateDecision(record.id, {
      status: "REJECTED",
      rejectionReason: "EXECUTOR_PRIVATE_KEY is not configured on this agent instance.",
    }) ?? record;
  }
  const strategy = ctx.activeStrategies.find((s) => s.strategyId === record.intent!.destStrategyId && s.asset === asset);
  if (!strategy) {
    return updateDecision(record.id, { status: "REJECTED", rejectionReason: "Destination strategy is no longer active." }) ?? record;
  }

  try {
    const { txId } = await submitRebalanceIntent(record.intent, strategy.contract);
    const submitted = updateDecision(record.id, { execution: { state: "SUBMITTED", txId } }) ?? record;
    waitForConfirmation(txId).then((result) => {
      updateDecision(record.id, {
        status: result.status === "confirmed" ? "EXECUTED" : result.status === "failed" ? "FAILED" : "VALIDATED",
        execution: {
          state: result.status === "confirmed" ? "CONFIRMED" : result.status === "failed" ? "FAILED" : "SUBMITTED",
          txId,
        },
      });
    });
    return submitted;
  } catch (err) {
    if (err instanceof ExecutionBlockedError) {
      return updateDecision(record.id, {
        status: "TESTNET_BLOCKED",
        execution: { state: "NOT_EXECUTED_TESTNET", txId: null },
        rejectionReason: err.message,
      }) ?? record;
    }
    updateDecision(record.id, { status: "FAILED", rejectionReason: String(err) });
    throw err;
  }
}
