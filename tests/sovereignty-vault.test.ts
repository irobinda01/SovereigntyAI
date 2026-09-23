import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  accounts,
  deployer,
  VAULT,
  RECEIPTS,
  RISK,
  SBTC_CONTRACT,
  ASSET_STX,
  ASSET_SBTC,
  ASSETS_STX_ONLY,
  ASSETS_SBTC_ONLY,
  ASSETS_BOTH,
  PURPOSE,
  MIN_INITIAL_STX,
  MIN_INITIAL_SBTC,
  bootstrapProtocol,
  mintSbtc,
  sbtcBalance,
  stxBalance,
  contractPrincipal,
  expectOk,
  errCode,
  createVault,
  createVaultArgs,
  depositStx,
  depositSbtc,
  redeemStx,
  redeemSbtc,
  shareBalance,
  shareSupply,
  idleBalance,
  totalBalance,
  position,
} from "./helpers";

// Error codes (see docs/contracts.md).
const E = {
  NOT_OWNER: 100n,
  VAULT_NOT_FOUND: 101n,
  PROTOCOL_PAUSED: 102n,
  WRONG_ASSET: 103n,
  ZERO_AMOUNT: 104n,
  INSUFFICIENT_IDLE: 105n,
  NO_APPROVED_ASSET: 109n,
  ASSET_NOT_SUPPORTED: 111n,
  VAULT_PAUSED: 112n,
  DEPOSITS_RESTRICTED: 113n,
  BELOW_MIN_INITIAL: 114n,
  ZERO_SHARES: 115n,
  VAULT_INSOLVENT: 116n,
  INSUFFICIENT_SHARES: 117n,
  ZERO_REDEMPTION: 118n,
  INVALID_NAME: 119n,
  INVALID_PURPOSE: 120n,
  INVALID_ASSET_MODE: 121n,
  ALREADY_PAUSED: 122n,
  NOT_PAUSED: 123n,
  INVALID_PARAMS: 317n,
  NON_TRANSFERABLE: 704n,
  NOT_VAULT: 700n,
};

// Test-only SIP-010 stand-in used SOLELY to prove the vault refuses any token
// contract other than the governance-approved sBTC. Never deployed anywhere.
const FAKE_TOKEN_SOURCE = `
(impl-trait .sip-010-trait-v4.sip-010-trait)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34)))) (ok true))
(define-read-only (get-name) (ok "Unapproved"))
(define-read-only (get-symbol) (ok "NOPE"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (who principal)) (ok u0))
(define-read-only (get-total-supply) (ok u0))
(define-read-only (get-token-uri) (ok none))
`;

