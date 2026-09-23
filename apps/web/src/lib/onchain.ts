import { Cl, ClarityValue, cvToJSON, fetchCallReadOnlyFunction } from "@stacks/transactions";
import { contractId, NETWORK, SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, STACKS_API_URL } from "./config";
import type { AssetKey } from "./amounts";

// Every function in this file either returns a value read directly from the
// real Stacks Testnet API / Clarity read-only functions, or throws. There is
// no fallback path that substitutes a placeholder number - callers must
// render an explicit loading / error / empty state instead. The database
// (the agent's decision log) is never consulted here: balances, shares,
// ownership and allocation come from the contracts and nowhere else.

export type Asset = AssetKey;
export const ASSETS: Asset[] = ["STX", "SBTC"];

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${STACKS_API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stacks API ${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function readOnlyJSON(contract: string, fn: string, args: ClarityValue[], sender: string) {
  const [addr, name] = contract.split(".");
  const result = await fetchCallReadOnlyFunction({
    contractAddress: addr,
    contractName: name,
    functionName: fn,
    functionArgs: args,
    senderAddress: sender,
    network: NETWORK,
  });
  return cvToJSON(result);
}

const deployerOf = () => contractId("sovereignty-vault").split(".")[0];
const vaultRead = (fn: string, args: ClarityValue[], sender?: string) =>
  readOnlyJSON(contractId("sovereignty-vault"), fn, args, sender ?? deployerOf());

// ---------------------------------------------------------------- wallet balances

export async function getStxBalance(address: string): Promise<bigint> {
  const data = await apiGet<{ balance: string }>(`/extended/v1/address/${address}/stx`);
  return BigInt(data.balance);
}

export async function getSbtcBalance(address: string): Promise<bigint> {
  const json = await readOnlyJSON(
    `${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}`,
    "get-balance",
    [Cl.principal(address)],
    address
  );
  if (json.success === false) throw new Error(`get-balance failed: ${JSON.stringify(json)}`);
  return BigInt(json.value.value);
}

export async function getBlockHeight(): Promise<number> {
  const data = await apiGet<{ stacks_tip_height: number }>("/v2/info");
  if (typeof data.stacks_tip_height !== "number") {
    throw new Error("Stacks API /v2/info did not return stacks_tip_height");
  }
  return data.stacks_tip_height;
}

export async function isProtocolPaused(): Promise<boolean> {
  const json = await readOnlyJSON(contractId("protocol-admin"), "is-paused", [], deployerOf());
  return json.value === true;
}

// ---------------------------------------------------------------- protocol state

export interface ExecutionEnvironment {
  network: "TESTNET" | "MAINNET";
  chainId: bigint;
  mainnetExecutionArmed: boolean;
  /** As reported by risk-guard-v7 on-chain. False on Testnet by construction. */
  strategyExecutionEnabled: boolean;
}

export async function getExecutionEnvironment(): Promise<ExecutionEnvironment> {
  const json = await readOnlyJSON(contractId("risk-guard"), "get-execution-environment", [], deployerOf());
  const e = json.value;
  return {
    network: e.network.value === "MAINNET" ? "MAINNET" : "TESTNET",
    chainId: BigInt(e["chain-id"].value),
    mainnetExecutionArmed: e["mainnet-execution-armed"].value === true,
    strategyExecutionEnabled: e["strategy-execution-enabled"].value === true,
  };
}

export interface ProtocolLimits {
  maxSlippageBps: number;
  maxExposureBps: number;
  minCooldownBlocks: number;
  minLiquidityBps: number;
  approvedSbtcAsset: string | null;
}

export async function getProtocolLimits(): Promise<ProtocolLimits> {
  const json = await readOnlyJSON(contractId("risk-guard"), "get-protocol-limits", [], deployerOf());
  const l = json.value;
  return {
    maxSlippageBps: Number(l["max-slippage-bps"].value),
    maxExposureBps: Number(l["max-exposure-bps"].value),
    minCooldownBlocks: Number(l["min-cooldown-blocks"].value),
    minLiquidityBps: Number(l["min-liquidity-bps"].value),
    approvedSbtcAsset: l["approved-sbtc-asset"].value ? l["approved-sbtc-asset"].value.value : null,
  };
}

export interface StrategyData {
  strategyId: number;
  name: string;
  contract: string;
  asset: Asset;
  active: boolean;
  maxAllocationBps: number;
}

export async function listStrategies(): Promise<StrategyData[]> {
  const strategies: StrategyData[] = [];
  for (let id = 1; id <= 25; id++) {
    const json = await readOnlyJSON(contractId("strategy-registry"), "get-strategy", [Cl.uint(id)], deployerOf());
    if (json.value === null) break;
    const entry = json.value.value;
    strategies.push({
      strategyId: id,
      name: entry.name.value,
      contract: entry["strategy-contract"].value,
      asset: entry.asset.value as Asset,
      active: entry.active.value === true,
      maxAllocationBps: Number(entry["max-allocation-bps"].value),
    });
  }
  return strategies;
}

export interface ProtocolSnapshot {
  blockHeight: number;
  paused: boolean;
  environment: ExecutionEnvironment;
  vaultCount: number;
  approvedSbtc: string | null;
  activeStrategyCount: number;
  readAt: number;
}

/** Public, wallet-free protocol facts for the home page - every field read live from the chain. */
export async function getProtocolSnapshot(): Promise<ProtocolSnapshot> {
  const [blockHeight, paused, environment, limits, strategies, countJson] = await Promise.all([
    getBlockHeight(),
    isProtocolPaused(),
    getExecutionEnvironment(),
    getProtocolLimits(),
    listStrategies(),
    readOnlyJSON(contractId("sovereignty-vault"), "get-vault-count", [], deployerOf()),
  ]);
  return {
    blockHeight,
    paused,
    environment,
    vaultCount: Number(countJson.value),
    approvedSbtc: limits.approvedSbtcAsset,
    activeStrategyCount: strategies.filter((s) => s.active).length,
    readAt: Date.now(),
  };
}

// ---------------------------------------------------------------- vault state

export interface VaultMeta {
  vaultId: number;
  owner: string;
  name: string;
  purpose: number;
  assets: number; // 1 STX, 2 sBTC, 3 both (separate pools)
  openDeposits: boolean;
  paused: boolean;
  createdAt: number;
}

export interface RiskConfig {
  maxExposureBps: number;
  maxStxTx: bigint;
  maxSbtcTx: bigint;
  maxSlippageBps: number;
  minIdleBps: number;
  autonomousEnabled: boolean;
  cooldownBlocks: number;
  lastUsedNonce: number;
  lastExecutionHeight: number;
}

export interface AssetPool {
  asset: Asset;
  idle: bigint;
  total: bigint; // net asset value of the pool (idle + allocated principal)
  supply: bigint; // receipt shares outstanding
}

/** One holder's position in one asset pool. `null` shares mean "no wallet connected" - never zero-filled. */
export interface Position {
  asset: Asset;
  shares: bigint;
  supply: bigint;
  totalAssets: bigint;
  idle: bigint;
  ownershipBps: bigint;
  claim: bigint; // floor(shares * total / supply): entitlement including deployed capital
  redeemable: bigint; // min(claim, idle): what could be redeemed right now
}

export interface StrategyAllocation {
  strategyId: number;
  asset: Asset;
  amount: bigint;
}

export interface VaultOverview {
  meta: VaultMeta;
  risk: RiskConfig;
  pools: Partial<Record<Asset, AssetPool>>;
  positions: Partial<Record<Asset, Position>>;
  allocations: StrategyAllocation[];
  strategies: StrategyData[];
  environment: ExecutionEnvironment;
  blockHeight: number;
  loadedAt: number;
}

export function supportedAssets(assetsMode: number): Asset[] {
  return assetsMode === 1 ? ["STX"] : assetsMode === 2 ? ["SBTC"] : ["STX", "SBTC"];
}

export async function getVaultMeta(vaultId: number): Promise<VaultMeta | null> {
  const json = await vaultRead("get-vault", [Cl.uint(vaultId)]);
  if (json.value === null) return null;
  const v = json.value.value;
  return {
    vaultId,
    owner: v.owner.value as string,
    name: v.name.value as string,
    purpose: Number(v.purpose.value),
    assets: Number(v.assets.value),
    openDeposits: v["open-deposits"].value === true,
    paused: v.paused.value === true,
    createdAt: Number(v["created-at"].value),
  };
}

export async function getRiskConfig(vaultId: number): Promise<RiskConfig> {
  const json = await readOnlyJSON(contractId("risk-guard"), "get-vault-config", [Cl.uint(vaultId)], deployerOf());
  if (json.value === null) throw new Error(`Vault ${vaultId} has no risk configuration on-chain.`);
  const c = json.value.value;
  return {
    maxExposureBps: Number(c["max-exposure-bps"].value),
    maxStxTx: BigInt(c["max-stx-tx-amount"].value),
    maxSbtcTx: BigInt(c["max-sbtc-tx-amount"].value),
    maxSlippageBps: Number(c["max-slippage-bps"].value),
    minIdleBps: Number(c["min-idle-bps"].value),
    autonomousEnabled: c["autonomous-enabled"].value === true,
    cooldownBlocks: Number(c["cooldown-blocks"].value),
    lastUsedNonce: Number(c["last-used-nonce"].value),
    lastExecutionHeight: Number(c["last-execution-height"].value),
  };
}

async function getPool(vaultId: number, asset: Asset): Promise<AssetPool> {
  const json = await vaultRead("get-pool", [Cl.uint(vaultId), Cl.stringAscii(asset)]);
  const p = json.value;
  return { asset, idle: BigInt(p.idle.value), total: BigInt(p.total.value), supply: BigInt(p.supply.value) };
}

export async function getPosition(vaultId: number, asset: Asset, holder: string): Promise<Position> {
  const json = await vaultRead("get-position", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.principal(holder)], holder);
  const p = json.value;
  return {
    asset,
    shares: BigInt(p.shares.value),
    supply: BigInt(p.supply.value),
    totalAssets: BigInt(p["total-assets"].value),
    idle: BigInt(p.idle.value),
    ownershipBps: BigInt(p["ownership-bps"].value),
    claim: BigInt(p.claim.value),
    redeemable: BigInt(p.redeemable.value),
  };
}

async function getAllocation(vaultId: number, strategyId: number, asset: Asset): Promise<bigint> {
  const json = await vaultRead("get-strategy-allocation", [Cl.uint(vaultId), Cl.uint(strategyId), Cl.stringAscii(asset)]);
  return BigInt(json.value);
}

/** Everything the vault pages render, read from chain in one pass. `viewer` is optional (no wallet -> no positions). */
export async function getVaultOverview(vaultId: number, viewer: string | null): Promise<VaultOverview | null> {
  const meta = await getVaultMeta(vaultId);
  if (!meta) return null;
  const assets = supportedAssets(meta.assets);

  const [risk, environment, blockHeight, strategies, poolList, positionList] = await Promise.all([
    getRiskConfig(vaultId),
    getExecutionEnvironment(),
    getBlockHeight(),
    listStrategies(),
    Promise.all(assets.map((a) => getPool(vaultId, a))),
    viewer ? Promise.all(assets.map((a) => getPosition(vaultId, a, viewer))) : Promise.resolve([] as Position[]),
  ]);

  const allocations: StrategyAllocation[] = [];
  await Promise.all(
    strategies
      .filter((s) => assets.includes(s.asset))
      .map(async (s) => {
        const amount = await getAllocation(vaultId, s.strategyId, s.asset);
        allocations.push({ strategyId: s.strategyId, asset: s.asset, amount });
      })
  );

  const pools: VaultOverview["pools"] = {};
  poolList.forEach((p) => (pools[p.asset] = p));
  const positions: VaultOverview["positions"] = {};
  positionList.forEach((p) => (positions[p.asset] = p));

  return { meta, risk, pools, positions, allocations, strategies, environment, blockHeight, loadedAt: Date.now() };
}

// ---------------------------------------------------------------- discovery (on-chain indexes)

async function indexedIds(countFn: string, idFn: string, who: string): Promise<number[]> {
  const countJson = await vaultRead(countFn, [Cl.principal(who)], who);
  const count = Number(countJson.value);
  const ids = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const j = await vaultRead(idFn, [Cl.principal(who), Cl.uint(i)], who);
      return j.value ? Number(j.value.value) : null;
    })
  );
  return ids.filter((x): x is number => x !== null);
}

