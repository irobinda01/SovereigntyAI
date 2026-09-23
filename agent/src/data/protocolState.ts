import { Cl, ClarityValue, cvToJSON } from "@stacks/transactions";
import { contractId } from "../config";
import { callReadOnly, getChainInfo } from "./stacksClient";
import {
  Asset,
  ExecutionEnvironment,
  ExecutionIntent,
  OnChainValidation,
  ProtocolContext,
  StrategySnapshot,
  VaultSnapshot,
} from "../types";

function splitContract(id: string): [string, string] {
  const [addr, name] = id.split(".");
  return [addr, name];
}

async function readOnly(contract: string, fn: string, args: ClarityValue[] = [], sender?: string) {
  const [addr, name] = splitContract(contract);
  const result = await callReadOnly(addr, name, fn, args, sender ?? addr);
  return cvToJSON(result);
}

export async function getProtocolContext(): Promise<ProtocolContext> {
  const chain = await getChainInfo();

  const pausedJson = await readOnly(contractId("protocol-admin"), "is-paused");
  const assetJson = await readOnly(contractId("risk-guard"), "get-approved-sbtc-asset");
  const envJson = await readOnly(contractId("risk-guard"), "get-execution-environment");
  const env = envJson.value;

  // MVP strategy discovery: strategy ids are sequential starting at 1.
  // We probe a small bounded range and stop at the first unregistered id.
  // This avoids needing a separate off-chain index for the MVP's expected
  // strategy count (documented limitation - see docs/ai-agent.md).
  const activeStrategies: StrategySnapshot[] = [];
  const MAX_STRATEGY_PROBE = 25;
  for (let id = 1; id <= MAX_STRATEGY_PROBE; id++) {
    const entryJson = await readOnly(contractId("strategy-registry"), "get-strategy", [Cl.uint(id)]);
    if (entryJson.value === null) break; // no more registered strategies
    const entry = entryJson.value.value;
    if (entry.active.value === true) {
      activeStrategies.push({
        strategyId: id,
        name: entry.name.value,
        contract: entry["strategy-contract"].value,
        asset: entry.asset.value as Asset,
        active: true,
        maxAllocationBps: Number(entry["max-allocation-bps"].value),
      });
    }
  }

  return {
    blockHeight: chain.stacksTipHeight,
    protocolPaused: pausedJson.value === true,
    approvedSbtcAsset: assetJson.value ? assetJson.value.value : null,
    activeStrategies,
    environment: {
      network: env.network.value === "MAINNET" ? "MAINNET" : "TESTNET",
      strategyExecutionEnabled: env["strategy-execution-enabled"].value === true,
    },
  };
}

export async function getExecutionEnvironment(): Promise<ExecutionEnvironment> {
  const envJson = await readOnly(contractId("risk-guard"), "get-execution-environment");
  const env = envJson.value;
  return {
    network: env.network.value === "MAINNET" ? "MAINNET" : "TESTNET",
    strategyExecutionEnabled: env["strategy-execution-enabled"].value === true,
  };
}

