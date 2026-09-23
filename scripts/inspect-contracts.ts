#!/usr/bin/env node
/**
 * inspect-contracts.ts
 *
 * Fetches a contract's real, currently-deployed interface and source from
 * a live Stacks API (Testnet by default) and prints it. This is the tool
 * used during development to VERIFY a claimed contract address/interface
 * actually exists on-chain before writing any integration against it
 * (see docs/testnet.md and the project rule: never hardcode an
 * unverified contract address).
 *
 * Usage:
 *   npx tsx scripts/inspect-contracts.ts <contract-id> [network]
 *
 * Examples:
 *   npx tsx scripts/inspect-contracts.ts SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token testnet
 *   npx tsx scripts/inspect-contracts.ts SP...some-contract mainnet
 */

const NETWORK_API: Record<string, string> = {
  testnet: "https://api.testnet.hiro.so",
  mainnet: "https://api.hiro.so",
};

async function main() {
  const [contractId, network = "testnet"] = process.argv.slice(2);
  if (!contractId || !contractId.includes(".")) {
    console.error("Usage: npx tsx scripts/inspect-contracts.ts <address.contract-name> [testnet|mainnet]");
    process.exit(1);
  }
  const apiUrl = NETWORK_API[network];
  if (!apiUrl) {
    console.error(`Unknown network "${network}". Use "testnet" or "mainnet".`);
    process.exit(1);
  }

  console.log(`Fetching ${contractId} from ${network} (${apiUrl}) ...\n`);

  const infoRes = await fetch(`${apiUrl}/extended/v1/contract/${contractId}`);
  if (!infoRes.ok) {
    console.error(`NOT FOUND on ${network}: ${contractId} (HTTP ${infoRes.status})`);
    console.error("This contract does not exist on this network. Do not hardcode it anywhere in the app.");
    process.exit(1);
  }
  const info = (await infoRes.json()) as { tx_id: string; block_height?: number; source_code?: string };
  console.log("Deployment tx:", info.tx_id);

  const [address, name] = contractId.split(".");
  const interfaceRes = await fetch(`${apiUrl}/v2/contracts/interface/${address}/${name}`);
  if (interfaceRes.ok) {
    const iface = await interfaceRes.json();
    console.log("\nPublic functions:");
    for (const fn of iface.functions ?? []) {
      if (fn.access === "public" || fn.access === "read_only") {
        console.log(`  [${fn.access}] ${fn.name}(${fn.args.map((a: any) => a.name).join(", ")})`);
      }
    }
    console.log("\nFungible tokens defined:", (iface.fungible_tokens ?? []).map((t: any) => t.name));
  } else {
    console.log("(no /v2/contracts/interface response — non-boot contract or older node)");
  }

  console.log(
    `\nVerified: ${contractId} is a REAL, currently-deployed contract on Stacks ${network}. Safe to reference.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
