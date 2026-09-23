#!/usr/bin/env node
/**
 * deploy-testnet.ts
 *
 * Orchestrates a REAL deployment of the SovereigntyAI contracts to Stacks
 * Testnet using Clarinet's own deployment-plan workflow (the current
 * recommended path — see `clarinet deployments --help`). This script
 * never touches a private key itself; clarinet reads the mnemonic
 * directly from settings/Testnet.toml (gitignored) and signs locally.
 *
 * Preconditions checked before anything is broadcast:
 *   1. settings/Testnet.toml has a real mnemonic, not the scaffold placeholder.
 *   2. The derived deployer address has enough testnet STX for fees
 *      (checked against the real Testnet API — no assumption, no mock).
 *
 * Usage:
 *   npx tsx scripts/deploy-testnet.ts            # generate + apply
 *   npx tsx scripts/deploy-testnet.ts --dry-run   # generate + check only
 *
 * After a successful deploy, run scripts/verify-testnet.ts to confirm
 * every contract is live, then follow docs/deployment.md's "Required
 * bootstrap calls" section (set-approved-asset, register an executor)
 * before the protocol can be used.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TESTNET_TOML = join(ROOT, "settings", "Testnet.toml");
const API_URL = process.env.STACKS_API_URL || "https://api.testnet.hiro.so";
const MIN_STX_FOR_DEPLOY = 5_000_000; // 5 STX in micro-STX, conservative fee buffer

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function run(cmd: string) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(TESTNET_TOML)) {
    fail(`settings/Testnet.toml not found. Run "clarinet new" once or restore it from version control.`);
  }
  const toml = readFileSync(TESTNET_TOML, "utf8");
  if (toml.includes("<YOUR PRIVATE TESTNET MNEMONIC HERE>")) {
    fail(
      "settings/Testnet.toml still has the placeholder mnemonic.\n" +
        "  Set [accounts.deployer].mnemonic to a REAL Testnet-only wallet's 24-word " +
        "seed phrase before deploying.\n" +
        "  This file is gitignored — never commit a real mnemonic.\n" +
        "  See docs/deployment.md for how to generate a dedicated testnet deployer wallet."
    );
  }

  const addressMatch = toml.match(/stx_address:\s*(\S+)/);
  const explicitAddress = process.env.DEPLOYER_ADDRESS;
  const deployerAddress = explicitAddress || addressMatch?.[1];
  if (!deployerAddress) {
    console.warn(
      "Could not auto-detect the deployer's STX address from settings/Testnet.toml comments.\n" +
        "Set DEPLOYER_ADDRESS=ST... to enable the pre-flight balance check, or continue without it."
    );
  } else {
    console.log(`Checking Testnet STX balance for deployer ${deployerAddress} ...`);
    const res = await fetch(`${API_URL}/extended/v1/address/${deployerAddress}/stx`);
    if (!res.ok) {
      fail(`Could not reach ${API_URL} to check balance (HTTP ${res.status}). Aborting rather than guessing.`);
    }
    const data = (await res.json()) as { balance: string };
    const balance = BigInt(data.balance);
    console.log(`  Balance: ${balance} microSTX (${Number(balance) / 1_000_000} STX)`);
    if (balance < BigInt(MIN_STX_FOR_DEPLOY)) {
      fail(
        `Deployer balance too low to safely deploy 8 contracts.\n` +
          `  Fund this address from the Stacks Testnet faucet first:\n` +
          `  https://explorer.hiro.so/sandbox/faucet?chain=testnet\n` +
          `  (or the faucet API: POST ${API_URL}/extended/v1/faucets/stx?address=${deployerAddress})`
      );
    }
  }

  console.log("\nGenerating deployment plan from Clarinet.toml + settings/Testnet.toml ...");
  run("clarinet deployments generate --testnet --medium-cost");

  console.log("\nValidating the generated deployment plan ...");
  run("clarinet deployments check");

  if (dryRun) {
    console.log("\n--dry-run set: plan generated and validated, nothing broadcast. Review it, then re-run without --dry-run.");
    return;
  }

  console.log(
    "\nAbout to broadcast REAL transactions to Stacks Testnet using the deployer key in settings/Testnet.toml.\n" +
      "This costs real testnet STX and cannot be undone."
  );
  run("clarinet deployments apply --testnet");

  console.log(
    "\nDeployment broadcast. Contracts are pending confirmation.\n" +
      "Next: run `DEPLOYER_ADDRESS=<deployer> npx tsx scripts/verify-testnet.ts` once transactions confirm,\n" +
      "then complete the required bootstrap calls documented in docs/deployment.md."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