/** Vaults created by `owner`, from the vault contract's own on-chain index. */
export const getOwnerVaultIds = (owner: string) => indexedIds("get-owner-vault-count", "get-owner-vault-id", owner);

/** Vaults in which `holder` has ever deposited (holds or held receipt shares), from the on-chain index. */
export const getHolderVaultIds = (holder: string) => indexedIds("get-holder-vault-count", "get-holder-vault-id", holder);

// ---------------------------------------------------------------- previews (the contract's own math)

/** Receipt shares that a deposit of `amount` would mint right now, computed by the contract. */
export async function previewDeposit(
  vaultId: number,
  asset: Asset,
  amount: bigint,
  viewer: string
): Promise<{ ok: true; shares: bigint } | { ok: false; code: number }> {
  const json = await vaultRead("preview-deposit", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.uint(amount)], viewer);
  return json.success ? { ok: true, shares: BigInt(json.value.value) } : { ok: false, code: Number(json.value.value) };
}

/** Assets that redeeming `shares` would pay right now, computed by the contract. */
export async function previewRedeem(
  vaultId: number,
  asset: Asset,
  shares: bigint,
  viewer: string
): Promise<{ ok: true; amount: bigint } | { ok: false; code: number }> {
  const json = await vaultRead("preview-redeem", [Cl.uint(vaultId), Cl.stringAscii(asset), Cl.uint(shares)], viewer);
  return json.success ? { ok: true, amount: BigInt(json.value.value) } : { ok: false, code: Number(json.value.value) };
}

