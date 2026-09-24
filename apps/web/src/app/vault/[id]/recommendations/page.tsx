"use client";

import { useCallback, useEffect, useState } from "react";
import { useVault } from "@/components/vault/VaultContext";
import { analyzePoolAgainstEcosystem, getRecommendation, getVaultDecisions, type DecisionRecord, type PoolEcosystemAnalysis } from "@/lib/agent";
import { ASSET_LABEL, bpsToPct, formatAsset } from "@/lib/amounts";
import { vaultAssets } from "@/lib/derive";
import { explorerTxUrl } from "@/lib/config";
import { explainClarityError } from "@/lib/errors";
import type { Asset } from "@/lib/onchain";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { ExecutionBadge, IntentStatusBadge, OffChainTag } from "@/components/ui/StatusBadges";
import { PoolEcosystemAnalysisView } from "@/components/vault/PoolEcosystemAnalysis";
import { RecommendationView } from "@/components/vault/RecommendationView";
import { AutonomousModeNotice, TestnetExecutionBanner } from "@/components/vault/TestnetGate";

export default function RecommendationsPage() {
  const { overview, vaultId } = useVault();
  const assets = vaultAssets(overview);

  const [history, setHistory] = useState<DecisionRecord[] | null | undefined>(undefined);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [running, setRunning] = useState<Asset | null>(null);
  const [latest, setLatest] = useState<DecisionRecord | null>(null);
  const [analysis, setAnalysis] = useState<PoolEcosystemAnalysis | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [guardrailError, setGuardrailError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getVaultDecisions(vaultId));
      setHistoryError(null);
    } catch (e) {
      setHistory(null);
      setHistoryError(e instanceof Error ? e.message : "AI agent unavailable.");
    }
  }, [vaultId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function run(asset: Asset) {
    setRunning(asset);
    setRunError(null);
    setGuardrailError(null);
    setAnalysis(null);
    setLatest(null);
    // Two independent, read-only checks; a failure in one must not hide the other.
    //  1. the pool vs the REAL ecosystem protocols (the analysis shown first)
    //  2. the vault-rules recommendation, validated against the deployed contracts (also logged to history)
    const [eco, rec] = await Promise.allSettled([analyzePoolAgainstEcosystem(vaultId, asset), getRecommendation(vaultId, asset)]);
    if (eco.status === "fulfilled") setAnalysis(eco.value);
    else setRunError(eco.reason instanceof Error ? eco.reason.message : "AI agent unavailable.");
    if (rec.status === "fulfilled") {
      setLatest(rec.value.record);
      await loadHistory();
    } else {
      setGuardrailError(rec.reason instanceof Error ? rec.reason.message : "AI agent unavailable.");
    }
    setRunning(null);
  }

  return (
    <div className="space-y-6">
      <TestnetExecutionBanner environment={overview.environment} />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Run the AI analysis</div>
              <OffChainTag />
            </div>
            <p className="mt-2 text-sm text-muted">
              The agent reads this pool&apos;s real on-chain state and compares it with the real Stacks ecosystem protocols (live
              contract checks and live TVL), ranked within your own risk limits. It also has the deployed contracts check a proposed
              move (read-only). <strong>It only analyses: nothing is executed, signed or submitted, and your vault does not change.</strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {assets.map((a) => (
                <Button key={a} variant="secondary" onClick={() => run(a)} disabled={running !== null}>
                  {running === a ? "Analyzing..." : `Analyze ${ASSET_LABEL[a]} pool`}
                </Button>
              ))}
            </div>
            {runError && (
              <p className="mt-3 text-xs text-danger">
                AI agent unavailable: {runError}. Your vault and funds are unaffected - this only means no recommendation could be
                generated right now.
              </p>
            )}
          </CardBody>
        </Card>
        <AutonomousModeNotice risk={overview.risk} environment={overview.environment} />
      </div>

      {analysis && <PoolEcosystemAnalysisView analysis={analysis} />}

      {guardrailError && (
        <p className="text-xs text-danger">
          The vault-rules check could not run: {guardrailError}. The ecosystem analysis above is unaffected.
        </p>
      )}
      {latest && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Vault rules check</h2>
          <RecommendationView record={latest} overview={overview} />
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recommendation history</h2>
        {history === undefined && <p className="mt-3 text-sm text-muted">Loading...</p>}
        {historyError && (
          <div className="mt-3">
            <EmptyState title="The AI agent is unavailable">{historyError}</EmptyState>
          </div>
        )}
        {history && history.length === 0 && (
          <div className="mt-3">
            <EmptyState title="No recommendations yet for this vault.">Run an analysis above to generate the first one.</EmptyState>
          </div>
        )}
        <div className="mt-3 grid gap-3">
          {history?.map((d) => <HistoryRow key={d.id} record={d} />)}
        </div>
      </section>
    </div>
  );
}

function allocText(view: DecisionRecord["currentAllocation"], asset: Asset): string {
  if (!view) return "-";
  const parts = [`Idle ${bpsToPct(view.idleBps)}%`, ...view.strategies.map((s) => `${s.name} ${bpsToPct(s.bps)}%`)];
  return parts.join(" · ") + ` (${ASSET_LABEL[asset]})`;
}

function HistoryRow({ record }: { record: DecisionRecord }) {
  const rec = record.recommendation;
  const testnetBlocked = record.execution.state === "NOT_EXECUTED_TESTNET";
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-foreground">
            {rec.decision === "HOLD"
              ? "No action recommended"
              : rec.decision === "REBALANCE"
                ? `Rebalance ${ASSET_LABEL[record.asset]}${record.intent ? ` - ${formatAsset(BigInt(record.intent.amount), record.asset)} from idle` : ""}`
                : rec.decision === "REDUCE_EXPOSURE"
                  ? "Reduce exposure (advisory)"
                  : "Insufficient data"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OffChainTag />
            <IntentStatusBadge status={record.status} />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">{rec.reason}</p>

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <Item label="Date" value={new Date(record.timestamp).toLocaleString()} />
          <Item label="Network" value={record.network === "testnet" ? "Stacks Testnet" : "Stacks Mainnet"} />
          <Item label="Current allocation" value={allocText(record.currentAllocation, record.asset)} />
          <Item label="Proposed allocation" value={allocText(record.proposedAllocation, record.asset)} />
          <Item
            label="Risk evaluation"
            value={
              record.validation
                ? record.validation.status === "PASSED"
                  ? "PASSED (on-chain, read-only)"
                  : record.validation.status === "FAILED"
                    ? `FAILED - ${record.validation.errorCode !== undefined ? explainClarityError(record.validation.errorCode) : record.validation.detail}`
                    : "Unavailable"
                : "Not applicable"
            }
          />
          <div>
            <dt className="text-muted">Execution</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium text-foreground">
              {testnetBlocked ? "NOT EXECUTED - TESTNET" : <ExecutionBadge state={record.execution.state} />}
              {record.execution.txId && (
                <a href={explorerTxUrl(record.execution.txId)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Transaction
                </a>
              )}
            </dd>
          </div>
        </dl>
        {record.expired && <p className="mt-2 text-xs text-muted">This intent&apos;s block-height deadline has passed.</p>}
        {record.rejectionReason && record.status === "REJECTED" && (
          <p className="mt-2 text-xs text-danger">{record.rejectionReason}</p>
        )}
      </CardBody>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
