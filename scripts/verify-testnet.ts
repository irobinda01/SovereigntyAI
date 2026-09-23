#!/usr/bin/env node
/**
 * verify-testnet.ts
 *
 * Confirms every SovereigntyAI contract is actually deployed and live on
 * Stacks Testnet by querying the real Hiro Testnet API for each one. Run
 * this after `clarinet deployments apply --testnet` (see
 * docs/deployment.md). Reads deployer address from settings/Testnet.toml
 * or DEPLOYER_ADDRESS env var; never reads or needs a private key.
 *
 * Usage:
 *   DEPLOYER_ADDRESS=ST... npx tsx scripts/verify-testnet.ts
 */

const API_URL = process.env.STACKS_API_URL || "https://api.testnet.hiro.so";

const CONTRACTS = [
  "sip-010-trait-v4",
  "strategy-trait-v4",
  "sovereignty-protocol-admin-v4",
  "agent-registry-v4",
  "strategy-registry-v4",
  "risk-guard-v5",
  "sovereignty-vault-v5",
  "execution-engine-v5",
];

const SBTC_DEPENDENCY = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";

async function checkContract(contractId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/extended/v1/contract/${contractId}`);
  if (res.ok) {
    const data = (await res.json()) as { tx_id: string };
    console.log(`  OK    ${contractId}`);
    console.log(`        tx: ${data.tx_id}`);
    console.log(`        explorer: https://explorer.hiro.so/txid/${data.tx_id}?chain=testnet`);
    return true;
  }
  console.log(`  MISSING  ${contractId}  (HTTP ${res.status})`);
  return false;
}

async function main() {
  const deployer = process.env.DEPLOYER_ADDRESS;
  if (!deployer) {
    console.error(
      "Set DEPLOYER_ADDRESS to the Stacks Testnet address that deployed the protocol, e.g.\n" +
        "  DEPLOYER_ADDRESS=ST1ABC... npx tsx scripts/verify-testnet.ts"
    );
    process.exit(1);
  }

  console.log(`Verifying SovereigntyAI deployment on ${API_URL}\n`);
  console.log("Dependency (real sBTC testnet contract):");
  await checkContract(SBTC_DEPENDENCY);

  console.log("\nSovereigntyAI protocol contracts:");
  let allOk = true;
  for (const name of CONTRACTS) {
    const ok = await checkContract(`${deployer}.${name}`);
    allOk = allOk && ok;
  }

  console.log("\n" + (allOk ? "All contracts verified live on Testnet." : "One or more contracts are missing."));
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
