"use client";

import Link from "next/link";
import type { MyVault } from "@/hooks/useMyVaults";
import { ASSET_LABEL, formatAsset, formatShares, percentOf, bpsToPct } from "@/lib/amounts";
import { poolAllocation, vaultAssets, viewerHoldsShares } from "@/lib/derive";
import { modeLabel, purposeById } from "@/lib/presets";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

/**
 * One treasury in the portfolio. Every figure comes from the vault contracts
 * for the connected wallet. The whole card is a link to the vault; the quick
 * actions are separate controls so common jobs are one click away.
 */
export function VaultCard({ vault }: { vault: MyVault }) {
  const { overview, role } = vault;
  const { meta, risk, environment } = overview;
  const purpose = purposeById(meta.purpose);
  const assets = vaultAssets(overview);
  const holds = viewerHoldsShares(overview);
  const base = `/vault/${meta.vaultId}`;

  return (
    <Card className="group relative transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/[0.06]">
      {/* stretched link: the card itself opens the vault; buttons below sit above it */}
      <Link href={base} aria-label={`Open ${meta.name}`} className="absolute inset-0 z-0 rounded-xl" />
      <CardBody className="relative z-10 pointer-events-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{meta.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{purpose.label}</span>
              <span className="text-muted-2">·</span>
              <span>{modeLabel(meta.assets)}</span>
              <span className="text-muted-2">·</span>
              <span>Vault #{meta.vaultId}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {role !== "holder" && <Badge tone="accent">Owner</Badge>}
            {role !== "owner" && <Badge tone="neutral">Depositor</Badge>}
            <Badge tone={meta.paused ? "warning" : "success"}>{meta.paused ? "Paused" : "Active"}</Badge>
          </div>
        </div>

        <div className={`mt-5 grid gap-3 ${assets.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {assets.map((asset) => {
            const pool = overview.pools[asset]!;
            const pos = overview.positions[asset];
            const alloc = poolAllocation(overview, asset);
            return (
              <div key={asset} className="rounded-xl border border-border bg-surface-raised/60 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{ASSET_LABEL[asset]} pool</span>
                  <span className="font-tabular text-xs text-muted">{percentOf(pos?.shares ?? 0n, pool.supply)}% yours</span>
                </div>
                <div className="font-tabular mt-1.5 text-xl font-semibold text-foreground">{formatAsset(pool.total, asset)}</div>

                {/* allocation: real idle vs deployed share of the pool */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border" role="img" aria-label="Idle versus deployed">
                  {alloc && alloc.deployedBps > 0 ? (
                    <div className="h-full rounded-full bg-enforce" style={{ width: `${alloc.deployedBps / 100}%` }} />
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                  <span>{alloc ? `${bpsToPct(alloc.idleBps)}% idle` : "Empty pool"}</span>
                  <span>{alloc ? `${bpsToPct(alloc.deployedBps)}% in strategies` : ""}</span>
                </div>

                <dl className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <dt className="text-muted">Your receipt shares</dt>
                  <dd className="font-tabular font-medium text-foreground">{formatShares(pos?.shares ?? 0n)}</dd>
                </dl>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="text-xs text-muted">
            {risk.autonomousEnabled ? "Autonomous configured" : "Manual approval"}
            {!environment.strategyExecutionEnabled && (
              <span className="ml-2 text-warning">· execution disabled on {environment.network === "TESTNET" ? "Testnet" : "this network"}</span>
            )}
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {(meta.openDeposits || role !== "holder") && !meta.paused && (
              <Link href={`${base}/deposit`}>
                <Button size="sm" variant="secondary">
                  Deposit
                </Button>
              </Link>
            )}
            {holds && (
              <Link href={`${base}/redeem`}>
                <Button size="sm" variant="secondary">
                  Redeem
                </Button>
              </Link>
            )}
            <Link href={base}>
              <Button size="sm">Open</Button>
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
