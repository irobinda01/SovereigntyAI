import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  accounts,
  deployer,
  ASSET_STX,
  ASSET_SBTC,
  ASSETS_BOTH,
  SBTC_CONTRACT,
  createVaultArgs,
  deployMockStrategy,
  errCode,
  expectOk,
  mintSbtc,
} from "./helpers";

// ---------------------------------------------------------------------------
// MAINNET-PATH HARNESS
//
// On Testnet (and in simnet) `chain-id` is the Testnet id, so the strategy
// execution branch of the protocol is - by design - unreachable. That branch
// still contains real logic (allocation accounting, nonce/replay protection,
// cooldown, strategy-contract verification) that must be correct BEFORE a
// mainnet deployment could ever arm it, so it is tested here.
//
// The harness deploys patched copies of the four v7 contracts under the
// `-t7` suffix. The ONLY source transformations are:
//   1. `-v7` -> `-t7` in contract references (so the copies talk to each other)
//   2. the chain predicate `(is-eq chain-id MAINNET-CHAIN-ID)` -> `true`
// Everything else is byte-for-byte the production source.
//
// This proves the post-gate logic; it does NOT prove the gate itself - that
// is tests/execution-gate.test.ts, run against the unpatched contracts.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAIN_PREDICATE = "(is-eq chain-id MAINNET-CHAIN-ID)";

function patched(file: string): string {
  const src = readFileSync(join(__dirname, "..", "contracts", file), "utf8");
  return src.replace(/-v7/g, "-t7").split(CHAIN_PREDICATE).join("true");
}

const H = {
  vault: "sovereignty-vault-t7",
  receipts: "receipt-token-t7",
  risk: "risk-guard-t7",
  engine: "execution-engine-t7",
};

