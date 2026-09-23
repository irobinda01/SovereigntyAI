import type { Asset, AssetPool, Position } from "@/lib/onchain";
import { ASSET_LABEL, formatAsset, formatShares, percentOf } from "@/lib/amounts";
import { RealAssetTag } from "@/components/NetworkStrip";

/**
 * "Your receipt position" for one asset pool. Every number is read from the
 * vault / receipt-token contracts (get-position), never from a database, and
 * ownership is computed from the on-chain share balance and supply.
 */
export function PositionCard({
  asset,
  pool,
  position,
  connected,
}: {
  asset: Asset;
  pool: AssetPool;
  position: Position | undefined;
  connected: boolean;
}) {
  const label = ASSET_LABEL[asset];
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Your receipt position - {label}</div>
        <RealAssetTag />
      </div>

      {!connected ? (
        <p className="mt-4 text-sm text-muted">Connect a wallet to see your receipt shares in this pool.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Receipt tokens</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">{formatShares(position?.shares ?? 0n)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Total receipt supply</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">{formatShares(pool.supply)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Your ownership</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">
                {percentOf(position?.shares ?? 0n, pool.supply)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Estimated claim</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">{formatAsset(position?.claim ?? 0n, asset)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Available to redeem now</dt>
              <dd className="font-tabular mt-1 text-sm font-medium text-foreground">{formatAsset(position?.redeemable ?? 0n, asset)}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            Receipt tokens represent your fractional ownership of this vault&apos;s managed {label} according to the vault&apos;s
            current accounting. They are an accounting claim - not a profit, governance or investment token - and they are
            non-transferable.
          </p>
        </>
      )}
    </div>
  );
}
