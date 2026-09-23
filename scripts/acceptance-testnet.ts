#!/usr/bin/env node
/**
 * acceptance-testnet.ts
 *
 * LIVE contract-level acceptance run against the deployed v7 contracts on
 * Stacks Testnet. Every action is a REAL transaction signed with a real
 * Testnet key, broadcast with an explicit post-condition set in Deny mode
 * (the same shape the web app uses), and confirmed against the real API.
 * Every assertion reads authoritative on-chain state. There is no
 * simulation path in this file.
 *
 * What it proves live:
 *   - multiple independent vaults per user, with different purposes/assets
 *   - real STX deposit -> receipt shares minted -> position read back
 *   - real sBTC (SIP-010) deposit -> receipt shares minted
 *   - multi-user proportional shares in one vault (deployer + executor wallet)
 *   - vault isolation
 *   - proportional redemption (burn shares -> real assets returned)
 *   - the on-chain risk-validation read + execution gate report
 *
 * Usage: npx tsx scripts/acceptance-testnet.ts
 * Writes a machine-readable log of real tx ids to docs/testnet-acceptance.json.
 */
import { Cl, getAddressFromPrivateKey, Pc } from "@stacks/transactions";
import { writeFileSync } from "node:fs";
import { call, deployerKey, executorKey, explorer, id, NAMES, readOnly, SBTC, apiGet } from "./lib/testnet.js";

const log: Array<{ step: string; txid?: string; status: string; detail?: string }> = [];
let failures = 0;

function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
}

async function tx(step: string, r: Awaited<ReturnType<typeof call>>) {
  console.log(`  tx  ${step}: ${r.status} ${r.repr}\n      ${explorer(r.txid)}`);
  log.push({ step, txid: r.txid, status: r.status, detail: r.repr });
  return r;
}

const VAULT = id(NAMES.vault);
const RECEIPTS = id(NAMES.receipts);
const SBTC_ID = `${SBTC.address}.${SBTC.name}`;

const num = (j: any) => BigInt(j.value?.value ?? j.value);

async function position(vaultId: bigint, asset: "STX" | "SBTC", who: string) {
  const j = await readOnly(VAULT, "get-position", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.principal(who)], who);
  const t = j.value;
  return {
    shares: BigInt(t.shares.value),
    supply: BigInt(t.supply.value),
    total: BigInt(t["total-assets"].value),
    idle: BigInt(t.idle.value),
    bps: BigInt(t["ownership-bps"].value),
    claim: BigInt(t.claim.value),
    redeemable: BigInt(t.redeemable.value),
  };
}

// Same preset shape the web app proposes; the owner signs these exact numbers.
const risk = (o: { exposure: number; stxTx: bigint; sbtcTx: bigint; slippage: number; minIdle: number; auto: boolean; cooldown: number }) => [
  Cl.uint(o.exposure),
  Cl.uint(o.stxTx),
  Cl.uint(o.sbtcTx),
  Cl.uint(o.slippage),
  Cl.uint(o.minIdle),
  Cl.bool(o.auto),
  Cl.uint(o.cooldown),
];

async function createVault(key: string, name: string, purpose: number, assets: number, open: boolean, auto: boolean) {
  const r = await call({
    key,
    contract: VAULT,
    fn: "create-vault",
    args: [
      Cl.stringUtf8(name),
      Cl.uint(purpose),
      Cl.uint(assets),
      Cl.bool(open),
      ...risk({ exposure: 3000, stxTx: 100_000_000n, sbtcTx: 10_000_000n, slippage: 50, minIdle: 2000, auto, cooldown: 100 }),
    ],
  });
  await tx(`create-vault "${name}"`, r);
  if (r.status !== "success") throw new Error(`create-vault failed: ${r.repr}`);
  return BigInt(r.result.value.value);
}

