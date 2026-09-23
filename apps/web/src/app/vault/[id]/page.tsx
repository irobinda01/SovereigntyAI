"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useVault } from "@/components/vault/VaultContext";
import { getVaultDecisions, type DecisionRecord } from "@/lib/agent";
import { ASSET_LABEL, bpsToPct, formatAsset } from "@/lib/amounts";
import { poolAllocation, vaultAssets } from "@/lib/derive";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { OffChainTag, IntentStatusBadge } from "@/components/ui/StatusBadges";
import { RealAssetTag } from "@/components/NetworkStrip";
import { AllocationBar } from "@/components/vault/AllocationBar";
import { PositionCard } from "@/components/vault/PositionCard";
import { AutonomousModeNotice, TestnetExecutionBanner } from "@/components/vault/TestnetGate";

export default function VaultOverviewPage() {
  const { overview, vaultId, viewer, isOwner, refresh, refreshing } = useVault();
  const assets = vaultAssets(overview);
  const [decisions, setDecisions] = useState<DecisionRecord[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getVaultDecisions(vaultId)
      .then((d) => !cancelled && setDecisions(d))
      .catch(() => !cancelled && setDecisions(null));
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  const last = decisions && decisions.length > 0 ? decisions[0] : null;

  return (
    <div className="space-y-8">
      <TestnetExecutionBanner environment={overview.environment} />

      {/* ---- pools: total assets per asset (STX and sBTC are separate pools and are never summed) ---- */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Assets</h2>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh from chain"}
          </Button>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {assets.map((asset) => {
            const pool = overview.pools[asset]!;
            return (
              <Card key={asset}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Total {ASSET_LABEL[asset]} in this vault</div>
                    <RealAssetTag />
                  </div>
                  <div className="font-tabular mt-2 text-3xl font-semibold text-foreground">{formatAsset(pool.total, asset)}</div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Idle (redeemable now)</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">{formatAsset(pool.idle, asset)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Allocated to strategies</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">{formatAsset(pool.total - pool.idle, asset)}</dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>
            );
          })}
        </div>
        {assets.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            STX and sBTC are separate pools with separate receipt shares. They are never converted, summed or valued against each other.
          </p>
        )}
      </section>

      {/* ---- your ownership ---- */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Your ownership</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {assets.map((asset) => (
            <PositionCard key={asset} asset={asset} pool={overview.pools[asset]!} position={overview.positions[asset]} connected={Boolean(viewer)} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/vault/${vaultId}/deposit`}>
            <Button>Deposit</Button>
          </Link>
          <Link href={`/vault/${vaultId}/redeem`}>
            <Button variant="secondary">Redeem</Button>
          </Link>
        </div>
      </section>

      {/* ---- allocation ---- */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Strategy allocation</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {assets.map((asset) => {
            const alloc = poolAllocation(overview, asset);
            return (
              <Card key={asset}>
                <CardHeader>
                  <CardTitle>{ASSET_LABEL[asset]} pool</CardTitle>
                </CardHeader>
                <CardBody>
                  {alloc ? (
                    <AllocationBar
                      slices={[
                        { label: "Idle", bps: alloc.idleBps, tone: "idle" },
                        ...alloc.strategies.map((s) => ({ label: s.name, bps: s.bps, tone: "strategy" as const })),
                      ]}
                    />
                  ) : (
                    <p className="text-sm text-muted">This pool is empty, so there is no allocation to show yet.</p>
                  )}
                  {alloc && alloc.strategies.length === 0 && (
                    <p className="mt-3 text-xs text-muted">
                      No {ASSET_LABEL[asset]} strategy is registered on this network, so 100% of the pool is idle.
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- AI + autonomy ---- */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted">AI status</div>
              <OffChainTag />
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">Analysis on request</div>
            <p className="mt-1 text-sm text-muted">
              The AI analyses your real on-chain state when you ask it to; it does not run in the background or move funds.
            </p>
            <div className="mt-3 text-sm">
              <span className="text-muted">Last recommendation: </span>
              {decisions === undefined && <span className="text-muted">loading...</span>}
              {decisions === null && <span className="text-muted">AI agent unavailable</span>}
              {decisions && !last && <span className="text-foreground">none yet</span>}
              {last && (
                <span className="text-foreground">
                  {new Date(last.timestamp).toLocaleString()}{" "}
                  {last.recommendation.decision === "HOLD" ? <Badge tone="neutral">No action recommended</Badge> : <IntentStatusBadge status={last.status} />}
                </span>
              )}
            </div>
            <Link href={`/vault/${vaultId}/recommendations`}>
              <Button size="sm" variant="secondary" className="mt-4">
                Open AI recommendations
              </Button>
            </Link>
          </CardBody>
        </Card>
        <AutonomousModeNotice risk={overview.risk} environment={overview.environment} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Configured limits</h2>
        <Card className="mt-3">
          <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Limit label="Max per-strategy exposure" value={`${bpsToPct(overview.risk.maxExposureBps)}%`} />
            <Limit label="Min idle liquidity" value={`${bpsToPct(overview.risk.minIdleBps)}%`} />
            <Limit label="Max slippage" value={`${bpsToPct(overview.risk.maxSlippageBps)}%`} />
            <Limit label="Max tx (STX)" value={formatAsset(overview.risk.maxStxTx, "STX")} />
            <Limit label="Max tx (sBTC)" value={formatAsset(overview.risk.maxSbtcTx, "SBTC")} />
            <Limit label="Cooldown" value={`${overview.risk.cooldownBlocks} blocks`} />
          </CardBody>
        </Card>
        {isOwner && (
          <Link href={`/vault/${vaultId}/settings`} className="mt-2 inline-block text-xs text-accent hover:underline">
            Edit settings
          </Link>
        )}
        {overview.meta.openDeposits ? (
          <Badge tone="neutral" className="ml-3">Open to other depositors</Badge>
        ) : (
          <Badge tone="neutral" className="ml-3">Owner-only deposits</Badge>
        )}
      </section>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-tabular mt-0.5 font-medium text-foreground">{value}</div>
    </div>
  );
}
