import { Cl, ClarityValue, cvToJSON, fetchCallReadOnlyFunction } from "@stacks/transactions";
import { config } from "../config";

// Thin wrapper around the real Stacks (Hiro) Testnet API. Every function
// here either returns real on-chain data or throws — it never fabricates
// a fallback value. Callers that need graceful degradation must handle
// the thrown error explicitly and surface INSUFFICIENT_DATA, per the
// agent's safety policy (see docs/ai-agent.md).

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.stacksApiUrl}${path}`);
  if (!res.ok) {
    throw new Error(`Stacks API ${path} returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getBlockHeight(): Promise<number> {
  const info = await getChainInfo();
  return info.stacksTipHeight;
}

export async function getChainInfo(): Promise<{ stacksTipHeight: number; burnBlockHeight: number }> {
  const info = await apiGet<{ stacks_tip_height: number; burn_block_height: number }>(
    "/extended/v1/status"
  );
  return { stacksTipHeight: info.stacks_tip_height, burnBlockHeight: info.burn_block_height };
}

export async function getStxBalance(address: string): Promise<bigint> {
  const data = await apiGet<{ balance: string }>(`/extended/v1/address/${address}/stx`);
  return BigInt(data.balance);
}

export async function getSbtcBalance(address: string): Promise<bigint> {
  const result = await callReadOnly(
    config.sbtcContract,
    config.sbtcContractName,
    "get-balance",
    [Cl.principal(address)],
    address
  );
  const json = cvToJSON(result);
  if (json.success === false) throw new Error(`get-balance failed: ${JSON.stringify(json)}`);
  return BigInt(json.value.value);
}

export async function callReadOnly(
  contractAddress: string,
  contractName: string,
  functionName: string,
  functionArgs: ClarityValue[],
  senderAddress: string
): Promise<ClarityValue> {
  return fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderAddress,
    network: config.network,
  });
}

export async function getTxStatus(
  txId: string
): Promise<{ status: string; blockHeight?: number }> {
  const data = await apiGet<{ tx_status: string; block_height?: number }>(
    `/extended/v1/tx/${txId.replace(/^0x/, "0x")}`
  );
  return { status: data.tx_status, blockHeight: data.block_height };
}
