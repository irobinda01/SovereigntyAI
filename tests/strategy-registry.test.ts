import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import { accounts, deployer, deployMockStrategy, ASSET_SBTC } from "./helpers";

describe("strategy-registry-v6", () => {
  let dep: string;
  let wallet1: string;

  beforeEach(() => {
    dep = deployer();
    wallet1 = accounts().get("wallet_1")!;
  });

  it("strategy id 0 (IDLE) is always active and needs no registration", () => {
    const res = simnet.callReadOnlyFn("strategy-registry-v6", "is-strategy-active", [Cl.uint(0)], dep);
    expect(res.result).toBeBool(true);
  });

  it("MVP ships with zero registered strategies", () => {
    const res = simnet.callReadOnlyFn("strategy-registry-v6", "is-strategy-active", [Cl.uint(1)], dep);
    expect(res.result).toBeBool(false);
  });

  it("non-admin cannot register a strategy", () => {
    deployMockStrategy(dep);
    const res = simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii(ASSET_SBTC), Cl.uint(5000)],
      wallet1
    );
    expect(res.result).toBeErr(Cl.uint(400));
  });

  it("rejects an invalid asset tag", () => {
    deployMockStrategy(dep);
    const res = simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii("DOGE"), Cl.uint(5000)],
      dep
    );
    expect(res.result).toBeErr(Cl.uint(404));
  });

  it("admin registers a strategy inactive by default; activation is a separate step", () => {
    deployMockStrategy(dep);
    const reg = simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii(ASSET_SBTC), Cl.uint(5000)],
      dep
    );
    expect(reg.result).toBeOk(Cl.uint(1));
    expect(simnet.callReadOnlyFn("strategy-registry-v6", "is-strategy-active", [Cl.uint(1)], dep).result).toBeBool(
      false
    );

    const activate = simnet.callPublicFn("strategy-registry-v6", "activate-strategy", [Cl.uint(1)], dep);
    expect(activate.result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn("strategy-registry-v6", "is-strategy-active", [Cl.uint(1)], dep).result).toBeBool(
      true
    );
  });

  it("records the strategy's asset, retrievable via get-strategy-asset", () => {
    deployMockStrategy(dep);
    simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii("STX"), Cl.uint(5000)],
      dep
    );
    const assetRes = simnet.callReadOnlyFn("strategy-registry-v6", "get-strategy-asset", [Cl.uint(1)], dep);
    expect(assetRes.result).toBeSome(Cl.stringAscii("STX"));
  });

  it("admin can deactivate an active strategy", () => {
    deployMockStrategy(dep);
    simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii(ASSET_SBTC), Cl.uint(5000)],
      dep
    );
    simnet.callPublicFn("strategy-registry-v6", "activate-strategy", [Cl.uint(1)], dep);
    const deactivate = simnet.callPublicFn("strategy-registry-v6", "deactivate-strategy", [Cl.uint(1)], dep);
    expect(deactivate.result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn("strategy-registry-v6", "is-strategy-active", [Cl.uint(1)], dep).result).toBeBool(
      false
    );
  });

  it("rejects an out-of-range allocation cap", () => {
    deployMockStrategy(dep);
    const res = simnet.callPublicFn(
      "strategy-registry-v6",
      "register-strategy",
      [Cl.stringAscii("mock"), Cl.principal(`${dep}.mock-strategy`), Cl.stringAscii(ASSET_SBTC), Cl.uint(10001)],
      dep
    );
    expect(res.result).toBeErr(Cl.uint(403));
  });

  it("cannot activate a strategy id that was never registered", () => {
    const res = simnet.callPublicFn("strategy-registry-v6", "activate-strategy", [Cl.uint(99)], dep);
    expect(res.result).toBeErr(Cl.uint(402));
  });
});
