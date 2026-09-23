import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  accounts,
  deployer,
  RECEIPTS,
  ASSET_STX,
  ASSET_SBTC,
  ASSETS_BOTH,
  ASSETS_STX_ONLY,
  bootstrapProtocol,
  mintSbtc,
  createVault,
  depositStx,
  depositSbtc,
  redeemStx,
  shareBalance,
  shareSupply,
  errCode,
  expectOk,
} from "./helpers";

// The ten receipt-accounting invariants from the product spec, one or more
// tests each. "The AI" is modelled by the registered executor principal and
// "admin" by the deployer (the protocol admin).
describe("receipt-token-v7 invariants", () => {
  let dep: string;
  let alice: string;
  let bob: string;
  let aiExecutor: string;

  beforeEach(() => {
    dep = deployer();
    alice = accounts().get("wallet_1")!;
    bob = accounts().get("wallet_2")!;
    aiExecutor = accounts().get("wallet_3")!;
    bootstrapProtocol();
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(aiExecutor), Cl.stringAscii("ai-executor")], dep);
  });

  const mintDirect = (sender: string, vaultId: number, asset: string, amount: number, to: string) =>
    simnet.callPublicFn(RECEIPTS, "mint", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.uint(amount), Cl.principal(to)], sender);
  const burnDirect = (sender: string, vaultId: number, asset: string, amount: number, from: string) =>
    simnet.callPublicFn(RECEIPTS, "burn", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.uint(amount), Cl.principal(from)], sender);

  it("INV 1/7/9: users, the AI executor and the protocol admin can all NOT mint receipts directly", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY }));
    for (const sender of [alice, bob, aiExecutor, dep]) {
      expect(errCode(mintDirect(sender, id, ASSET_STX, 1_000_000, sender).result)).toBe(700n);
    }
    expect(shareSupply(id, ASSET_STX)).toBe(0n);
    expect(shareBalance(id, ASSET_STX, alice)).toBe(0n);
  });

  it("INV 8/10: nobody can burn (reduce supply / seize) receipts directly, including the holder, the admin and the AI", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true }));
    expectOk(depositStx(id, 5_000_000n, alice).result);
    for (const sender of [alice, bob, aiExecutor, dep]) {
      expect(errCode(burnDirect(sender, id, ASSET_STX, 1_000_000, alice).result)).toBe(700n);
    }
    expect(shareSupply(id, ASSET_STX)).toBe(5_000_000n);
    expect(shareBalance(id, ASSET_STX, alice)).toBe(5_000_000n);
  });

  it("INV 2/3: shares are minted only as a result of a deposit that actually moved assets in, in the amount the formula gives", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true }));
    // a failed deposit (below minimum) mints nothing
    expect(errCode(depositStx(id, 1n, alice).result)).toBe(114n);
    expect(shareSupply(id, ASSET_STX)).toBe(0n);
    // a successful one mints exactly floor(amount * supply / total)
    expectOk(depositStx(id, 4_000_000n, alice).result);
    expectOk(depositStx(id, 1_000_000n, bob).result);
    expect(shareBalance(id, ASSET_STX, bob)).toBe(1_000_000n);
  });

  it("INV 4: burning shares can never redeem more than the holder's proportional entitlement", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true }));
    expectOk(depositStx(id, 9_000_000n, alice).result);
    expectOk(depositStx(id, 3_000_000n, bob).result); // bob owns 25%
    const res = redeemStx(id, 3_000_000n, bob);
    expect(expectOk(res.result)).toBeUint(3_000_000);
    // asking for more shares than owned is refused
    expect(errCode(redeemStx(id, 1n, bob).result)).toBe(117n);
  });

  it("INV 5/6: balances are isolated per vault - vault #1 shares mean nothing in vault #2", () => {
    const v1 = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY }));
    const v2 = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY }));
    expectOk(depositStx(v1, 10_000_000n, alice).result);
    expect(shareBalance(v1, ASSET_STX, alice)).toBe(10_000_000n);
    expect(shareBalance(v2, ASSET_STX, alice)).toBe(0n);
    expect(shareSupply(v2, ASSET_STX)).toBe(0n);
    expect(errCode(redeemStx(v2, 1n, alice).result)).toBe(117n);
    // funding v2 later does not disturb v1
    expectOk(depositStx(v2, 2_000_000n, alice).result);
    expect(shareBalance(v1, ASSET_STX, alice)).toBe(10_000_000n);
    expect(shareSupply(v1, ASSET_STX)).toBe(10_000_000n);
  });

  it("STX and sBTC share classes of one vault are isolated from each other", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_BOTH }));
    mintSbtc(alice, 5_000_000n);
    expectOk(depositStx(id, 3_000_000n, alice).result);
    expectOk(depositSbtc(id, 1_000_000n, alice).result);
    expect(shareBalance(id, ASSET_STX, alice)).toBe(3_000_000n);
    expect(shareBalance(id, ASSET_SBTC, alice)).toBe(1_000_000n);
    expect(shareSupply(id, ASSET_STX)).toBe(3_000_000n);
    expect(shareSupply(id, ASSET_SBTC)).toBe(1_000_000n);
  });

  it("transfers are disabled: a holder cannot hand shares (and therefore redemption rights) to anyone", () => {
    const id = Number(createVault({ owner: alice, assets: ASSETS_STX_ONLY }));
    expectOk(depositStx(id, 5_000_000n, alice).result);
    const t = simnet.callPublicFn(
      RECEIPTS,
      "transfer",
      [Cl.uint(id), Cl.stringAscii(ASSET_STX), Cl.uint(1), Cl.principal(alice), Cl.principal(bob)],
      alice
    );
    expect(errCode(t.result)).toBe(704n);
    expect(simnet.callReadOnlyFn(RECEIPTS, "is-transferable", [], dep).result).toBeBool(false);
  });

  it("the receipt token exposes no admin/owner mint path at all (interface check)", () => {
    // The only public functions are mint, burn, transfer - the first two are vault-only.
    const iface = JSON.stringify(simnet.getContractsInterfaces().get(`${dep}.${RECEIPTS}`)?.functions.filter((f: any) => f.access === "public").map((f: any) => f.name));
    expect(JSON.parse(iface).sort()).toEqual(["burn", "mint", "transfer"]);
  });

  it("decimals follow the underlying asset; unknown assets have none", () => {
    expect(simnet.callReadOnlyFn(RECEIPTS, "get-decimals", [Cl.stringAscii("STX")], dep).result).toBeSome(Cl.uint(6));
    expect(simnet.callReadOnlyFn(RECEIPTS, "get-decimals", [Cl.stringAscii("SBTC")], dep).result).toBeSome(Cl.uint(8));
    expect(simnet.callReadOnlyFn(RECEIPTS, "get-decimals", [Cl.stringAscii("DOGE")], dep).result).toBeNone();
  });
});
