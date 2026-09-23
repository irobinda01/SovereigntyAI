import { Cl, ClarityValue } from "@stacks/transactions";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The real, currently-deployed sBTC token contract on Stacks Testnet.
// Pulled into the project as a Clarinet requirement (see Clarinet.toml)
// so simnet deploys the ACTUAL testnet bytecode/source at its real
// testnet principal, rather than any mock or reimplementation.
export const SBTC_CONTRACT = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
export const SBTC_ASSET_ID = `${SBTC_CONTRACT}.sbtc-token`;

export const VAULT = "sovereignty-vault-v7";
export const RECEIPTS = "receipt-token-v7";
export const RISK = "risk-guard-v7";
export const ENGINE = "execution-engine-v7";

export const ASSET_STX = "STX";
export const ASSET_SBTC = "SBTC";
export type Asset = typeof ASSET_STX | typeof ASSET_SBTC;

export const ASSETS_STX_ONLY = 1;
export const ASSETS_SBTC_ONLY = 2;
export const ASSETS_BOTH = 3;

export const PURPOSE = { conservative: 0, aggressive: 1, business: 2, dao: 3, institutional: 4, custom: 5 } as const;

export const MIN_INITIAL_STX = 1_000_000n;
export const MIN_INITIAL_SBTC = 10_000n;

export function accounts() {
  return simnet.getAccounts();
}

export function deployer() {
  return simnet.deployer;
}

export function mintSbtc(recipient: string, amount: bigint) {
  return simnet.mintFT(SBTC_ASSET_ID, recipient, amount);
}

export function sbtcBalance(who: string): bigint {
  const r = simnet.callReadOnlyFn(SBTC_CONTRACT, "get-balance", [Cl.principal(who)], deployer()).result as any;
  return BigInt(r.value.value);
}

export function stxBalance(who: string): bigint {
  const assets = simnet.getAssetsMap();
  const stxMap = assets.get("STX");
  return stxMap?.get(who) ?? 0n;
}

export function contractPrincipal(name: string) {
  return `${deployer()}.${name}`;
}

