import {
  Cl,
  makeContractCall,
  broadcastTransaction,
  PostConditionMode,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { config, contractId, requireExecutorKey } from "../config";
import { ExecutionIntent } from "../types";
import { getExecutionEnvironment } from "../data/protocolState";
import { assertExecutionAllowed } from "./gate";

export interface SubmitResult {
  txId: string;
  executorAddress: string;
}

/**
 * Signs and broadcasts submit-rebalance-intent to execution-engine.clar
 * using the AI executor's OWN Testnet-only key (never the user's key —
 * the agent never has and never requests a user's private key).
 *
 * This is the ONLY place in the codebase that signs a transaction with
 * the executor key. The key is read from env/secret storage at call
 * time and never logged or returned in any response.
 */
export async function submitRebalanceIntent(
  intent: ExecutionIntent,
  strategyContract: string
): Promise<SubmitResult> {
  // TESTNET EXECUTION GATE: checked BEFORE the executor key is even read.
  // Throws ExecutionBlockedError unless this service is on mainnet AND the
  // chain reports strategy execution as enabled.
  assertExecutionAllowed(await getExecutionEnvironment());

  const senderKey = requireExecutorKey();
  const executorAddress = getAddressFromPrivateKey(senderKey, config.network);
  const [strategyAddress, strategyName] = strategyContract.split(".");
  const [vaultAddress, vaultName] = contractId("execution-engine").split(".");

  const transaction = await makeContractCall({
    contractAddress: vaultAddress,
    contractName: vaultName,
    functionName: "submit-rebalance-intent",
    functionArgs: [
      Cl.uint(intent.vaultId),
      Cl.uint(intent.destStrategyId),
      Cl.stringAscii(intent.asset),
      Cl.uint(intent.amount),
      Cl.uint(intent.maxSlippageBps),
      Cl.uint(intent.nonce),
      Cl.uint(intent.deadline),
      Cl.contractPrincipal(strategyAddress, strategyName),
    ],
    senderKey,
    network: config.network,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });

  const result = await broadcastTransaction({ transaction, network: config.network });
  if ("error" in result && result.error) {
    throw new Error(`Broadcast rejected: ${result.error} ${("reason" in result && result.reason) || ""}`);
  }

  return { txId: result.txid, executorAddress };
}