describe("mainnet execution path (patched-predicate harness)", () => {
  let dep: string;
  let owner: string;
  let aiExecutor: string;
  let stranger: string;
  let stxStrategyId: bigint;
  let stxStrategy: string;
  let sbtcStrategyId: bigint;
  let sbtcStrategy: string;
  let vaultId: bigint;

  const opts = { clarityVersion: 3 as const };

  beforeEach(() => {
    dep = deployer();
    owner = accounts().get("wallet_1")!;
    aiExecutor = accounts().get("wallet_2")!;
    stranger = accounts().get("wallet_3")!;

    // sanity: the harness source really did change exactly the predicate
    expect(patched("risk-guard-v7.clar")).not.toContain(CHAIN_PREDICATE);
    expect(patched("risk-guard-v7.clar")).toContain("(define-read-only (is-mainnet-chain)\n  true)");

    simnet.deployContract(H.receipts, patched("receipt-token-v7.clar"), opts, dep);
    simnet.deployContract(H.risk, patched("risk-guard-v7.clar"), opts, dep);
    simnet.deployContract(H.vault, patched("sovereignty-vault-v7.clar"), opts, dep);
    simnet.deployContract(H.engine, patched("execution-engine-v7.clar"), opts, dep);

    expectOk(simnet.callPublicFn(H.risk, "set-approved-sbtc-asset", [Cl.principal(SBTC_CONTRACT)], dep).result);
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(aiExecutor), Cl.stringAscii("ai")], dep);

    // strategy fixtures (test-only mock implementing strategy-trait)
    for (const [asset, nm] of [[ASSET_STX, "mock-strategy-stx-t"], [ASSET_SBTC, "mock-strategy-sbtc-t"]] as const) {
      deployMockStrategy(dep, nm);
      const id = BigInt(
        (simnet.callPublicFn("strategy-registry-v6", "register-strategy", [Cl.stringAscii(nm), Cl.principal(`${dep}.${nm}`), Cl.stringAscii(asset), Cl.uint(10000)], dep).result as any).value.value
      );
      simnet.callPublicFn("strategy-registry-v6", "activate-strategy", [Cl.uint(id)], dep);
      if (asset === ASSET_STX) {
        stxStrategyId = id;
        stxStrategy = `${dep}.${nm}`;
      } else {
        sbtcStrategyId = id;
        sbtcStrategy = `${dep}.${nm}`;
      }
    }

    vaultId = BigInt(
      (simnet.callPublicFn(H.vault, "create-vault", createVaultArgs({ owner, assets: ASSETS_BOTH, autonomous: true, openDeposits: true }), owner).result as any).value.value
    );
    expectOk(simnet.callPublicFn(H.vault, "deposit-stx", [Cl.uint(vaultId), Cl.uint(100_000_000)], owner).result);
    mintSbtc(owner, 1_000_000_000n);
    expectOk(simnet.callPublicFn(H.vault, "deposit-sbtc", [Cl.uint(vaultId), Cl.uint(100_000_000), Cl.principal(SBTC_CONTRACT)], owner).result);
  });

  const submit = (
    sender: string,
    o: { asset?: string; amount?: number; nonce?: number; deadline?: number; slippage?: number; strategy?: string; destId?: bigint } = {}
  ) => {
    const asset = o.asset ?? ASSET_STX;
    const strategy = o.strategy ?? (asset === ASSET_STX ? stxStrategy : sbtcStrategy);
    const destId = o.destId ?? (asset === ASSET_STX ? stxStrategyId : sbtcStrategyId);
    const [addr, name] = strategy.split(".");
    return simnet.callPublicFn(
      H.engine,
      "submit-rebalance-intent",
      [
        Cl.uint(vaultId),
        Cl.uint(destId),
        Cl.stringAscii(asset),
        Cl.uint(o.amount ?? 10_000_000),
        Cl.uint(o.slippage ?? 50),
        Cl.uint(o.nonce ?? 1),
        Cl.uint(o.deadline ?? simnet.blockHeight + 100),
        Cl.contractPrincipal(addr, name),
      ],
      sender
    ).result;
  };

  const read = (fn: string, args: any[]) => simnet.callReadOnlyFn(H.vault, fn, args, dep).result as any;
  const idle = (asset: string) => BigInt(read("get-idle-balance", [Cl.uint(vaultId), Cl.stringAscii(asset)]).value);
  const total = (asset: string) => BigInt(read("get-total-balance", [Cl.uint(vaultId), Cl.stringAscii(asset)]).value);
  const alloc = (sid: bigint, asset: string) =>
    BigInt(read("get-strategy-allocation", [Cl.uint(vaultId), Cl.uint(sid), Cl.stringAscii(asset)]).value);
  const supply = (asset: string) => BigInt(simnet.callReadOnlyFn(H.receipts, "get-total-supply", [Cl.uint(vaultId), Cl.stringAscii(asset)], dep).result.value as any);
  const cfg = () => (simnet.callReadOnlyFn(H.risk, "get-vault-config", [Cl.uint(vaultId)], dep).result as any).value.value;

  it("the harness starts DISARMED (fail closed) even with the chain predicate satisfied", () => {
    expect(errCode(submit(aiExecutor))).toBe(208n); // not armed yet -> blocked by the engine-level gate
    expect(simnet.callReadOnlyFn(H.risk, "is-strategy-execution-enabled", [], dep).result).toBeBool(false);
  });

  describe("once governance arms execution", () => {
    beforeEach(() => {
      expect(errCode(simnet.callPublicFn(H.risk, "set-mainnet-execution-armed", [Cl.bool(true)], stranger).result)).toBe(300n);
      expectOk(simnet.callPublicFn(H.risk, "set-mainnet-execution-armed", [Cl.bool(true)], dep).result);
    });

    it("a valid AI intent allocates idle capital into the strategy; shares and total assets do NOT change", () => {
      const supplyBefore = supply(ASSET_STX);
      const totalBefore = total(ASSET_STX);
      expectOk(submit(aiExecutor, { amount: 20_000_000 }));

      expect(idle(ASSET_STX)).toBe(80_000_000n);
      expect(alloc(stxStrategyId, ASSET_STX)).toBe(20_000_000n);
      // ownership vs deployment are separate dimensions
      expect(total(ASSET_STX)).toBe(totalBefore);
      expect(supply(ASSET_STX)).toBe(supplyBefore);
      // the sBTC pool is untouched
      expect(idle(ASSET_SBTC)).toBe(100_000_000n);
      expect(alloc(sbtcStrategyId, ASSET_SBTC)).toBe(0n);
    });

    it("STX and sBTC allocations are tracked independently", () => {
      expectOk(submit(aiExecutor, { asset: ASSET_STX, amount: 10_000_000, nonce: 1 }));
      simnet.mineEmptyBlocks(10);
      expectOk(submit(aiExecutor, { asset: ASSET_SBTC, amount: 5_000_000, nonce: 2 }));
      expect(alloc(stxStrategyId, ASSET_STX)).toBe(10_000_000n);
      expect(alloc(sbtcStrategyId, ASSET_SBTC)).toBe(5_000_000n);
      expect(idle(ASSET_STX)).toBe(90_000_000n);
      expect(idle(ASSET_SBTC)).toBe(95_000_000n);
    });

    it("the nonce is consumed: a replay of the same intent is rejected (308)", () => {
      expectOk(submit(aiExecutor, { nonce: 1, amount: 5_000_000 }));
      expect(BigInt(cfg()["last-used-nonce"].value)).toBe(1n);
      simnet.mineEmptyBlocks(10);
      expect(errCode(submit(aiExecutor, { nonce: 1, amount: 5_000_000 }))).toBe(308n);
      expect(errCode(submit(aiExecutor, { nonce: 0, amount: 5_000_000 }))).toBe(308n);
      expectOk(submit(aiExecutor, { nonce: 2, amount: 5_000_000 }));
    });

    it("the cooldown blocks a second execution until it elapses (309)", () => {
      expectOk(submit(aiExecutor, { nonce: 1, amount: 5_000_000 }));
      expect(errCode(submit(aiExecutor, { nonce: 2, amount: 5_000_000 }))).toBe(309n);
      simnet.mineEmptyBlocks(6);
      expectOk(submit(aiExecutor, { nonce: 2, amount: 5_000_000 }));
    });

    it("cumulative allocation cannot exceed the per-strategy exposure cap (312)", () => {
      expectOk(submit(aiExecutor, { nonce: 1, amount: 20_000_000 }));
      simnet.mineEmptyBlocks(10);
      // 20 already + 15 = 35% of 100 > 30% cap
      expect(errCode(submit(aiExecutor, { nonce: 2, amount: 15_000_000 }))).toBe(312n);
      expectOk(submit(aiExecutor, { nonce: 2, amount: 10_000_000 }));
      expect(alloc(stxStrategyId, ASSET_STX)).toBe(30_000_000n);
    });

    it("redemption pays only IDLE funds: a claim larger than idle liquidity is refused (105), smaller is fine", () => {
      expectOk(submit(aiExecutor, { amount: 30_000_000 }));
      // owner holds 100% of the STX shares (100_000_000); claim = 100 STX but only 70 idle
      expect(errCode(simnet.callPublicFn(H.vault, "redeem-stx", [Cl.uint(vaultId), Cl.uint(100_000_000)], owner).result)).toBe(105n);
      expectOk(simnet.callPublicFn(H.vault, "redeem-stx", [Cl.uint(vaultId), Cl.uint(70_000_000)], owner).result);
      expect(idle(ASSET_STX)).toBe(0n);
      expect(total(ASSET_STX)).toBe(30_000_000n); // the deployed 30 is still the holder's claim
    });

    it("the vault refuses a strategy contract that does not match the registry entry (108)", () => {
      // pass the sBTC mock's principal while naming the STX strategy id
      expect(errCode(submit(aiExecutor, { asset: ASSET_STX, strategy: sbtcStrategy }))).toBe(108n);
      expect(alloc(stxStrategyId, ASSET_STX)).toBe(0n);
    });

    it("a revoked executor is rejected even when armed; the owner can still execute manually with autonomy off", () => {
      simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(aiExecutor)], dep);
      expect(errCode(submit(aiExecutor))).toBe(201n);
      simnet.callPublicFn(H.vault, "set-autonomous-mode", [Cl.uint(vaultId), Cl.bool(false)], owner);
      expectOk(submit(owner, { amount: 5_000_000 }));
    });

    it("a paused vault cannot allocate (206), and the direct vault entry is engine-only (107)", () => {
      simnet.callPublicFn(H.vault, "pause-vault", [Cl.uint(vaultId)], owner);
      expect(errCode(submit(aiExecutor))).toBe(206n);
      const [a, n] = stxStrategy.split(".");
      const direct = simnet.callPublicFn(
        H.vault,
        "execute-rebalance",
        [Cl.uint(vaultId), Cl.uint(stxStrategyId), Cl.stringAscii("STX"), Cl.uint(1), Cl.contractPrincipal(a, n)],
        owner
      );
      expect(errCode(direct.result)).toBe(107n);
    });

    it("disarming re-blocks execution immediately", () => {
      expectOk(simnet.callPublicFn(H.risk, "set-mainnet-execution-armed", [Cl.bool(false)], dep).result);
      expect(errCode(submit(aiExecutor))).toBe(208n);
    });
  });
});
