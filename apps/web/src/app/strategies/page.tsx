"use client";

import { useEffect, useState } from "react";
import { getExecutionEnvironment, listStrategies, type ExecutionEnvironment, type StrategyData } from "@/lib/onchain";
import { isProtocolConfigured } from "@/lib/config";
import { ASSET_LABEL, bpsToPct } from "@/lib/amounts";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TestnetExecutionBanner } from "@/components/vault/TestnetGate";
import { shortAddress } from "@/lib/format";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyData[] | null>(null);
  const [env, setEnv] = useState<ExecutionEnvironment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isProtocolConfigured()) return;
    listStrategies()
      .then(setStrategies)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load strategies."));
    getExecutionEnvironment().then(setEnv).catch(() => setEnv(null));
  }, []);

  const active = strategies?.filter((s) => s.active) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-warning">
        Autonomous execution disabled on Testnet
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Strategies</h1>
      <p className="mt-2 text-sm text-muted">
        Every destination a vault&apos;s funds can be allocated to must be explicitly registered and activated here by protocol
        governance before the execution engine will route anything to it. Each strategy supports exactly one asset (STX or sBTC).
      </p>

      {env && (
        <div className="mt-5">
          <TestnetExecutionBanner environment={env} />
        </div>
      )}

      {!isProtocolConfigured() && (
        <div className="mt-6">
          <EmptyState title="Protocol not yet deployed on this network" />
        </div>
      )}

      {error && <p className="mt-6 text-sm text-danger">{error}</p>}

      {isProtocolConfigured() && strategies === null && !error && (
        <p className="mt-6 text-sm text-muted">Fetching live strategy registry state...</p>
      )}

      {strategies && active.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No live strategies are currently available on this network.">
            No third-party Stacks Testnet protocol with a verified, current interface has been registered and activated by
            governance yet, and this project never fakes an integration. Idle funds simply remain held in each vault. See
            docs/strategies.md for how a real strategy gets added.
          </EmptyState>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {active.map((s) => (
          <Card key={s.strategyId}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{s.name}</div>
                <div className="font-tabular mt-1 text-xs text-muted">{shortAddress(s.contract, 10)}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="accent">{ASSET_LABEL[s.asset]}</Badge>
                <Badge tone="enforce">Registered</Badge>
                <span className="text-xs text-muted">max {bpsToPct(s.maxAllocationBps)}% of a pool</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
