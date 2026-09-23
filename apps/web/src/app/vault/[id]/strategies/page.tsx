"use client";

import Link from "next/link";
import { useVault } from "@/components/vault/VaultContext";
import { ASSET_LABEL, bpsToPct, formatAsset } from "@/lib/amounts";
import { poolAllocation, vaultAssets } from "@/lib/derive";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { AllocationBar } from "@/components/vault/AllocationBar";
import { TestnetExecutionBanner } from "@/components/vault/TestnetGate";
import { shortAddress } from "@/lib/format";

export default function VaultStrategiesPage() {
  const { overview, vaultId } = useVault();
  const assets = vaultAssets(overview);
  const active = overview.strategies.filter((s) => s.active && assets.includes(s.asset));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-warning">
        Autonomous execution disabled on Testnet
      </div>
      <TestnetExecutionBanner environment={overview.environment} />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">This vault&apos;s allocation</h2>
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
                    <>
                      <AllocationBar
                        slices={[
                          { label: "Idle", bps: alloc.idleBps, tone: "idle" },
                          ...alloc.strategies.map((s) => ({ label: s.name, bps: s.bps, tone: "strategy" as const })),
                        ]}
                      />
                      <p className="mt-3 text-xs text-muted">
                        {formatAsset(alloc.idle, asset)} idle of {formatAsset(alloc.total, asset)} total.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">This pool is empty - no allocation to show.</p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Approved strategies on this network</h2>
        {active.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No approved strategies are registered for this vault's assets.">
              A strategy can only receive vault funds after protocol governance registers and activates it in the on-chain
              strategy registry. None has been verified as a real, current Testnet integration, so none is listed and all funds
              remain idle - exactly as configured.
              <div className="mt-3">
                <Link href="/strategies" className="text-accent hover:underline">
                  Why strategies are empty
                </Link>
              </div>
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {active.map((s) => {
              const amount = overview.allocations.find((a) => a.strategyId === s.strategyId && a.asset === s.asset)?.amount ?? 0n;
              return (
                <Card key={s.strategyId}>
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{s.name}</div>
                      <div className="font-tabular mt-1 text-xs text-muted">{shortAddress(s.contract, 10)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <Badge tone="accent">{ASSET_LABEL[s.asset]}</Badge>
                      <Badge tone="enforce">Registered</Badge>
                      <span>protocol cap {bpsToPct(s.maxAllocationBps)}%</span>
                      <span className="font-medium text-foreground">This vault: {formatAsset(amount, s.asset)}</span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        Recommendations for this vault are on the{" "}
        <Link href={`/vault/${vaultId}/recommendations`} className="text-accent hover:underline">
          AI recommendations
        </Link>{" "}
        tab. On Testnet they can be analysed and validated, but never executed.
      </p>
    </div>
  );
}