/** Unwraps `(ok v)` -> v; throws with the Clarity value if it was an error. */
export function expectOk(result: ClarityValue): any {
  const r = result as any;
  if (r.type !== "ok") throw new Error(`expected (ok ...), got ${JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r.value;
}

/** Returns the numeric code inside `(err uN)`, or throws if it was ok. */
export function errCode(result: ClarityValue): bigint {
  const r = result as any;
  if (r.type !== "err") throw new Error(`expected (err ...), got ${JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return BigInt(r.value.value);
}

export interface VaultOpts {
  owner: string;
  name?: string;
  purpose?: number;
  assets?: number;
  openDeposits?: boolean;
  maxExposureBps?: number;
  maxStxTxAmount?: bigint;
  maxSbtcTxAmount?: bigint;
  maxSlippageBps?: number;
  minIdleBps?: number;
  autonomous?: boolean;
  cooldownBlocks?: number;
}

export function createVaultArgs(o: VaultOpts): ClarityValue[] {
  return [
    Cl.stringUtf8(o.name ?? "Test Treasury"),
    Cl.uint(o.purpose ?? PURPOSE.custom),
    Cl.uint(o.assets ?? ASSETS_BOTH),
    Cl.bool(o.openDeposits ?? false),
    Cl.uint(o.maxExposureBps ?? 3000),
    Cl.uint(o.maxStxTxAmount ?? 1_000_000_000n),
    Cl.uint(o.maxSbtcTxAmount ?? 100_000_000n),
    Cl.uint(o.maxSlippageBps ?? 50),
    Cl.uint(o.minIdleBps ?? 500),
    Cl.bool(o.autonomous ?? false),
    Cl.uint(o.cooldownBlocks ?? 6),
  ];
}

export function createVault(o: VaultOpts): bigint {
  const res = simnet.callPublicFn(VAULT, "create-vault", createVaultArgs(o), o.owner);
  return BigInt(expectOk(res.result).value);
}

export function depositStx(vaultId: bigint | number, amount: bigint, sender: string) {
  return simnet.callPublicFn(VAULT, "deposit-stx", [Cl.uint(vaultId), Cl.uint(amount)], sender);
}

export function depositSbtc(vaultId: bigint | number, amount: bigint, sender: string, tokenContract = SBTC_CONTRACT) {
  return simnet.callPublicFn(
    VAULT,
    "deposit-sbtc",
    [Cl.uint(vaultId), Cl.uint(amount), Cl.principal(tokenContract)],
    sender
  );
}

export function redeemStx(vaultId: bigint | number, shares: bigint, sender: string) {
  return simnet.callPublicFn(VAULT, "redeem-stx", [Cl.uint(vaultId), Cl.uint(shares)], sender);
}

export function redeemSbtc(vaultId: bigint | number, shares: bigint, sender: string) {
  return simnet.callPublicFn(VAULT, "redeem-sbtc", [Cl.uint(vaultId), Cl.uint(shares), Cl.principal(SBTC_CONTRACT)], sender);
}

function readUint(contract: string, fn: string, args: ClarityValue[]): bigint {
  const r = simnet.callReadOnlyFn(contract, fn, args, deployer()).result as any;
  return BigInt(r.value);
}

export function shareBalance(vaultId: bigint | number, asset: Asset, who: string): bigint {
  return readUint(RECEIPTS, "get-balance", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.principal(who)]);
}

export function shareSupply(vaultId: bigint | number, asset: Asset): bigint {
  return readUint(RECEIPTS, "get-total-supply", [Cl.uint(vaultId), Cl.stringAscii(asset)]);
}

export function idleBalance(vaultId: bigint | number, asset: Asset): bigint {
  return readUint(VAULT, "get-idle-balance", [Cl.uint(vaultId), Cl.stringAscii(asset)]);
}

export function totalBalance(vaultId: bigint | number, asset: Asset): bigint {
  return readUint(VAULT, "get-total-balance", [Cl.uint(vaultId), Cl.stringAscii(asset)]);
}

export function position(vaultId: bigint | number, asset: Asset, who: string) {
  const r = simnet.callReadOnlyFn(VAULT, "get-position", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.principal(who)], deployer())
    .result as any;
  const t = r.value;
  const out: Record<string, bigint> = {};
  for (const k of Object.keys(t)) out[k] = BigInt(t[k].value);
  return out as {
    shares: bigint;
    supply: bigint;
    "total-assets": bigint;
    idle: bigint;
    "ownership-bps": bigint;
    claim: bigint;
    redeemable: bigint;
  };
}

/** Standard protocol bootstrap the deployer performs once per deployment. */
export function bootstrapProtocol() {
  const dep = deployer();
  simnet.callPublicFn(RISK, "set-approved-sbtc-asset", [Cl.principal(SBTC_CONTRACT)], dep);
}

// Deploys the test-only mock-strategy fixture (tests/mocks/mock-strategy.clar)
// under the project's default deployer principal, so its `.strategy-trait`
// reference resolves to the real deployed strategy-trait.clar contract.
// This is never part of Clarinet.toml / the deployable manifest, and no
// test in this repo asserts that a mock strategy actually received funds on
// Testnet - it is used only to give the registry something to point at so
// the validation pipeline (and the testnet gate) can be exercised.
export function deployMockStrategy(sender: string, contractName = "mock-strategy") {
  const source = readFileSync(join(__dirname, "mocks", "mock-strategy.clar"), "utf8");
  return simnet.deployContract(contractName, source, null, sender);
}

export function setupApprovedMockStrategy(admin: string, dep: string, asset: Asset = ASSET_SBTC) {
  const contractName = asset === ASSET_STX ? "mock-strategy-stx" : "mock-strategy-sbtc";
  deployMockStrategy(dep, contractName);
  const mockStrategyId = `${dep}.${contractName}`;
  const registerRes = simnet.callPublicFn(
    "strategy-registry-v6",
    "register-strategy",
    [Cl.stringAscii(contractName), Cl.principal(mockStrategyId), Cl.stringAscii(asset), Cl.uint(10000)],
    admin
  );
  const strategyId = BigInt((registerRes.result as any).value.value);
  simnet.callPublicFn("strategy-registry-v6", "activate-strategy", [Cl.uint(strategyId)], admin);
  return { strategyId, mockStrategyId };
}
