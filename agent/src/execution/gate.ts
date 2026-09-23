import { config } from "../config";
import { ExecutionEnvironment } from "../types";

/**
 * TESTNET EXECUTION GATE - service layer.
 *
 * Mirrors, and never replaces, the on-chain gate in risk-guard-v7 /
 * execution-engine-v7 / sovereignty-vault-v7. Strategy execution is only
 * ever attempted when BOTH this service is configured for mainnet AND the
 * chain itself reports strategy execution as enabled. Either one saying
 * "no" stops everything before any key is read or any transaction is built.
 *
 * Analysis, recommendation, intent generation and on-chain (read-only) risk
 * validation are NOT gated and keep working on testnet.
 */
export class ExecutionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionBlockedError";
  }
}

export const TESTNET_BLOCK_REASON =
  "SovereigntyAI is currently operating on Stacks Testnet using testnet assets. Autonomous strategy execution is disabled for the current testnet environment.";

export function executionBlockedReason(env: ExecutionEnvironment): string | null {
  if (config.network !== "mainnet") return TESTNET_BLOCK_REASON;
  if (env.network !== "MAINNET") return TESTNET_BLOCK_REASON;
  if (!env.strategyExecutionEnabled) {
    return "Strategy execution has not been armed by protocol governance on this network.";
  }
  return null;
}

export function assertExecutionAllowed(env: ExecutionEnvironment): void {
  const reason = executionBlockedReason(env);
  if (reason) throw new ExecutionBlockedError(reason);
}
