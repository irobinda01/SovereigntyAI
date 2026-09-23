"use client";

import Link from "next/link";
import { useState } from "react";
import type { AllocationView, DecisionRecord } from "@/lib/agent";
import type { VaultOverview } from "@/lib/onchain";
import { formatAsset, bpsToPct, ASSET_LABEL } from "@/lib/amounts";
import { poolAllocation } from "@/lib/derive";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ExecutionBadge, IntentStatusBadge, OffChainTag } from "@/components/ui/StatusBadges";
import { AllocationBar, type AllocationSlice } from "./AllocationBar";
import { ExecutionStatusChecklist, TestnetExecutionBanner } from "./TestnetGate";
import { explainClarityError } from "@/lib/errors";

function slicesOf(view: AllocationView | null): AllocationSlice[] {
  if (!view) return [];
  return [
    { label: "Idle", bps: view.idleBps, tone: "idle" as const },
    ...view.strategies.map((s) => ({ label: s.name, bps: s.bps, tone: "strategy" as const })),
  ];
}

/** Does the vault's REAL current allocation still match the snapshot this recommendation was made against? */
function allocationUnchanged(record: DecisionRecord, overview: VaultOverview): boolean | null {
  const snapshot = record.currentAllocation;
  const live = poolAllocation(overview, record.asset);
  if (!snapshot || !live) return null;
  for (const s of snapshot.strategies) {
    const now = live.strategies.find((x) => x.strategyId === s.strategyId);
    if (!now || now.amount.toString() !== s.amount) return false;
  }
  return live.strategies.length === snapshot.strategies.length;
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "neutral" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

export function RecommendationView({ record, overview }: { record: DecisionRecord; overview: VaultOverview }) {
  const [showDetails, setShowDetails] = useState(false);
  const rec = record.recommendation;
  const asset = record.asset;
  const intent = record.intent;
  const blocked = record.status === "TESTNET_BLOCKED";
  const strategyName = (id?: number) =>
    record.currentAllocation?.strategies.find((s) => s.strategyId === id)?.name ?? (id !== undefined ? `Strategy #${id}` : "strategy");

  const movedBps =
    record.currentAllocation && record.proposedAllocation
      ? record.currentAllocation.idleBps - record.proposedAllocation.idleBps
      : null;
  const proposedExposure = record.proposedAllocation?.strategies.find((s) => s.strategyId === rec.destStrategyId)?.bps ?? null;

  const unchanged = allocationUnchanged(record, overview);
  const validated = record.validation?.status === "PASSED";

  // ---- nothing actionable: HOLD / INSUFFICIENT_DATA / advisory
  if (rec.decision !== "REBALANCE") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">AI treasury recommendation - {ASSET_LABEL[asset]}</div>
          <div className="flex items-center gap-2">
            <OffChainTag />
            <Badge tone={rec.decision === "REDUCE_EXPOSURE" ? "warning" : "neutral"}>
              {rec.decision === "HOLD" ? "No action recommended" : rec.decision === "REDUCE_EXPOSURE" ? "Advisory" : "Insufficient data"}
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-sm text-foreground">{rec.reason}</p>
        <p className="mt-2 text-xs text-muted">
          Your assets remain in their current allocation. Generated {new Date(rec.generatedAt).toLocaleString()} from live on-chain state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {blocked ? "AI recommendation ready" : "AI treasury recommendation"} - {ASSET_LABEL[asset]}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OffChainTag />
            <IntentStatusBadge status={record.status} />
            <Badge tone="neutral">Recommendation only</Badge>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted">
          Vault: <span className="font-medium text-foreground">{overview.meta.name}</span>
          {" - "}Your AI treasury agent identified a potential reallocation. This is a proposal; nothing has been executed.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Current allocation</div>
            {record.currentAllocation ? <AllocationBar slices={slicesOf(record.currentAllocation)} /> : <p className="text-sm text-muted">Unavailable</p>}
          </div>
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Recommended allocation</div>
            {record.proposedAllocation ? <AllocationBar slices={slicesOf(record.proposedAllocation)} /> : <p className="text-sm text-muted">Unavailable</p>}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-surface-raised p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Proposed movement</div>
          <div className="mt-1 font-medium text-foreground">
            {movedBps !== null ? `${bpsToPct(movedBps)}% ` : ""}
            {intent ? `(${formatAsset(BigInt(intent.amount), asset)}) ` : ""}
            idle &rarr; {strategyName(rec.destStrategyId)}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Configured maximum exposure (per strategy)</dt>
            <dd className="mt-1 font-tabular font-medium text-foreground">{bpsToPct(overview.risk.maxExposureBps)}%</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Proposed exposure</dt>
            <dd className="mt-1 font-tabular font-medium text-foreground">{proposedExposure !== null ? `${bpsToPct(proposedExposure)}%` : "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Estimated slippage</dt>
            <dd className="mt-1 font-medium text-foreground">
              Unavailable
              <span className="ml-2 text-xs font-normal text-muted">
                no verified market data for this strategy; capped at {bpsToPct(overview.risk.maxSlippageBps)}% by your configuration
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Strategy availability</dt>
            <dd className="mt-1 font-medium text-foreground">
              {overview.strategies.find((s) => s.strategyId === rec.destStrategyId)?.active ? "Registered and active" : "Not active"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Hide recommendation" : "Review recommendation"}
          </Button>
          <Link href={`/vault/${overview.meta.vaultId}`}>
            <Button size="sm" variant="secondary">View vault</Button>
          </Link>
          <Link href={`/vault/${overview.meta.vaultId}/settings`}>
            <Button size="sm" variant="secondary">View risk parameters</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setShowDetails(true)}>
            View AI analysis
          </Button>
        </div>

        {showDetails && (
          <div className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Reason</div>
              <p className="mt-1 text-foreground">{rec.reason}</p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Expected benefit</div>
              <p className="mt-1 text-foreground">{rec.expectedBenefit}</p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Risk assessment</div>
              <p className="mt-1 text-foreground">{rec.riskAssessment}</p>
            </div>
            <p className="text-xs text-muted">
              Confidence {(rec.confidence * 100).toFixed(0)}% is informational only and is never used to bypass any on-chain check.
            </p>
            {intent && (
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface-raised p-3 text-xs text-muted">{JSON.stringify(intent, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-6">
          <ExecutionStatusChecklist record={record} environment={overview.environment} />
        </div>
        <TestnetExecutionBanner environment={overview.environment} />
      </div>

      {blocked && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Outcome</div>
          <div className="mt-2">
            <StatusLine label="Recommendation" value="READY" tone="ok" />
            <StatusLine
              label="Risk validation"
              value={validated ? "PASSED" : "NOT PASSED"}
              tone={validated ? "ok" : "warn"}
            />
            <StatusLine label="Execution authorization" value="NOT AVAILABLE ON TESTNET" tone="warn" />
            <StatusLine label="Strategy transaction" value="NOT SUBMITTED" />
            <StatusLine
              label="Vault allocation"
              value={unchanged === false ? "Balances have changed since this recommendation" : "UNCHANGED"}
              tone={unchanged === false ? "warn" : "ok"}
            />
            <StatusLine label="Assets" value="SAFE IN CURRENT ALLOCATION" tone="ok" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ExecutionBadge state={record.execution.state} />
            <span className="text-xs text-muted">Validated by the deployed contracts (read-only) - no transaction was created.</span>
          </div>
        </div>
      )}

      {record.status === "REJECTED" && record.validation?.errorCode !== undefined && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm">
          <div className="font-medium text-foreground">The vault&apos;s on-chain rules rejected this intent</div>
          <p className="mt-1 text-muted">{explainClarityError(record.validation.errorCode)}</p>
          <p className="mt-2 text-xs text-muted">Nothing was executed and your allocation is unchanged.</p>
        </div>
      )}
    </div>
  );
}