export async function getVaultSnapshot(
  vaultId: number,
  asset: Asset,
  ctx?: ProtocolContext
): Promise<VaultSnapshot | null> {
  const vaultJson = await readOnly(contractId("sovereignty-vault"), "get-vault", [Cl.uint(vaultId)]);
  if (vaultJson.value === null) return null;
  const v = vaultJson.value.value;

  const owner = v.owner.value as string;
  const assetCV = Cl.stringAscii(asset);
  const vaultContract = contractId("sovereignty-vault");
  const poolJson = await readOnly(vaultContract, "get-pool", [Cl.uint(vaultId), assetCV]);
  const supportsJson = await readOnly(vaultContract, "supports-asset", [Cl.uint(vaultId), assetCV]);
  const cfgJson = await readOnly(contractId("risk-guard"), "get-vault-config", [Cl.uint(vaultId)]);

  if (cfgJson.value === null) {
    throw new Error(`Vault ${vaultId} has no risk-guard config - inconsistent protocol state.`);
  }
  const cfg = cfgJson.value.value;
  const pool = poolJson.value;

  const context = ctx ?? (await getProtocolContext());
  const allocations: Record<number, bigint> = {};
  for (const s of context.activeStrategies.filter((s) => s.asset === asset)) {
    const allocJson = await readOnly(vaultContract, "get-strategy-allocation", [
      Cl.uint(vaultId),
      Cl.uint(s.strategyId),
      assetCV,
    ]);
    allocations[s.strategyId] = BigInt(allocJson.value);
  }

  const maxTxAmount = asset === "STX" ? cfg["max-stx-tx-amount"].value : cfg["max-sbtc-tx-amount"].value;

  return {
    vaultId,
    owner,
    name: v.name.value as string,
    purpose: Number(v.purpose.value),
    supportsAsset: supportsJson.value === true,
    paused: v.paused.value === true,
    asset,
    idleBalance: BigInt(pool.idle.value),
    totalBalance: BigInt(pool.total.value),
    shareSupply: BigInt(pool.supply.value),
    allocations,
    riskConfig: {
      maxExposureBps: Number(cfg["max-exposure-bps"].value),
      maxTxAmount: BigInt(maxTxAmount),
      maxSlippageBps: Number(cfg["max-slippage-bps"].value),
      minIdleBps: Number(cfg["min-idle-bps"].value),
      autonomousEnabled: cfg["autonomous-enabled"].value === true,
      cooldownBlocks: Number(cfg["cooldown-blocks"].value),
      lastUsedNonce: Number(cfg["last-used-nonce"].value),
      lastExecutionHeight: Number(cfg["last-execution-height"].value),
    },
  };
}

export async function isAuthorizedExecutor(address: string): Promise<boolean> {
  const json = await readOnly(contractId("agent-registry"), "is-authorized-executor", [Cl.principal(address)]);
  return json.value === true;
}

/**
 * Asks the DEPLOYED execution-engine to evaluate an intent against every
 * on-chain rule, via its read-only `evaluate-rebalance-intent`. This is a
 * genuine on-chain verdict - no transaction, no fee, no state change - and is
 * the only source of the "risk validation PASSED/FAILED" status. If the read
 * itself fails (network error), the result is UNAVAILABLE, never PASSED.
 *
 * `sender` is the identity that WOULD submit: the AI executor for an
 * autonomous vault, the vault owner for manual approval. Read-only calls run
 * with tx-sender = sender, so the contract applies the same authorization
 * rules it would to a real submission.
 */
export async function evaluateIntentOnChain(
  intent: ExecutionIntent,
  sender: string,
  senderRole: "owner" | "executor",
  blockHeight: number
): Promise<OnChainValidation> {
  try {
    const json = await readOnly(
      contractId("execution-engine"),
      "evaluate-rebalance-intent",
      [
        Cl.uint(intent.vaultId),
        Cl.uint(intent.destStrategyId),
        Cl.stringAscii(intent.asset),
        Cl.uint(intent.amount),
        Cl.uint(intent.maxSlippageBps),
        Cl.uint(intent.nonce),
        Cl.uint(intent.deadline),
      ],
      sender
    );
    if (json.success === true) {
      const t = json.value.value;
      return {
        source: "execution-engine.evaluate-rebalance-intent",
        status: "PASSED",
        detail: "Every on-chain rule accepted this intent.",
        evaluatedAs: senderRole,
        evaluatedAtBlock: blockHeight,
        strategyExecutionEnabled: t["strategy-execution-enabled"].value === true,
      };
    }
    const code = Number(json.value.value);
    return {
      source: "execution-engine.evaluate-rebalance-intent",
      status: "FAILED",
      errorCode: code,
      detail: `Rejected by on-chain rule (error u${code}).`,
      evaluatedAs: senderRole,
      evaluatedAtBlock: blockHeight,
    };
  } catch (err) {
    return {
      source: "execution-engine.evaluate-rebalance-intent",
      status: "UNAVAILABLE",
      detail: `On-chain evaluation could not be performed: ${err instanceof Error ? err.message : String(err)}`,
      evaluatedAs: senderRole,
      evaluatedAtBlock: blockHeight,
    };
  }
}
