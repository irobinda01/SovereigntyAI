import {
  broadcastTransaction,
  ClarityValue,
  cvToJSON,
  deserializeCV,
  fetchCallReadOnlyFunction,
  makeContractCall,
  PostConditionMode,
  type PostCondition,
} from "@stacks/transactions";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Shared helpers for the real-Testnet operator scripts (bootstrap + live
// acceptance). Everything here talks to the real Testnet API and signs with
// a real Testnet key loaded from a gitignored file - there is no simulation
// path. Keys are never logged.

export const ROOT = process.cwd();
export const API = process.env.STACKS_API_URL || "https://api.testnet.hiro.so";
export const NETWORK = "testnet" as const;

export const DEPLOYER = process.env.DEPLOYER_ADDRESS || "ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE";
export const NAMES = {
  vault: "sovereignty-vault-v7",
  receipts: "receipt-token-v7",
  risk: "risk-guard-v7",
  engine: "execution-engine-v7",
  admin: "sovereignty-protocol-admin-v4",
  agents: "agent-registry-v4",
  strategies: "strategy-registry-v6",
} as const;
export const SBTC = { address: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1", name: "sbtc-token" };
export const id = (n: string) => `${DEPLOYER}.${n}`;

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export async function deployerKey(): Promise<{ key: string; address: string }> {
  let mnemonic = readEnvFile(join(ROOT, ".env")).STACKS_MNEMONIC;
  if (!mnemonic) {
    const toml = existsSync(join(ROOT, "settings", "Testnet.toml")) ? readFileSync(join(ROOT, "settings", "Testnet.toml"), "utf8") : "";
    mnemonic = toml.match(/mnemonic\s*=\s*"([^"]+)"/)?.[1];
  }
  if (!mnemonic) throw new Error("No deployer mnemonic found in .env (STACKS_MNEMONIC) or settings/Testnet.toml");
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const account = wallet.accounts[0];
  return { key: account.stxPrivateKey, address: getStxAddress(account, "testnet") };
}

export function executorKey(): string | null {
  const env = readEnvFile(join(ROOT, "agent", ".env"));
  return env.EXECUTOR_PRIVATE_KEY || null;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function readOnly(contract: string, fn: string, args: ClarityValue[], sender = DEPLOYER) {
  const [addr, name] = contract.split(".");
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: addr,
    contractName: name,
    functionName: fn,
    functionArgs: args,
    senderAddress: sender,
    network: NETWORK,
  });
  return cvToJSON(cv);
}

export interface CallResult {
  txid: string;
  status: string;
  result: any;
  repr: string;
  blockHeight?: number;
}

/** Signs, broadcasts and WAITS for a real transaction. Post-conditions are explicit; mode is Deny unless told otherwise. */
export async function call(opts: {
  key: string;
  contract: string;
  fn: string;
  args: ClarityValue[];
  postConditions?: PostCondition[];
  mode?: "deny" | "allow";
}): Promise<CallResult> {
  const [contractAddress, contractName] = opts.contract.split(".");
  const tx = await makeContractCall({
    contractAddress,
    contractName,
    functionName: opts.fn,
    functionArgs: opts.args,
    senderKey: opts.key,
    network: NETWORK,
    postConditions: opts.postConditions ?? [],
    postConditionMode: opts.mode === "allow" ? PostConditionMode.Allow : PostConditionMode.Deny,
  });
  const res = await broadcastTransaction({ transaction: tx, network: NETWORK });
  if ("error" in res && res.error) throw new Error(`broadcast rejected: ${res.error} ${(res as any).reason ?? ""}`);
  const txid = res.txid.startsWith("0x") ? res.txid : `0x${res.txid}`;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    // The API answers 404 for a freshly-broadcast txid until it has indexed it: that means "not yet", not "failed".
    const res = await fetch(`${API}/extended/v1/tx/${txid}`);
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    if (!res.ok) throw new Error(`GET tx ${txid} -> HTTP ${res.status}`);
    const t: any = await res.json();
    if (t.tx_status === "pending") {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const result = t.tx_result?.hex ? cvToJSON(deserializeCV(t.tx_result.hex)) : null;
    return { txid, status: t.tx_status, result, repr: t.tx_result?.repr ?? "", blockHeight: t.block_height };
  }
  throw new Error(`timed out waiting for ${txid}`);
}

export const explorer = (txid: string) => `https://explorer.hiro.so/txid/${txid}?chain=testnet`;
