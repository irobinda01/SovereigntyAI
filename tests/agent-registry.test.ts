import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import { accounts, deployer } from "./helpers";

describe("agent-registry-v4", () => {
  let dep: string;
  let wallet1: string;
  let wallet2: string;

  beforeEach(() => {
    dep = deployer();
    wallet1 = accounts().get("wallet_1")!;
    wallet2 = accounts().get("wallet_2")!;
  });

  it("is-authorized-executor is false for an unregistered principal", () => {
    const res = simnet.callReadOnlyFn("agent-registry-v4", "is-authorized-executor", [Cl.principal(wallet1)], dep);
    expect(res.result).toBeBool(false);
  });

  it("admin can register an executor and it becomes authorized", () => {
    const reg = simnet.callPublicFn(
      "agent-registry-v4",
      "register-executor",
      [Cl.principal(wallet1), Cl.stringAscii("primary-ai-executor")],
      dep
    );
    expect(reg.result).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn("agent-registry-v4", "is-authorized-executor", [Cl.principal(wallet1)], dep).result
    ).toBeBool(true);
  });

  it("an executor cannot register itself (or anyone else)", () => {
    const res = simnet.callPublicFn(
      "agent-registry-v4",
      "register-executor",
      [Cl.principal(wallet1), Cl.stringAscii("self-registered")],
      wallet1
    );
    expect(res.result).toBeErr(Cl.uint(500));
  });

  it("cannot double-register the same executor", () => {
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(wallet1), Cl.stringAscii("a")], dep);
    const res = simnet.callPublicFn(
      "agent-registry-v4",
      "register-executor",
      [Cl.principal(wallet1), Cl.stringAscii("b")],
      dep
    );
    expect(res.result).toBeErr(Cl.uint(501));
  });

  it("admin can revoke an executor, and a revoked executor loses authorization", () => {
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(wallet1), Cl.stringAscii("a")], dep);
    const revoke = simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(wallet1)], dep);
    expect(revoke.result).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn("agent-registry-v4", "is-authorized-executor", [Cl.principal(wallet1)], dep).result
    ).toBeBool(false);
  });

  it("an executor cannot revoke itself or another executor", () => {
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(wallet1), Cl.stringAscii("a")], dep);
    const res = simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(wallet1)], wallet1);
    expect(res.result).toBeErr(Cl.uint(500));
  });

  it("non-admin cannot revoke an executor", () => {
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(wallet1), Cl.stringAscii("a")], dep);
    const res = simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(wallet1)], wallet2);
    expect(res.result).toBeErr(Cl.uint(500));
  });

  it("admin can reactivate a revoked executor", () => {
    simnet.callPublicFn("agent-registry-v4", "register-executor", [Cl.principal(wallet1), Cl.stringAscii("a")], dep);
    simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(wallet1)], dep);
    const reactivate = simnet.callPublicFn("agent-registry-v4", "reactivate-executor", [Cl.principal(wallet1)], dep);
    expect(reactivate.result).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn("agent-registry-v4", "is-authorized-executor", [Cl.principal(wallet1)], dep).result
    ).toBeBool(true);
  });

  it("cannot revoke an executor that is not registered", () => {
    const res = simnet.callPublicFn("agent-registry-v4", "revoke-executor", [Cl.principal(wallet1)], dep);
    expect(res.result).toBeErr(Cl.uint(502));
  });
});
