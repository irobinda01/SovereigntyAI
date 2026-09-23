import type { Asset, VaultOverview } from "./onchain";
import { supportedAssets } from "./onchain";

// Pure derivations from authoritative on-chain state. Nothing here reads a
// database or invents a number: every output is arithmetic on values that came
// from the contracts.

const BPS = 10_000n;

export interface PoolAllocation {
  asset: Asset;
  total: bigint;
  idleBps: number;
  idle: bigint;
  strategies: Array<{ strategyId: number; name: string; amount: bigint; bps: number }>;
  /** Sum of everything deployed to strategies, as bps of the pool. */
  deployedBps: number;
}

/** Real allocation of one asset pool; null when the pool is empty (no percentages are invented). */
export function poolAllocation(o: VaultOverview, asset: Asset): PoolAllocation | null {
  const pool = o.pools[asset];
  if (!pool || pool.total <= 0n) return null;
  const strategies = o.strategies
    .filter((s) => s.asset === asset && s.active)
    .map((s) => {
      const amount = o.allocations.find((a) => a.strategyId === s.strategyId && a.asset === asset)?.amount ?? 0n;
      return { strategyId: s.strategyId, name: s.name, amount, bps: Number((amount * BPS) / pool.total) };
    });
  const deployed = pool.total - pool.idle;
  return {
    asset,
    total: pool.total,
    idle: pool.idle,
    idleBps: Number((pool.idle * BPS) / pool.total),
    strategies,
    deployedBps: Number((deployed * BPS) / pool.total),
  };
}

/** Ownership in bps AFTER a hypothetical deposit that would mint `minted` shares. */
export function ownershipAfterDeposit(currentShares: bigint, supply: bigint, minted: bigint): bigint {
  const newSupply = supply + minted;
  return newSupply === 0n ? 0n : ((currentShares + minted) * BPS) / newSupply;
}

export function vaultAssets(o: VaultOverview): Asset[] {
  return supportedAssets(o.meta.assets);
}

/** Is any share of this vault held by the viewer, in any pool? */
export function viewerHoldsShares(o: VaultOverview): boolean {
  return Object.values(o.positions).some((p) => p && p.shares > 0n);
}
