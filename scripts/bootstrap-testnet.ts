#!/usr/bin/env node
/**
 * bootstrap-testnet.ts
 *
 * One-time governance bootstrap for a fresh set of v7 contracts. Not part of
 * the deploy itself on purpose: choosing the approved sBTC asset is a
 * governance action.
 *
 *   1. risk-guard-v7.set-approved-sbtc-asset -> the REAL Testnet sBTC token
 *
 * (The executor registration in agent-registry-v4 and the protocol admin in
 * sovereignty-protocol-admin-v4 are unchanged from the earlier deployment and
 * carry over automatically.)
 *
 * Usage: npx tsx scripts/bootstrap-testnet.ts
 */
import { Cl } from "@stacks/transactions";
import { call, deployerKey, explorer, id, NAMES, readOnly, SBTC } from "./lib/testnet.js";

async function main() {
  const { key, address } = await deployerKey();
  console.log(`Deployer: ${address}`);

  const current = await readOnly(id(NAMES.risk), "get-approved-sbtc-asset", []);
  const wanted = `${SBTC.address}.${SBTC.name}`;
  if (current.value?.value === wanted) {
    console.log(`approved-sbtc-asset already set to ${wanted}; nothing to do.`);
    return;
  }

  const res = await call({
    key,
    contract: id(NAMES.risk),
    fn: "set-approved-sbtc-asset",
    args: [Cl.contractPrincipal(SBTC.address, SBTC.name)],
  });
  console.log(`set-approved-sbtc-asset -> ${res.status} ${res.repr}`);
  console.log(explorer(res.txid));
  if (res.status !== "success") process.exit(1);

  const after = await readOnly(id(NAMES.risk), "get-approved-sbtc-asset", []);
  console.log("on-chain approved-sbtc-asset:", after.value?.value);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
