import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import { accounts, deployer } from "./helpers";

describe("sovereignty-protocol-admin-v4", () => {
  let dep: string;
  let wallet1: string;

  beforeEach(() => {
    dep = deployer();
    wallet1 = accounts().get("wallet_1")!;
  });

  it("deployer is admin at genesis", () => {
    const res = simnet.callReadOnlyFn("sovereignty-protocol-admin-v4", "get-admin", [], dep);
    expect(res.result).toBePrincipal(dep);
  });

  it("non-admin cannot pause the protocol", () => {
    const res = simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], wallet1);
    expect(res.result).toBeErr(Cl.uint(600));
  });

  it("admin can pause and unpause", () => {
    const pauseRes = simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
    expect(pauseRes.result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn("sovereignty-protocol-admin-v4", "is-paused", [], dep).result).toBeBool(true);

    const unpauseRes = simnet.callPublicFn("sovereignty-protocol-admin-v4", "unpause-protocol", [], dep);
    expect(unpauseRes.result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn("sovereignty-protocol-admin-v4", "is-paused", [], dep).result).toBeBool(false);
  });

  it("cannot pause an already-paused protocol", () => {
    simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
    const res = simnet.callPublicFn("sovereignty-protocol-admin-v4", "pause-protocol", [], dep);
    expect(res.result).toBeErr(Cl.uint(602));
  });

  it("admin transfer requires two steps and only the nominee can accept", () => {
    const proposeRes = simnet.callPublicFn("sovereignty-protocol-admin-v4", "propose-admin", [Cl.principal(wallet1)], dep);
    expect(proposeRes.result).toBeOk(Cl.bool(true));

    // admin has not changed yet
    expect(simnet.callReadOnlyFn("sovereignty-protocol-admin-v4", "get-admin", [], dep).result).toBePrincipal(dep);

    // a third party cannot accept on the nominee's behalf
    const wallet2 = accounts().get("wallet_2")!;
    const badAccept = simnet.callPublicFn("sovereignty-protocol-admin-v4", "accept-admin", [], wallet2);
    expect(badAccept.result).toBeErr(Cl.uint(600));

    const acceptRes = simnet.callPublicFn("sovereignty-protocol-admin-v4", "accept-admin", [], wallet1);
    expect(acceptRes.result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn("sovereignty-protocol-admin-v4", "get-admin", [], dep).result).toBePrincipal(wallet1);
  });

  it("non-admin cannot propose a new admin", () => {
    const wallet2 = accounts().get("wallet_2")!;
    const res = simnet.callPublicFn("sovereignty-protocol-admin-v4", "propose-admin", [Cl.principal(wallet2)], wallet1);
    expect(res.result).toBeErr(Cl.uint(600));
  });
});
