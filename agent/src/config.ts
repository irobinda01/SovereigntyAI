import "dotenv/config";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See agent/.env.example.`);
  return v;
}

import type { NetworkName } from "./types";
export type { NetworkName };

export const config = {
  network: (process.env.NETWORK || "testnet") as NetworkName,
  stacksApiUrl: process.env.STACKS_API_URL || "https://api.testnet.hiro.so",
  port: Number(process.env.PORT || 4021),

  // Deployed SovereigntyAI protocol contracts. Left undefined until a real
  // Testnet deployment exists (see scripts/deploy-testnet.ts) — the agent
  // refuses to start against unset/placeholder addresses rather than
  // silently pointing at nothing.
  deployerAddress: process.env.DEPLOYER_ADDRESS || "",
  sbtcContract: process.env.SBTC_CONTRACT_ADDRESS || "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1",
  sbtcContractName: process.env.SBTC_CONTRACT_NAME || "sbtc-token",

  // The AI executor's own Testnet-only key. Loaded from env/secret
  // storage ONLY — never hardcoded, never logged, never sent to any
  // frontend response. See docs/security-model.md "Compromised executor key".
  executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY,

  // Public address of the AI executor. Enough to EVALUATE an intent as the
  // executor (a read-only call) - it never needs the private key. If unset it
  // is derived from EXECUTOR_PRIVATE_KEY when that is present.
  executorAddressOverride: process.env.EXECUTOR_ADDRESS,

  // How far in the future (in blocks) a submitted intent's deadline is set.
  intentDeadlineWindowBlocks: Number(process.env.INTENT_DEADLINE_WINDOW_BLOCKS || 20),

  // Optional. When set, used only to generate the human-readable
  // narrative for a recommendation (see analysis/llmNarrator.ts) — never
  // to decide the action, amount, or any enforceable field. Absent this
  // key, the agent still fully functions using the deterministic
  // rule-based text from analysis/decisionEngine.ts.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

// Maps stable, readable logical names (used throughout application code)
// to the actual currently-deployed on-chain contract name. When that
// changes again, only this table needs updating — not every call site.
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

export function contractId(logicalName: string): string {
  if (!config.deployerAddress) {
    throw new Error(
      "DEPLOYER_ADDRESS is not set. The protocol has not been deployed to this network yet, " +
        "or the agent has not been configured with its address. Refusing to proceed with a guess."
    );
  }
  const deployedName = DEPLOYED_CONTRACT_NAMES[logicalName] ?? logicalName;
  return `${config.deployerAddress}.${deployedName}`;
}

import { getAddressFromPrivateKey } from "@stacks/transactions";

/** The executor identity's public address, from EXECUTOR_ADDRESS or derived from the key. Null if neither is configured. */
export function executorAddress(): string | null {
  if (config.executorAddressOverride) return config.executorAddressOverride;
  if (config.executorPrivateKey) return getAddressFromPrivateKey(config.executorPrivateKey, config.network);
  return null;
}

export function requireExecutorKey(): string {
  return requireEnv("EXECUTOR_PRIVATE_KEY");
}