describe("sovereignty-vault-v7", () => {
  let dep: string;
  let alice: string;
  let bob: string;
  let carol: string;

  beforeEach(() => {
    dep = deployer();
    alice = accounts().get("wallet_1")!;
    bob = accounts().get("wallet_2")!;
    carol = accounts().get("wallet_3")!;
  });

  // ------------------------------------------------------------------
  describe("vault creation", () => {
    it("stores name, purpose, assets, owner and deposit policy, and starts empty and unpaused", () => {
      const id = createVault({
        owner: alice,
        name: "Operations Treasury",
        purpose: PURPOSE.business,
        assets: ASSETS_STX_ONLY,
        openDeposits: true,
      });
      expect(id).toBe(1n);
      const v = (simnet.callReadOnlyFn(VAULT, "get-vault", [Cl.uint(id)], dep).result as any).value.value;
      expect(v.owner.value).toBe(alice);
      expect(v.name.value).toBe("Operations Treasury");
      expect(BigInt(v.purpose.value)).toBe(BigInt(PURPOSE.business));
      expect(BigInt(v.assets.value)).toBe(BigInt(ASSETS_STX_ONLY));
      expect(v["open-deposits"].type).toBe("true");
      expect(v.paused.type).toBe("false");
      expect(idleBalance(id, ASSET_STX)).toBe(0n);
      expect(totalBalance(id, ASSET_STX)).toBe(0n);
      expect(shareSupply(id, ASSET_STX)).toBe(0n);
    });

    it("stores the exact risk parameters the owner signed (nothing is defaulted on their behalf)", () => {
      const id = createVault({
        owner: alice,
        maxExposureBps: 2500,
        maxStxTxAmount: 123_000_000n,
        maxSbtcTxAmount: 7_000_000n,
        maxSlippageBps: 25,
        minIdleBps: 4000,
        autonomous: true,
        cooldownBlocks: 144,
      });
      const cfg = (simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(id)], dep).result as any).value.value;
      expect(BigInt(cfg["max-exposure-bps"].value)).toBe(2500n);
      expect(BigInt(cfg["max-stx-tx-amount"].value)).toBe(123_000_000n);
      expect(BigInt(cfg["max-sbtc-tx-amount"].value)).toBe(7_000_000n);
      expect(BigInt(cfg["max-slippage-bps"].value)).toBe(25n);
      expect(BigInt(cfg["min-idle-bps"].value)).toBe(4000n);
      expect(cfg["autonomous-enabled"].type).toBe("true");
      expect(BigInt(cfg["cooldown-blocks"].value)).toBe(144n);
      expect(BigInt(cfg["last-used-nonce"].value)).toBe(0n);
    });

    it("one user can create MANY independent vaults with different purposes; ids are sequential", () => {
      const a = createVault({ owner: alice, name: "Conservative Treasury", purpose: PURPOSE.conservative });
      const b = createVault({ owner: alice, name: "Business Treasury", purpose: PURPOSE.business });
      const c = createVault({ owner: alice, name: "DAO Treasury", purpose: PURPOSE.dao });
      const d = createVault({ owner: bob, name: "Bob's", purpose: PURPOSE.aggressive });
      expect([a, b, c, d]).toEqual([1n, 2n, 3n, 4n]);
      expect(simnet.callReadOnlyFn(VAULT, "get-vault-count", [], dep).result).toBeUint(4);
    });

    it("maintains an on-chain owner index (no off-chain database needed to list a user's vaults)", () => {
      createVault({ owner: alice });
      createVault({ owner: bob });
      createVault({ owner: alice });
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-count", [Cl.principal(alice)], dep).result).toBeUint(2);
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-id", [Cl.principal(alice), Cl.uint(0)], dep).result).toBeSome(
        Cl.uint(1)
      );
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-id", [Cl.principal(alice), Cl.uint(1)], dep).result).toBeSome(
        Cl.uint(3)
      );
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-count", [Cl.principal(bob)], dep).result).toBeUint(1);
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-id", [Cl.principal(alice), Cl.uint(2)], dep).result).toBeNone();
    });

    it("rejects an empty name, an unknown purpose and an invalid asset mode", () => {
      expect(errCode(simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice, name: "" }), alice).result)).toBe(
        E.INVALID_NAME
      );
      expect(errCode(simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice, purpose: 6 }), alice).result)).toBe(
        E.INVALID_PURPOSE
      );
      expect(errCode(simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice, assets: 0 }), alice).result)).toBe(
        E.INVALID_ASSET_MODE
      );
      expect(errCode(simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice, assets: 4 }), alice).result)).toBe(
        E.INVALID_ASSET_MODE
      );
    });

    it("rejects risk parameters outside protocol ceilings, and creates nothing when it does", () => {
      const bad = [
        { maxExposureBps: 5001 }, // above the 50% protocol ceiling
        { maxExposureBps: 0 },
        { maxSlippageBps: 1001 },
        { maxSlippageBps: 0 },
        { minIdleBps: 499 }, // below the protocol liquidity floor
        { minIdleBps: 10001 },
        { cooldownBlocks: 0 },
        { maxStxTxAmount: 0n },
        { maxSbtcTxAmount: 0n },
      ];
      for (const b of bad) {
        const res = simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice, ...b }), alice);
        expect(errCode(res.result)).toBe(E.INVALID_PARAMS);
      }
      // the whole tx reverted: no vault id was consumed
      expect(simnet.callReadOnlyFn(VAULT, "get-vault-count", [], dep).result).toBeUint(0);
      expect(simnet.callReadOnlyFn(VAULT, "get-owner-vault-count", [Cl.principal(alice)], dep).result).toBeUint(0);
    });

    it("cannot create a vault while the protocol is paused", () => {
      simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
      const res = simnet.callPublicFn(VAULT, "create-vault", createVaultArgs({ owner: alice }), alice);
      expect(errCode(res.result)).toBe(E.PROTOCOL_PAUSED);
    });

    it("the vault cannot be re-initialised: risk-guard rejects config calls that do not come from the vault contract", () => {
      const id = createVault({ owner: alice });
      const direct = simnet.callPublicFn(
        RISK,
        "set-vault-risk-config",
        [Cl.uint(id), Cl.uint(5000), Cl.uint(1), Cl.uint(1), Cl.uint(1000), Cl.uint(500), Cl.bool(true), Cl.uint(1)],
        alice
      );
      expect(errCode(direct.result)).toBe(301n);
      const init = simnet.callPublicFn(
        RISK,
        "init-vault-config",
        [Cl.uint(99), Cl.uint(3000), Cl.uint(1), Cl.uint(1), Cl.uint(50), Cl.uint(500), Cl.bool(false), Cl.uint(6)],
        alice
      );
      expect(errCode(init.result)).toBe(301n);
    });
  });

  // ------------------------------------------------------------------
  describe("STX deposits and receipt shares", () => {
    it("first deposit mints shares 1:1 in base units; the vault's real STX balance moves", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      const vaultStxBefore = stxBalance(contractPrincipal(VAULT));
      const aliceBefore = stxBalance(alice);
      const res = depositStx(id, 10_000_000n, alice);
      expect(expectOk(res.result)).toBeUint(10_000_000);

      expect(stxBalance(contractPrincipal(VAULT)) - vaultStxBefore).toBe(10_000_000n);
      expect(aliceBefore - stxBalance(alice)).toBe(10_000_000n);
      expect(idleBalance(id, ASSET_STX)).toBe(10_000_000n);
      expect(totalBalance(id, ASSET_STX)).toBe(10_000_000n);
      expect(shareBalance(id, ASSET_STX, alice)).toBe(10_000_000n);
      expect(shareSupply(id, ASSET_STX)).toBe(10_000_000n);
      expect(position(id, ASSET_STX, alice)["ownership-bps"]).toBe(10_000n);
    });

    it("STX needs no approved-asset configuration (it is native, not SIP-010) - works before governance bootstraps anything", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 2_000_000n, alice).result);
      expect(shareBalance(id, ASSET_STX, alice)).toBe(2_000_000n);
    });

    it("sBTC deposits are refused until governance has set the approved sBTC asset (no bootstrap in this test)", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY });
      mintSbtc(alice, 1_000_000n);
      expect(errCode(depositSbtc(id, MIN_INITIAL_SBTC, alice).result)).toBe(E.NO_APPROVED_ASSET);
      expect(shareSupply(id, ASSET_SBTC)).toBe(0n);
    });

    it("MULTI-USER: subsequent deposits mint proportional shares (spec example: 10 + 5 => 66.67% / 33.33%)", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      const bobRes = depositStx(id, 5_000_000n, bob);
      expect(expectOk(bobRes.result)).toBeUint(5_000_000);

      expect(shareBalance(id, ASSET_STX, alice)).toBe(10_000_000n);
      expect(shareBalance(id, ASSET_STX, bob)).toBe(5_000_000n);
      expect(shareSupply(id, ASSET_STX)).toBe(15_000_000n);
      expect(totalBalance(id, ASSET_STX)).toBe(15_000_000n);

      const a = position(id, ASSET_STX, alice);
      const b = position(id, ASSET_STX, bob);
      expect(a["ownership-bps"]).toBe(6666n); // 66.66% (floor of 66.67%)
      expect(b["ownership-bps"]).toBe(3333n); // 33.33%
      expect(a.claim).toBe(10_000_000n);
      expect(b.claim).toBe(5_000_000n);
    });

    it("a non-owner cannot deposit into a vault that is not open-deposit", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: false });
      const res = depositStx(id, 5_000_000n, bob);
      expect(errCode(res.result)).toBe(E.DEPOSITS_RESTRICTED);
      expect(shareSupply(id, ASSET_STX)).toBe(0n);
    });

    it("the owner can open and close deposits later; only the owner may", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: false });
      const notOwner = simnet.callPublicFn(VAULT, "set-vault-config", [Cl.uint(id), Cl.stringUtf8("Hijack"), Cl.bool(true)], bob);
      expect(errCode(notOwner.result)).toBe(E.NOT_OWNER);
      expectOk(simnet.callPublicFn(VAULT, "set-vault-config", [Cl.uint(id), Cl.stringUtf8("Renamed"), Cl.bool(true)], alice).result);
      expectOk(depositStx(id, 5_000_000n, bob).result);
      const v = (simnet.callReadOnlyFn(VAULT, "get-vault", [Cl.uint(id)], dep).result as any).value.value;
      expect(v.name.value).toBe("Renamed");
    });

    it("rejects zero amount, a missing vault and a first deposit below the minimum", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expect(errCode(depositStx(id, 0n, alice).result)).toBe(E.ZERO_AMOUNT);
      expect(errCode(depositStx(999, 5_000_000n, alice).result)).toBe(E.VAULT_NOT_FOUND);
      expect(errCode(depositStx(id, MIN_INITIAL_STX - 1n, alice).result)).toBe(E.BELOW_MIN_INITIAL);
      expectOk(depositStx(id, MIN_INITIAL_STX, alice).result);
    });

    it("rejects deposits while the protocol is paused, and while the vault itself is paused", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 5_000_000n, alice).result);

      simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
      expect(errCode(depositStx(id, 1_000_000n, alice).result)).toBe(E.PROTOCOL_PAUSED);
      simnet.callPublicFn("sovereignty-protocol-admin-v4", "unpause-protocol", [], dep);

      expectOk(simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(id)], alice).result);
      expect(errCode(depositStx(id, 1_000_000n, alice).result)).toBe(E.VAULT_PAUSED);
      expectOk(simnet.callPublicFn(VAULT, "unpause-vault", [Cl.uint(id)], alice).result);
      expectOk(depositStx(id, 1_000_000n, alice).result);
    });

    it("only the owner can pause/unpause; double pause and unpausing an active vault are rejected", () => {
      const id = createVault({ owner: alice });
      expect(errCode(simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(id)], bob).result)).toBe(E.NOT_OWNER);
      expect(errCode(simnet.callPublicFn(VAULT, "unpause-vault", [Cl.uint(id)], alice).result)).toBe(E.NOT_PAUSED);
      expectOk(simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(id)], alice).result);
      expect(errCode(simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(id)], alice).result)).toBe(E.ALREADY_PAUSED);
      expect(errCode(simnet.callPublicFn(VAULT, "unpause-vault", [Cl.uint(id)], bob).result)).toBe(E.NOT_OWNER);
    });

    it("holders are indexed on-chain exactly once per vault, on first deposit", () => {
      const v1 = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      const v2 = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      depositStx(v1, 2_000_000n, bob);
      depositStx(v1, 2_000_000n, bob); // second deposit must not duplicate the index entry
      depositStx(v2, 2_000_000n, bob);
      expect(simnet.callReadOnlyFn(VAULT, "get-holder-vault-count", [Cl.principal(bob)], dep).result).toBeUint(2);
      expect(simnet.callReadOnlyFn(VAULT, "get-holder-vault-id", [Cl.principal(bob), Cl.uint(0)], dep).result).toBeSome(Cl.uint(v1));
      expect(simnet.callReadOnlyFn(VAULT, "get-holder-vault-id", [Cl.principal(bob), Cl.uint(1)], dep).result).toBeSome(Cl.uint(v2));
      expect(simnet.callReadOnlyFn(VAULT, "get-holder-vault-count", [Cl.principal(carol)], dep).result).toBeUint(0);
    });
  });

  // ------------------------------------------------------------------
  describe("share pricing math (pure functions, arbitrary pool states)", () => {
    const shares = (supply: number, total: number, amount: number, min = 1) =>
      simnet.callReadOnlyFn(VAULT, "compute-deposit-shares", [Cl.uint(supply), Cl.uint(total), Cl.uint(amount), Cl.uint(min)], deployer()).result;
    const payout = (sh: number, supply: number, total: number) =>
      simnet.callReadOnlyFn(VAULT, "compute-redeem-assets", [Cl.uint(sh), Cl.uint(supply), Cl.uint(total)], deployer()).result;

    it("SPEC EXAMPLE 41: pool 120 for 100 shares (price 1.2), deposit 12 => 10 shares, NOT 12", () => {
      expect(expectOk(shares(100, 120, 12))).toBeUint(10);
    });

    it("price 1.0: proportional to current NAV", () => {
      expect(expectOk(shares(1000, 1000, 250))).toBeUint(250);
    });

    it("price < 1 (pool lost value): depositor receives MORE shares per unit", () => {
      expect(expectOk(shares(100, 50, 10))).toBeUint(20);
    });

    it("ROUNDING: minting floors (pool's favour) - never a free share", () => {
      // 4 * 3 / 10 = 1.2 -> 1
      expect(expectOk(shares(3, 10, 4))).toBeUint(1);
      // 1 * 3 / 10 = 0.3 -> 0 -> rejected rather than minting a free/zero position
      expect(errCode(shares(3, 10, 1))).toBe(E.ZERO_SHARES);
      // exact boundary: 10 * 3 / 10 = 3
      expect(expectOk(shares(3, 10, 10))).toBeUint(3);
    });

    it("ROUNDING: redemption floors (pool's favour) - never a free unit", () => {
      // 1 * 10 / 3 = 3.33 -> 3
      expect(expectOk(payout(1, 3, 10))).toBeUint(3);
      // 3 shares of 3 => everything
      expect(expectOk(payout(3, 3, 10))).toBeUint(10);
      // dust: 1 share of 1000 in a pool of 999 => 0.999 -> 0 -> rejected
      expect(errCode(payout(1, 1000, 999))).toBe(E.ZERO_REDEMPTION);
    });

    it("mint-then-redeem round trip can never return more than was put in (boundary grid)", () => {
      const supplies = [1, 2, 3, 5, 7, 10];
      const totals = [1, 2, 3, 7, 10, 13, 20, 40];
      const amounts = [1, 2, 3, 5, 9, 14, 30];
      let checked = 0;
      for (const supply of supplies) {
        for (const total of totals) {
          for (const amount of amounts) {
            const r = shares(supply, total, amount) as any;
            if (r.type !== "ok") continue;
            const minted = Number(r.value.value);
            const back = payout(minted, supply + minted, total + amount) as any;
            if (back.type !== "ok") continue; // zero-redemption dust is simply rejected
            expect(Number(back.value.value)).toBeLessThanOrEqual(amount);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(100);
    }, 60_000);

    it("a pool with supply but zero assets, or assets but zero supply, is treated as insolvent (deposits refused)", () => {
      expect(errCode(shares(100, 0, 10))).toBe(E.VAULT_INSOLVENT);
      expect(errCode(shares(0, 5, 10))).toBe(E.VAULT_INSOLVENT);
    });

    it("first deposit needs the minimum; zero amount is always rejected", () => {
      expect(errCode(shares(0, 0, 999, 1000))).toBe(E.BELOW_MIN_INITIAL);
      expect(expectOk(shares(0, 0, 1000, 1000))).toBeUint(1000);
      expect(errCode(shares(0, 0, 0, 1))).toBe(E.ZERO_AMOUNT);
    });

    it("redeeming more shares than exist is rejected", () => {
      expect(errCode(payout(11, 10, 100))).toBe(E.INSUFFICIENT_SHARES);
      expect(errCode(payout(1, 0, 0))).toBe(E.INSUFFICIENT_SHARES);
    });
  });

  // ------------------------------------------------------------------
  describe("first-depositor and donation/inflation attacks", () => {
    it("an unsolicited direct STX transfer to the vault does NOT change the share price (accounting is internal)", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(id, MIN_INITIAL_STX, alice).result);

      // attacker "donates" 1,000 STX straight to the contract, bypassing deposit-stx
      const before = stxBalance(contractPrincipal(VAULT));
      simnet.transferSTX(1_000_000_000n, contractPrincipal(VAULT), alice);
      expect(stxBalance(contractPrincipal(VAULT)) - before).toBe(1_000_000_000n);

      // pool accounting is untouched
      expect(totalBalance(id, ASSET_STX)).toBe(MIN_INITIAL_STX);
      expect(shareSupply(id, ASSET_STX)).toBe(MIN_INITIAL_STX);

      // victim deposits and gets the fair number of shares (1:1), not rounded to zero
      const victim = depositStx(id, MIN_INITIAL_STX, bob);
      expect(expectOk(victim.result)).toBeUint(MIN_INITIAL_STX);
      expect(shareBalance(id, ASSET_STX, bob)).toBe(MIN_INITIAL_STX);
    });

    it("classic ERC-4626 first-depositor attack fails: attacker cannot steal the victim's deposit", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      // attacker mints the minimum, then donates a large amount to inflate the price
      expectOk(depositStx(id, MIN_INITIAL_STX, alice).result);
      simnet.transferSTX(5_000_000_000n, contractPrincipal(VAULT), alice);

      // victim deposits the same size the attacker used
      expectOk(depositStx(id, MIN_INITIAL_STX, bob).result);
      const victimShares = shareBalance(id, ASSET_STX, bob);
      expect(victimShares).toBeGreaterThan(0n);

      // victim redeems everything and gets exactly what they put in
      const bobBefore = stxBalance(bob);
      expectOk(redeemStx(id, victimShares, bob).result);
      expect(stxBalance(bob) - bobBefore).toBe(MIN_INITIAL_STX);
      // attacker's own position is unchanged: they gained nothing from the donation
      expect(position(id, ASSET_STX, alice).claim).toBe(MIN_INITIAL_STX);
    });

    it("dust first deposit (1 base unit) is rejected so the pool cannot start in a degenerate state", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expect(errCode(depositStx(id, 1n, alice).result)).toBe(E.BELOW_MIN_INITIAL);
    });
  });

  // ------------------------------------------------------------------
  describe("redemption", () => {
    it("full redemption burns all shares and returns the real STX to the holder", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      const before = stxBalance(alice);
      const res = redeemStx(id, 10_000_000n, alice);
      expect(expectOk(res.result)).toBeUint(10_000_000);
      expect(stxBalance(alice) - before).toBe(10_000_000n);
      expect(shareBalance(id, ASSET_STX, alice)).toBe(0n);
      expect(shareSupply(id, ASSET_STX)).toBe(0n);
      expect(totalBalance(id, ASSET_STX)).toBe(0n);
      expect(idleBalance(id, ASSET_STX)).toBe(0n);
      // the pool can be re-seeded after a full exit (supply==0 && total==0 is a clean state)
      expectOk(depositStx(id, MIN_INITIAL_STX, alice).result);
    });

    it("partial redemption pays the proportional amount", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      const res = redeemStx(id, 2_500_000n, alice);
      expect(expectOk(res.result)).toBeUint(2_500_000);
      expect(shareBalance(id, ASSET_STX, alice)).toBe(7_500_000n);
      expect(totalBalance(id, ASSET_STX)).toBe(7_500_000n);
      expect(position(id, ASSET_STX, alice)["ownership-bps"]).toBe(10_000n);
    });

    it("MULTI-USER: one holder's redemption never changes another holder's claim", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      expectOk(depositStx(id, 5_000_000n, bob).result);
      const bobBefore = position(id, ASSET_STX, bob);

      expectOk(redeemStx(id, 10_000_000n, alice).result);

      const bobAfter = position(id, ASSET_STX, bob);
      expect(bobAfter.shares).toBe(bobBefore.shares);
      expect(bobAfter.claim).toBe(5_000_000n); // his 5 STX, untouched
      expect(bobAfter["ownership-bps"]).toBe(10_000n); // now the sole holder
      expect(totalBalance(id, ASSET_STX)).toBe(5_000_000n);
    });

    it("a user cannot redeem another user's shares (burn is always from tx-sender)", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      const res = redeemStx(id, 1_000_000n, bob); // bob holds nothing
      expect(errCode(res.result)).toBe(E.INSUFFICIENT_SHARES);
      expect(shareBalance(id, ASSET_STX, alice)).toBe(10_000_000n);
    });

    it("the vault OWNER has no privileged withdrawal: they can only redeem their own shares", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(id, 10_000_000n, bob).result); // bob funds alice's vault
      // alice (owner, zero shares) cannot pull bob's funds out
      expect(errCode(redeemStx(id, 1_000_000n, alice).result)).toBe(E.INSUFFICIENT_SHARES);
      expect(idleBalance(id, ASSET_STX)).toBe(10_000_000n);
    });

    it("cannot redeem more shares than owned, zero shares, or from a missing vault", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 5_000_000n, alice).result);
      expect(errCode(redeemStx(id, 5_000_001n, alice).result)).toBe(E.INSUFFICIENT_SHARES);
      expect(errCode(redeemStx(id, 0n, alice).result)).toBe(E.ZERO_AMOUNT);
      expect(errCode(redeemStx(404, 1n, alice).result)).toBe(E.VAULT_NOT_FOUND);
    });

    it("redemption is NEVER blocked by protocol pause or vault pause (non-custodial guarantee)", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 10_000_000n, alice).result);
      simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
      simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(id)], alice);
      const before = stxBalance(alice);
      expectOk(redeemStx(id, 4_000_000n, alice).result);
      expect(stxBalance(alice) - before).toBe(4_000_000n);
    });

    it("receipt shares are NON-TRANSFERABLE: neither the holder nor anyone else can move them", () => {
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      expectOk(depositStx(id, 5_000_000n, alice).result);
      const t = simnet.callPublicFn(
        RECEIPTS,
        "transfer",
        [Cl.uint(id), Cl.stringAscii(ASSET_STX), Cl.uint(1_000_000), Cl.principal(alice), Cl.principal(bob)],
        alice
      );
      expect(errCode(t.result)).toBe(E.NON_TRANSFERABLE);
      expect(shareBalance(id, ASSET_STX, bob)).toBe(0n);
    });
  });

  // ------------------------------------------------------------------
  describe("sBTC (real testnet SIP-010 token)", () => {
    beforeEach(() => bootstrapProtocol());

    it("deposit moves REAL sBTC into the vault and mints shares; redeem returns it", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY });
      mintSbtc(alice, 50_000_000n);
      const before = sbtcBalance(alice);
      const res = depositSbtc(id, 20_000_000n, alice);
      expect(expectOk(res.result)).toBeUint(20_000_000);
      expect(before - sbtcBalance(alice)).toBe(20_000_000n);
      expect(sbtcBalance(contractPrincipal(VAULT))).toBe(20_000_000n);
      expect(shareBalance(id, ASSET_SBTC, alice)).toBe(20_000_000n);

      const back = redeemSbtc(id, 20_000_000n, alice);
      expect(expectOk(back.result)).toBeUint(20_000_000);
      expect(sbtcBalance(alice)).toBe(before);
      expect(sbtcBalance(contractPrincipal(VAULT))).toBe(0n);
    });

    it("multi-user sBTC shares are proportional", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY, openDeposits: true });
      mintSbtc(alice, 100_000_000n);
      mintSbtc(bob, 100_000_000n);
      expectOk(depositSbtc(id, 75_000_000n, alice).result);
      expectOk(depositSbtc(id, 25_000_000n, bob).result);
      expect(position(id, ASSET_SBTC, alice)["ownership-bps"]).toBe(7500n);
      expect(position(id, ASSET_SBTC, bob)["ownership-bps"]).toBe(2500n);
    });

    it("rejects a deposit using a SIP-010 contract that is not the approved asset", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY });
      const fake = FAKE_TOKEN_SOURCE;
      simnet.deployContract("unapproved-token", fake, null, dep);
      const res = simnet.callPublicFn(
        VAULT,
        "deposit-sbtc",
        [Cl.uint(id), Cl.uint(100_000), Cl.principal(`${dep}.unapproved-token`)],
        alice
      );
      expect(errCode(res.result)).toBe(E.WRONG_ASSET);
      expect(shareSupply(id, ASSET_SBTC)).toBe(0n);
    });

    it("cannot redeem sBTC shares you do not hold, or against an unapproved token", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY, openDeposits: true });
      mintSbtc(alice, 10_000_000n);
      expectOk(depositSbtc(id, 10_000_000n, alice).result);
      expect(errCode(redeemSbtc(id, 1_000n, bob).result)).toBe(E.INSUFFICIENT_SHARES);
    });

    it("first sBTC deposit below the minimum is rejected", () => {
      const id = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY });
      mintSbtc(alice, 1_000_000n);
      expect(errCode(depositSbtc(id, MIN_INITIAL_SBTC - 1n, alice).result)).toBe(E.BELOW_MIN_INITIAL);
      expectOk(depositSbtc(id, MIN_INITIAL_SBTC, alice).result);
    });
  });

  // ------------------------------------------------------------------
  describe("supported assets and multi-asset accounting (separate share classes)", () => {
    beforeEach(() => bootstrapProtocol());

    it("an STX-only vault rejects sBTC deposits and vice versa", () => {
      const stxVault = createVault({ owner: alice, assets: ASSETS_STX_ONLY });
      const sbtcVault = createVault({ owner: alice, assets: ASSETS_SBTC_ONLY });
      mintSbtc(alice, 10_000_000n);
      expect(errCode(depositSbtc(stxVault, 1_000_000n, alice).result)).toBe(E.ASSET_NOT_SUPPORTED);
      expect(errCode(depositStx(sbtcVault, 5_000_000n, alice).result)).toBe(E.ASSET_NOT_SUPPORTED);
    });

    it("in a dual-asset vault, STX and sBTC are independent pools with independent share classes", () => {
      const id = createVault({ owner: alice, assets: ASSETS_BOTH, openDeposits: true });
      mintSbtc(alice, 10_000_000n);
      mintSbtc(bob, 10_000_000n);
      expectOk(depositStx(id, 100_000_000n, alice).result); // 100 STX
      expectOk(depositSbtc(id, 1_000_000n, bob).result); // 0.01 sBTC

      // raw units are NEVER added together or cross-valued
      expect(totalBalance(id, ASSET_STX)).toBe(100_000_000n);
      expect(totalBalance(id, ASSET_SBTC)).toBe(1_000_000n);
      expect(shareSupply(id, ASSET_STX)).toBe(100_000_000n);
      expect(shareSupply(id, ASSET_SBTC)).toBe(1_000_000n);
      // alice holds no sBTC shares, bob holds no STX shares
      expect(shareBalance(id, ASSET_SBTC, alice)).toBe(0n);
      expect(shareBalance(id, ASSET_STX, bob)).toBe(0n);

      // a later sBTC deposit is priced against the sBTC pool only
      mintSbtc(alice, 10_000_000n);
      const res = depositSbtc(id, 500_000n, alice);
      expect(expectOk(res.result)).toBeUint(500_000);
      expect(position(id, ASSET_STX, alice)["ownership-bps"]).toBe(10_000n);
      expect(position(id, ASSET_SBTC, bob)["ownership-bps"]).toBe(6666n);

      // redeeming STX shares leaves the sBTC pool untouched
      expectOk(redeemStx(id, 100_000_000n, alice).result);
      expect(totalBalance(id, ASSET_SBTC)).toBe(1_500_000n);
      expect(shareSupply(id, ASSET_SBTC)).toBe(1_500_000n);
    });
  });

  // ------------------------------------------------------------------
  describe("MULTI-VAULT isolation", () => {
    it("Conservative / Business / DAO: activity in one vault never touches the others", () => {
      const v1 = createVault({ owner: alice, name: "Conservative", purpose: PURPOSE.conservative, assets: ASSETS_STX_ONLY });
      const v2 = createVault({ owner: alice, name: "Business", purpose: PURPOSE.business, assets: ASSETS_STX_ONLY });
      const v3 = createVault({ owner: alice, name: "DAO", purpose: PURPOSE.dao, assets: ASSETS_STX_ONLY });

      const snapshot = (id: bigint) => ({
        idle: idleBalance(id, ASSET_STX),
        total: totalBalance(id, ASSET_STX),
        supply: shareSupply(id, ASSET_STX),
        aliceShares: shareBalance(id, ASSET_STX, alice),
      });
      const zero = { idle: 0n, total: 0n, supply: 0n, aliceShares: 0n };

      expectOk(depositStx(v1, 10_000_000n, alice).result);
      expect(snapshot(v1)).toEqual({ idle: 10_000_000n, total: 10_000_000n, supply: 10_000_000n, aliceShares: 10_000_000n });
      expect(snapshot(v2)).toEqual(zero);
      expect(snapshot(v3)).toEqual(zero);

      expectOk(depositStx(v2, 3_000_000n, alice).result);
      expect(snapshot(v1)).toEqual({ idle: 10_000_000n, total: 10_000_000n, supply: 10_000_000n, aliceShares: 10_000_000n });
      expect(snapshot(v2)).toEqual({ idle: 3_000_000n, total: 3_000_000n, supply: 3_000_000n, aliceShares: 3_000_000n });
      expect(snapshot(v3)).toEqual(zero);

      // shares of vault #2 cannot be redeemed against vault #3
      expect(errCode(redeemStx(v3, 1_000_000n, alice).result)).toBe(E.INSUFFICIENT_SHARES);
      // ...and redeeming from #1 leaves #2 exactly as it was
      expectOk(redeemStx(v1, 10_000_000n, alice).result);
      expect(snapshot(v2)).toEqual({ idle: 3_000_000n, total: 3_000_000n, supply: 3_000_000n, aliceShares: 3_000_000n });
    });

    it("each vault prices its own shares independently (different NAV per share never leaks across vaults)", () => {
      const a = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      const b = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      expectOk(depositStx(a, 10_000_000n, alice).result);
      expectOk(depositStx(b, 2_000_000n, alice).result);
      expectOk(depositStx(a, 5_000_000n, bob).result);
      expectOk(depositStx(b, 2_000_000n, bob).result);
      expect(position(a, ASSET_STX, bob)["ownership-bps"]).toBe(3333n);
      expect(position(b, ASSET_STX, bob)["ownership-bps"]).toBe(5000n);
    });

    it("two different owners' vaults are isolated, and one cannot configure the other's", () => {
      const av = createVault({ owner: alice });
      const bv = createVault({ owner: bob });
      const res = simnet.callPublicFn(
        VAULT,
        "set-risk-config",
        [Cl.uint(bv), Cl.uint(3000), Cl.uint(1), Cl.uint(1), Cl.uint(50), Cl.uint(500), Cl.bool(true), Cl.uint(6)],
        alice
      );
      expect(errCode(res.result)).toBe(E.NOT_OWNER);
      expect(av).not.toBe(bv);
    });
  });

  // ------------------------------------------------------------------
  describe("risk configuration and autonomy", () => {
    it("the owner can update risk parameters within protocol ceilings", () => {
      const id = createVault({ owner: alice });
      const res = simnet.callPublicFn(
        VAULT,
        "set-risk-config",
        [Cl.uint(id), Cl.uint(4000), Cl.uint(500_000_000), Cl.uint(50_000_000), Cl.uint(100), Cl.uint(2000), Cl.bool(true), Cl.uint(50)],
        alice
      );
      expectOk(res.result);
      const cfg = (simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(id)], dep).result as any).value.value;
      expect(BigInt(cfg["max-exposure-bps"].value)).toBe(4000n);
      expect(BigInt(cfg["min-idle-bps"].value)).toBe(2000n);
      expect(cfg["autonomous-enabled"].type).toBe("true");
    });

    it("rejects out-of-bounds updates, and non-owners cannot update", () => {
      const id = createVault({ owner: alice });
      const bad = simnet.callPublicFn(
        VAULT,
        "set-risk-config",
        [Cl.uint(id), Cl.uint(9000), Cl.uint(1), Cl.uint(1), Cl.uint(50), Cl.uint(500), Cl.bool(true), Cl.uint(6)],
        alice
      );
      expect(errCode(bad.result)).toBe(E.INVALID_PARAMS);
      const stranger = simnet.callPublicFn(
        VAULT,
        "set-risk-config",
        [Cl.uint(id), Cl.uint(3000), Cl.uint(1), Cl.uint(1), Cl.uint(50), Cl.uint(500), Cl.bool(true), Cl.uint(6)],
        bob
      );
      expect(errCode(stranger.result)).toBe(E.NOT_OWNER);
    });

    it("autonomous mode can be toggled by the owner only", () => {
      const id = createVault({ owner: alice, autonomous: false });
      expect(errCode(simnet.callPublicFn(VAULT, "set-autonomous-mode", [Cl.uint(id), Cl.bool(true)], bob).result)).toBe(E.NOT_OWNER);
      expectOk(simnet.callPublicFn(VAULT, "set-autonomous-mode", [Cl.uint(id), Cl.bool(true)], alice).result);
      const cfg = (simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(id)], dep).result as any).value.value;
      expect(cfg["autonomous-enabled"].type).toBe("true");
      // and directly against risk-guard it is refused (only the vault contract may call)
      const direct = simnet.callPublicFn(RISK, "set-autonomous-enabled", [Cl.uint(id), Cl.bool(false)], alice);
      expect(errCode(direct.result)).toBe(301n);
    });
  });

  // ------------------------------------------------------------------
  describe("accounting invariants (randomised operation sequences)", () => {
    // Deterministic PRNG so failures are reproducible.
    function rng(seed: number) {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    }

    it("sum(user shares) == supply, total == deposits - redemptions, no user ever redeems more than their claim", () => {
      const rand = rng(42);
      const users = [alice, bob, carol];
      const id = createVault({ owner: alice, assets: ASSETS_STX_ONLY, openDeposits: true });
      let deposited = 0n;
      let redeemed = 0n;

      for (let step = 0; step < 60; step++) {
        const user = users[Math.floor(rand() * users.length)];
        if (rand() < 0.6) {
          const amount = BigInt(1_000_000 + Math.floor(rand() * 9_000_000));
          const res = depositStx(id, amount, user);
          if (res.result.type === "ok") deposited += amount;
        } else {
          const held = shareBalance(id, ASSET_STX, user);
          if (held === 0n) continue;
          const shares = 1n + BigInt(Math.floor(rand() * Number(held)));
          const claimBefore = (shares * totalBalance(id, ASSET_STX)) / shareSupply(id, ASSET_STX);
          const userBefore = stxBalance(user);
          const res = redeemStx(id, shares, user);
          if (res.result.type === "ok") {
            const got = stxBalance(user) - userBefore;
            expect(got).toBeLessThanOrEqual(claimBefore); // never more than the proportional entitlement
            redeemed += got;
          }
        }
        const supply = shareSupply(id, ASSET_STX);
        const sum = users.reduce((s, u) => s + shareBalance(id, ASSET_STX, u), 0n);
        expect(sum).toBe(supply);
        expect(totalBalance(id, ASSET_STX)).toBe(deposited - redeemed);
        expect(idleBalance(id, ASSET_STX)).toBe(deposited - redeemed);
        // the contract really holds what the books say it does
        expect(stxBalance(contractPrincipal(VAULT))).toBe(totalBalance(id, ASSET_STX));
      }
    });
  });
});
