export type NetworkName = "testnet" | "mainnet";

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as NetworkName;
export const STACKS_API_URL = process.env.NEXT_PUBLIC_STACKS_API_URL || "https://api.testnet.hiro.so";
export const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS || "";
export const SBTC_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS || "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1";
export const SBTC_CONTRACT_NAME = process.env.NEXT_PUBLIC_SBTC_CONTRACT_NAME || "sbtc-token";
export const SBTC_CONTRACT_ID = `${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}` as `${string}.${string}`;
// The fungible-token asset name inside the sBTC contract (verified against the
// live contract interface: fungible_tokens = [sbtc-token, sbtc-token-locked]).
// Needed to express the sBTC transfer as a post-condition.
export const SBTC_ASSET_NAME = "sbtc-token";

export const EXPLORER_BASE = "https://explorer.hiro.so";

export function explorerTxUrl(txId: string): string {
  const id = txId.startsWith("0x") ? txId : `0x${txId}`;
  return `${EXPLORER_BASE}/txid/${id}?chain=${NETWORK}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}?chain=${NETWORK}`;
}

export function isProtocolConfigured(): boolean {
  return Boolean(DEPLOYER_ADDRESS);
}

// Maps stable, readable logical names (used throughout application code)
// to the actual currently-deployed on-chain contract name. Keep in sync
// with agent/src/config.ts's DEPLOYED_CONTRACT_NAMES.
const DEPLOYED_CONTRACT_NAMES: Record<string, string> = {
  "protocol-admin": "sovereignty-protocol-admin-v4",
  "agent-registry": "agent-registry-v4",
  "strategy-registry": "strategy-registry-v6",
  "risk-guard": "risk-guard-v7",
  "sovereignty-vault": "sovereignty-vault-v7",
  "receipt-token": "receipt-token-v7",
  "execution-engine": "execution-engine-v7",
  "sip-010-trait": "sip-010-trait-v4",
  "strategy-trait": "strategy-trait-v4",
};

export function contractId(logicalName: string): `${string}.${string}` {
  if (!DEPLOYER_ADDRESS) {
    throw new Error(
      "NEXT_PUBLIC_DEPLOYER_ADDRESS is not set. The protocol has not been deployed on this network yet — see docs/deployment.md."
    );
  }
  const deployedName = DEPLOYED_CONTRACT_NAMES[logicalName] ?? logicalName;
  return `${DEPLOYER_ADDRESS}.${deployedName}` as `${string}.${string}`;
}