async function main() {
  const { key: dKey, address: deployer } = await deployerKey();
  const eKey = executorKey();
  if (!eKey) throw new Error("agent/.env EXECUTOR_PRIVATE_KEY missing (needed as a second real wallet)");
  const executor = getAddressFromPrivateKey(eKey, "testnet");
  console.log(`Deployer/owner: ${deployer}\nSecond wallet:  ${executor}\n`);

  // ---- 0. environment as reported by the chain itself
  console.log("0. Execution environment (from risk-guard-v7)");
  const env = await readOnly(id(NAMES.risk), "get-execution-environment", []);
  check("network reports TESTNET", env.value.network.value === "TESTNET", env.value.network.value);
  check("strategy execution disabled", env.value["strategy-execution-enabled"].value === false);

  // ---- 1. multiple vaults
  console.log("\n1. Create three independent vaults");
  const before = Number(num(await readOnly(VAULT, "get-owner-vault-count", [Cl.principal(deployer)])));
  const vA = await createVault(dKey, "Conservative Treasury", 0, 1, false, false);
  const vB = await createVault(dKey, "Business Treasury", 2, 3, false, true);
  const vC = await createVault(dKey, "DAO Treasury", 3, 1, true, false);
  console.log(`  vault ids: A=${vA} B=${vB} C=${vC}`);
  const after = Number(num(await readOnly(VAULT, "get-owner-vault-count", [Cl.principal(deployer)])));
  check("owner index grew by 3", after - before === 3, `${before} -> ${after}`);
  const meta = await readOnly(VAULT, "get-vault", [Cl.uint(vB)]);
  check("vault metadata stored on-chain", meta.value.value.name.value === "Business Treasury" && meta.value.value.assets.value === "3");

  // ---- 2. real STX deposit
  console.log("\n2. Real STX deposit into vault A (2 STX)");
  const dep = 2_000_000n;
  const stxBefore = BigInt((await apiGet<any>(`/extended/v1/address/${deployer}/stx`)).balance);
  const r1 = await tx(
    "deposit-stx A",
    await call({
      key: dKey,
      contract: VAULT,
      fn: "deposit-stx",
      args: [Cl.uint(vA), Cl.uint(dep)],
      postConditions: [Pc.principal(deployer).willSendEq(dep).ustx()],
    })
  );
  check("deposit succeeded", r1.status === "success");
  const posA = await position(vA, "STX", deployer);
  check("shares minted 1:1 on first deposit", posA.shares === dep, `${posA.shares}`);
  check("supply == shares", posA.supply === dep);
  check("ownership 100%", posA.bps === 10000n);
  check("pool total == deposit", posA.total === dep);
  const recBal = num(await readOnly(RECEIPTS, "get-balance", [Cl.uint(vA), Cl.stringAscii("STX"), Cl.principal(deployer)]));
  check("receipt-token contract agrees", recBal === dep);
  const stxAfter = BigInt((await apiGet<any>(`/extended/v1/address/${deployer}/stx`)).balance);
  check("wallet STX decreased by at least the deposit", stxBefore - stxAfter >= dep, `${stxBefore - stxAfter}`);

  // ---- 3. isolation
  console.log("\n3. Vault isolation");
  const posB = await position(vB, "STX", deployer);
  const posC = await position(vC, "STX", deployer);
  check("vault B untouched", posB.supply === 0n && posB.total === 0n);
  check("vault C untouched", posC.supply === 0n && posC.total === 0n);

  // ---- 4. multi-user in vault C (open deposits)
  console.log("\n4. Multi-user: deployer 3 STX, second wallet 1 STX into open vault C");
  await tx(
    "deposit-stx C (deployer 3 STX)",
    await call({ key: dKey, contract: VAULT, fn: "deposit-stx", args: [Cl.uint(vC), Cl.uint(3_000_000n)], postConditions: [Pc.principal(deployer).willSendEq(3_000_000n).ustx()] })
  );
  const rBob = await tx(
    "deposit-stx C (second wallet 1 STX)",
    await call({ key: eKey, contract: VAULT, fn: "deposit-stx", args: [Cl.uint(vC), Cl.uint(1_000_000n)], postConditions: [Pc.principal(executor).willSendEq(1_000_000n).ustx()] })
  );
  check("second wallet deposit succeeded", rBob.status === "success");
  const cA = await position(vC, "STX", deployer);
  const cB = await position(vC, "STX", executor);
  check("deployer holds 3,000,000 shares / 75%", cA.shares === 3_000_000n && cA.bps === 7500n, `${cA.shares} ${cA.bps}bps`);
  check("second wallet holds 1,000,000 shares / 25%", cB.shares === 1_000_000n && cB.bps === 2500n, `${cB.shares} ${cB.bps}bps`);
  check("supply is 4,000,000", cA.supply === 4_000_000n);
  const pkA = await position(vA, "STX", deployer);
  check("vault A unaffected by vault C activity", pkA.shares === dep && pkA.supply === dep);

  const stranger = await call({ key: eKey, contract: VAULT, fn: "deposit-stx", args: [Cl.uint(vA), Cl.uint(1_000_000n)], postConditions: [Pc.principal(executor).willSendEq(1_000_000n).ustx()] });
  await tx("deposit-stx A by non-owner (must be rejected: owner-only vault)", stranger);
  // The chain may label a rejected call abort_by_response OR abort_by_post_condition (the latter when the
  // declared transfer never happened); the contract result is (err u113) either way and no funds move.
  check("non-owner deposit into owner-only vault rejected (u113)", stranger.status.startsWith("abort_") && stranger.repr.includes("u113"), `${stranger.status} ${stranger.repr}`);

  // ---- 5. real sBTC deposit
  console.log("\n5. Real sBTC deposit into vault B (0.001 sBTC)");
  const sats = 100_000n;
  const sbtcBefore = num(await readOnly(SBTC_ID, "get-balance", [Cl.principal(deployer)], deployer));
  const r5 = await tx(
    "deposit-sbtc B",
    await call({
      key: dKey,
      contract: VAULT,
      fn: "deposit-sbtc",
      args: [Cl.uint(vB), Cl.uint(sats), Cl.contractPrincipal(SBTC.address, SBTC.name)],
      postConditions: [Pc.principal(deployer).willSendEq(sats).ft(SBTC_ID as `${string}.${string}`, "sbtc-token")],
    })
  );
  check("sBTC deposit succeeded", r5.status === "success", r5.repr);
  const sB = await position(vB, "SBTC", deployer);
  check("sBTC shares minted 1:1", sB.shares === sats && sB.total === sats, `${sB.shares}`);
  const sbtcAfter = num(await readOnly(SBTC_ID, "get-balance", [Cl.principal(deployer)], deployer));
  check("wallet sBTC decreased by exactly the deposit", sbtcBefore - sbtcAfter === sats, `${sbtcBefore - sbtcAfter}`);
  const vaultSbtc = num(await readOnly(SBTC_ID, "get-balance", [Cl.contractPrincipal(deployer, NAMES.vault)], deployer));
  check("vault contract really holds the sBTC", vaultSbtc >= sats, `${vaultSbtc}`);
  const bStx = await position(vB, "STX", deployer);
  check("STX class of the same vault is separate (no STX shares)", bStx.supply === 0n);

  // ---- 6. redemption
  console.log("\n6. Redeem half of vault A shares");
  const redeemShares = 1_000_000n;
  const r6 = await tx(
    "redeem-stx A",
    await call({
      key: dKey,
      contract: VAULT,
      fn: "redeem-stx",
      args: [Cl.uint(vA), Cl.uint(redeemShares)],
      postConditions: [Pc.principal(VAULT).willSendEq(redeemShares).ustx()],
    })
  );
  check("redeem succeeded", r6.status === "success", r6.repr);
  const posA2 = await position(vA, "STX", deployer);
  check("shares burned", posA2.shares === dep - redeemShares && posA2.supply === dep - redeemShares, `${posA2.shares}`);
  check("pool total reduced by the payout", posA2.total === dep - redeemShares);

  console.log("\n7. Redeem sBTC shares of vault B");
  const r7 = await tx(
    "redeem-sbtc B",
    await call({
      key: dKey,
      contract: VAULT,
      fn: "redeem-sbtc",
      args: [Cl.uint(vB), Cl.uint(sats), Cl.contractPrincipal(SBTC.address, SBTC.name)],
      postConditions: [Pc.principal(VAULT).willSendEq(sats).ft(SBTC_ID as `${string}.${string}`, "sbtc-token")],
    })
  );
  check("sBTC redeem succeeded", r7.status === "success", r7.repr);
  const sbtcRestored = num(await readOnly(SBTC_ID, "get-balance", [Cl.principal(deployer)], deployer));
  check("wallet sBTC restored exactly", sbtcRestored === sbtcBefore, `${sbtcRestored} vs ${sbtcBefore}`);

  // ---- 8. risk validation read + gate
  console.log("\n8. On-chain intent evaluation (read-only) - no strategy is registered on Testnet");
  const ev = await readOnly(id(NAMES.engine), "evaluate-rebalance-intent", [
    Cl.uint(vA), Cl.uint(1), Cl.stringAscii("STX"), Cl.uint(100_000n), Cl.uint(50), Cl.uint(1), Cl.uint(9_999_999),
  ], deployer);
  console.log("  evaluate ->", JSON.stringify(ev));
  check("evaluation refuses (no active strategy in the registry)", ev.success === false && String(ev.value.value) === "202", `code ${ev.value?.value}`);

  writeFileSync("docs/testnet-acceptance.json", JSON.stringify({ ranAt: new Date().toISOString(), deployer, secondWallet: executor, vaults: { A: String(vA), B: String(vB), C: String(vC) }, txs: log }, null, 2));
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} - log written to docs/testnet-acceptance.json`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