// ---------------------------------------------------------------- transactions

export interface TxResult {
  status: "confirmed" | "failed" | "timeout";
  resultCV?: ClarityValue;
  /** Numeric Clarity error code when the contract returned `(err uN)` - present under abort_by_response AND abort_by_post_condition. */
  errorCode?: number;
  errorText?: string;
  blockHeight?: number;
}

/** Extracts N from a `(err uN)` result representation. */
export function errorCodeFromRepr(repr: string | undefined): number | undefined {
  const m = repr?.match(/\(err u(\d+)\)/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Polls the real Testnet API until a transaction resolves.
 *
 * The API answers HTTP 404 for a freshly broadcast txid until it has indexed
 * it. That means "not yet", NOT "failed" - treating it as an error (as an
 * earlier version did) made every successful transaction look failed in the
 * UI. Only a terminal tx_status resolves the wait.
 */
export async function waitForTxResult(
  txId: string,
  { timeoutMs = 5 * 60_000, pollIntervalMs = 4_000 } = {}
): Promise<TxResult> {
  const { deserializeCV } = await import("@stacks/transactions");
  const id = txId.startsWith("0x") ? txId : `0x${txId}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let data: {
      tx_status: string;
      tx_result?: { hex: string; repr: string };
      block_height?: number;
    } | null = null;
    try {
      const res = await fetch(`${STACKS_API_URL}/extended/v1/tx/${id}`, { cache: "no-store" });
      if (res.status !== 404 && res.ok) data = await res.json();
    } catch {
      // transient network error: keep polling until the deadline
    }

    if (data) {
      if (data.tx_status === "success") {
        const resultCV = data.tx_result ? deserializeCV(data.tx_result.hex) : undefined;
        return { status: "confirmed", resultCV, blockHeight: data.block_height };
      }
      if (data.tx_status.startsWith("abort_") || data.tx_status === "dropped_replace_by_fee" || data.tx_status.startsWith("dropped")) {
        return {
          status: "failed",
          errorCode: errorCodeFromRepr(data.tx_result?.repr),
          errorText: data.tx_result?.repr ?? data.tx_status,
          blockHeight: data.block_height,
        };
      }
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return { status: "timeout" };
}
