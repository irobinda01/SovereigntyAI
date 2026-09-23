import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  accounts,
  deployer,
  VAULT,
  RISK,
  ENGINE,
  ASSET_STX,
  ASSET_SBTC,
  ASSETS_BOTH,
  bootstrapProtocol,
  mintSbtc,
  createVault,
  depositStx,
  depositSbtc,
  errCode,
  expectOk,
  idleBalance,
  totalBalance,
  shareSupply,
  shareBalance,
  setupApprovedMockStrategy,
  type Asset,
} from "./helpers";

// Verifies the TESTNET EXECUTION GATE end to end, at the protocol layer:
//   analysis / recommendation / intent / risk validation  -> ENABLED
//   strategy execution                                    -> DISABLED (Testnet)
// The simnet chain-id is the Testnet chain-id, exactly like the real
// Testnet the contracts are deployed to, so these tests exercise the same
// predicate a real Testnet deployment evaluates.
//
// The post-gate (mainnet-only) branch is covered separately by
// tests/mainnet-path.test.ts.
describe("testnet execution gate", () => {
  let dep: string;
  let owner: string;
  let aiExecutor: string;
  let stranger: string;
  let stxStrategy: { strategyId: bigint; mockStrategyId: string };
  let sbtcStrategy: { strategyId: bigint; mockStrategyId: string };
  let vaultId: bigint;

  beforeEach(() => {
    dep = deployer();
    owner = accounts().get("wallet_1")!;
    aiExecutor = accounts().get("wallet_2")!;
    stranger = accounts().get("wallet_3")!;
    bootstrapProtocol();
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(aiExecutor), Cl.stringAscii("ai-executor")], dep);
    stxStrategy = setupApprovedMockStrategy(dep, dep, ASSET_STX);
    sbtcStrategy = setupApprovedMockStrategy(dep, dep, ASSET_SBTC);

    vaultId = createVault({ owner, assets: ASSETS_BOTH, autonomous: true, openDeposits: true, maxExposureBps: 3000 });
    expectOk(depositStx(vaultId, 100_000_000n, owner).result); // 100 STX
    mintSbtc(owner, 1_000_000_000n);
    expectOk(depositSbtc(vaultId, 100_000_000n, owner).result); // 1 sBTC
  });

  interface Intent {
    asset?: Asset;
    strategy?: { strategyId: bigint; mockStrategyId: string };
    destStrategyId?: bigint;
    amount?: bigint;
    slippage?: number;
    nonce?: number;
    deadline?: number;
    vault?: bigint;
  }

  function args(i: Intent) {
    const asset = i.asset ?? ASSET_STX;
    const strategy = i.strategy ?? (asset === ASSET_STX ? stxStrategy : sbtcStrategy);
    return {
      base: [
        Cl.uint(i.vault ?? vaultId),
        Cl.uint(i.destStrategyId ?? strategy.strategyId),
        Cl.stringAscii(asset),
        Cl.uint(i.amount ?? 10_000_000n),
        Cl.uint(i.slippage ?? 50),
        Cl.uint(i.nonce ?? 1),
        Cl.uint(i.deadline ?? simnet.blockHeight + 100),
      ],
      strategyPrincipal: strategy.mockStrategyId,
    };
  }

  const evaluate = (sender: string, i: Intent = {}) =>
    simnet.callReadOnlyFn(ENGINE, "evaluate-rebalance-intent", args(i).base, sender).result;

  const submit = (sender: string, i: Intent = {}) => {
    const a = args(i);
    const [addr, name] = a.strategyPrincipal.split(".");
    return simnet.callPublicFn(ENGINE, "submit-rebalance-intent", [...a.base, Cl.contractPrincipal(addr, name)], sender).result;
  };

  // -------------------------------------------------------------- environment
  it("the protocol reports its execution environment as TESTNET with strategy execution disabled", () => {
    const env = (simnet.callReadOnlyFn(RISK, "get-execution-environment", [], dep).result as any).value;
    expect(env.network.value).toBe("TESTNET");
    expect(env["strategy-execution-enabled"].type).toBe("false");
    expect(env["mainnet-execution-armed"].type).toBe("false");
    expect(simnet.callReadOnlyFn(RISK, "is-mainnet-chain", [], dep).result).toBeBool(false);
    expect(simnet.callReadOnlyFn(RISK, "is-strategy-execution-enabled", [], dep).result).toBeBool(false);
  });

  it("NO ONE can enable strategy execution on Testnet: not the admin, not a stranger, not the AI", () => {
    expect(errCode(simnet.callPublicFn(RISK, "set-mainnet-execution-armed", [Cl.bool(true)], dep).result)).toBe(321n); // admin: mainnet only
    expect(errCode(simnet.callPublicFn(RISK, "set-mainnet-execution-armed", [Cl.bool(true)], stranger).result)).toBe(300n);
    expect(errCode(simnet.callPublicFn(RISK, "set-mainnet-execution-armed", [Cl.bool(true)], aiExecutor).result)).toBe(300n);
    expect(simnet.callReadOnlyFn(RISK, "is-strategy-execution-enabled", [], dep).result).toBeBool(false);
  });

  // ------------------------------------------- analysis / validation still work
  it("risk validation of a valid intent PASSES on-chain (read-only), and reports execution as NOT enabled", () => {
    for (const sender of [owner, aiExecutor]) {
      const res = evaluate(sender);
      const v = expectOk(res);
      expect(v.value["risk-validation-passed"].type).toBe("true");
      expect(v.value["strategy-execution-enabled"].type).toBe("false");
    }
    expect((expectOk(evaluate(owner)) as any).value["caller-is-owner"].type).toBe("true");
    expect((expectOk(evaluate(aiExecutor)) as any).value["caller-is-owner"].type).toBe("false");
  });

  it("evaluation is a pure read: it consumes no nonce, starts no cooldown and moves nothing", () => {
    const before = simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(vaultId)], dep).result;
    evaluate(aiExecutor);
    evaluate(aiExecutor);
    expect(simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(vaultId)], dep).result).toEqual(before);
  });

  // ------------------------------------------------------------ the gate itself
  it("a fully valid intent submitted by the AI executor is BLOCKED with the testnet error and changes nothing", () => {
    const idleBefore = idleBalance(vaultId, ASSET_STX);
    const totalBefore = totalBalance(vaultId, ASSET_STX);
    const cfgBefore = simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(vaultId)], dep).result;

    expect(errCode(submit(aiExecutor))).toBe(208n);

    expect(idleBalance(vaultId, ASSET_STX)).toBe(idleBefore);
    expect(totalBalance(vaultId, ASSET_STX)).toBe(totalBefore);
    expect(simnet.callReadOnlyFn(VAULT, "get-strategy-allocation", [Cl.uint(vaultId), Cl.uint(stxStrategy.strategyId), Cl.stringAscii("STX")], dep).result).toBeUint(0);
    // nonce NOT consumed, cooldown NOT started: the blocked attempt left no trace
    expect(simnet.callReadOnlyFn(RISK, "get-vault-config", [Cl.uint(vaultId)], dep).result).toEqual(cfgBefore);
    // the same nonce is therefore still usable for a valid evaluation
    expectOk(evaluate(aiExecutor));
  });

  it("the OWNER is blocked too (the gate is environmental, not a permissions rule) - even for sBTC", () => {
    expect(errCode(submit(owner))).toBe(208n);
    expect(errCode(submit(owner, { asset: ASSET_SBTC, amount: 10_000_000n }))).toBe(208n);
    expect(errCode(submit(aiExecutor, { asset: ASSET_SBTC, amount: 10_000_000n }))).toBe(208n);
  });

  it("receipt shares and pool totals are untouched by a blocked intent (receipts = ownership, allocation = deployment)", () => {
    const supply = shareSupply(vaultId, ASSET_STX);
    const held = shareBalance(vaultId, ASSET_STX, owner);
    submit(aiExecutor);
    submit(owner);
    expect(shareSupply(vaultId, ASSET_STX)).toBe(supply);
    expect(shareBalance(vaultId, ASSET_STX, owner)).toBe(held);
    expect(totalBalance(vaultId, ASSET_STX)).toBe(100_000_000n);
  });

  it("the vault's own execute-rebalance is unreachable directly (engine-only) and independently gated", () => {
    const [addr, name] = stxStrategy.mockStrategyId.split(".");
    for (const sender of [owner, aiExecutor, stranger, dep]) {
      const res = simnet.callPublicFn(
        VAULT,
        "execute-rebalance",
        [Cl.uint(vaultId), Cl.uint(stxStrategy.strategyId), Cl.stringAscii("STX"), Cl.uint(1_000_000), Cl.contractPrincipal(addr, name)],
        sender
      );
      expect(errCode(res.result)).toBe(107n);
    }
    expect(idleBalance(vaultId, ASSET_STX)).toBe(100_000_000n);
  });

  it("risk-guard's record function is engine-only: nobody can consume a nonce or start a cooldown directly", () => {
    const res = simnet.callPublicFn(
      RISK,
      "validate-and-record-intent",
      [Cl.uint(vaultId), Cl.stringAscii("STX"), Cl.uint(1), Cl.uint(50), Cl.uint(1), Cl.uint(simnet.blockHeight + 10), Cl.bool(true), Cl.uint(100), Cl.uint(100), Cl.uint(0), Cl.uint(10000)],
      aiExecutor
    );
    expect(errCode(res.result)).toBe(302n);
  });

  // ------------------------------------- every real rule still surfaces first
  // (evaluate and submit must agree: a violation is reported with its own
  // specific code, never masked by the testnet gate)
  const rejections: Array<[string, (self: any) => Intent, bigint]> = [
    ["exposure above the vault's configured cap", () => ({ amount: 35_000_000n }), 312n],
    ["an amount above the max transaction size", () => ({ amount: 2_000_000_000n }), 311n],
    ["slippage above the configured maximum", () => ({ slippage: 51 }), 314n],
    ["an already-passed deadline", () => ({ deadline: 0 }), 307n],
    ["a non-increasing nonce (0 is never valid)", () => ({ nonce: 0 }), 308n],
    ["a zero amount", () => ({ amount: 0n }), 310n],
    ["IDLE (strategy 0) as destination", () => ({ destStrategyId: 0n }), 203n],
    ["an unknown/inactive strategy", () => ({ destStrategyId: 999n }), 202n],
    ["an asset that does not match the strategy's registered asset", (s) => ({ asset: ASSET_SBTC, strategy: s.stx }), 205n],
    ["an invalid asset tag", () => ({ asset: "DOGE" as Asset }), 204n],
    ["a vault that does not exist", () => ({ vault: 999n }), 200n],
    ["more than the vault's idle balance", () => ({ amount: 200_000_000n }), 315n],
  ];

  for (const [label, build, code] of rejections) {
    it(`rejects ${label} with error ${code} - on-chain evaluation and submission agree`, () => {
      const intent = build({ stx: stxStrategy });
      expect(errCode(evaluate(aiExecutor, intent))).toBe(code);
      expect(errCode(submit(aiExecutor, intent))).toBe(code);
    });
  }

  it("rejects the aggregate idle-liquidity floor (vault-level min-idle) with 316", () => {
    // owner requires 80% idle; 30 STX allocation would leave 70% idle
    simnet.callPublicFn(
      VAULT,
      "set-risk-config",
      [Cl.uint(vaultId), Cl.uint(5000), Cl.uint(1_000_000_000n), Cl.uint(100_000_000n), Cl.uint(50), Cl.uint(8000), Cl.bool(true), Cl.uint(6)],
      owner
    );
    expect(errCode(evaluate(aiExecutor, { amount: 30_000_000n }))).toBe(316n);
    expect(errCode(submit(aiExecutor, { amount: 30_000_000n }))).toBe(316n);
    // 20 STX leaves exactly 80% idle -> passes risk validation
    expectOk(evaluate(aiExecutor, { amount: 20_000_000n }));
  });

  it("rejects an unregistered executor (201) and an executor when autonomous mode is off (306), but not the owner", () => {
    expect(errCode(evaluate(stranger))).toBe(201n);
    expect(errCode(submit(stranger))).toBe(201n);
    simnet.callPublicFn(VAULT, "set-autonomous-mode", [Cl.uint(vaultId), Cl.bool(false)], owner);
    expect(errCode(evaluate(aiExecutor))).toBe(306n);
    expect(errCode(submit(aiExecutor))).toBe(306n);
    // owner's own intent still validates (manual approval flow)
    expectOk(evaluate(owner));
    // ...and is still blocked from execution on Testnet
    expect(errCode(submit(owner))).toBe(208n);
  });

  it("rejects everything for a paused vault (206) and while the protocol is paused (303)", () => {
    simnet.callPublicFn(VAULT, "pause-vault", [Cl.uint(vaultId)], owner);
    expect(errCode(evaluate(aiExecutor))).toBe(206n);
    simnet.callPublicFn(VAULT, "unpause-vault", [Cl.uint(vaultId)], owner);
    simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
    expect(errCode(evaluate(aiExecutor))).toBe(303n);
    expect(errCode(submit(aiExecutor))).toBe(303n);
  });

  it("rejects an asset the vault does not support (207)", () => {
    const stxOnly = createVault({ owner, assets: 1, autonomous: true });
    expectOk(depositStx(stxOnly, 10_000_000n, owner).result);
    expect(errCode(evaluate(aiExecutor, { vault: stxOnly, asset: ASSET_SBTC }))).toBe(207n);
  });

  it("an AI executor whose registration was revoked can no longer even pass validation", () => {
    expectOk(evaluate(aiExecutor));
    simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(aiExecutor)], dep);
    expect(errCode(evaluate(aiExecutor))).toBe(201n);
  });
});
