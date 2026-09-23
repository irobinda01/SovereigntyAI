"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAllDecisions, type DecisionRecord } from "@/lib/agent";
import { ASSET_LABEL, bpsToPct } from "@/lib/amounts";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { ExecutionBadge, IntentStatusBadge, OffChainTag } from "@/components/ui/StatusBadges";
import { explorerAddressUrl, explorerTxUrl, DEPLOYER_ADDRESS, isProtocolConfigured } from "@/lib/config";

export default function ActivityPage() {
  const [decisions, setDecisions] = useState<DecisionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllDecisions()
      .then(setDecisions)
      .catch((err) => setError(err instanceof Error ? err.message : "AI agent unavailable."));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI activity</h1>
      <p className="mt-2 text-sm text-muted">
        Every recommendation the AI agent produced across all vaults, with its on-chain validation result. These are{" "}
        <OffChainTag /> records - they are not blockchain events. Each vault&apos;s own on-chain history (deposits, receipts, redemptions)
        is on that vault&apos;s Activity tab.
      </p>

      {isProtocolConfigured() && (
        <a
          href={explorerAddressUrl(DEPLOYER_ADDRESS)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-accent hover:underline"
        >
          View the full protocol deployment on the explorer
        </a>
      )}

      {error && (
        <div className="mt-6">
          <EmptyState title="AI agent unavailable">{error}</EmptyState>
        </div>
      )}

      {decisions && decisions.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No AI activity yet." />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {decisions?.map((d) => (
          <Card key={d.id}>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/vault/${d.vaultId}/recommendations`} className="text-sm font-semibold text-foreground hover:underline">
                  Vault #{d.vaultId} - {d.recommendation.decision.replace("_", " ")} ({ASSET_LABEL[d.asset]})
                </Link>
                <div className="flex items-center gap-2">
                  <IntentStatusBadge status={d.status} />
                  <ExecutionBadge state={d.execution.state} />
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">{d.recommendation.reason}</p>
              {d.currentAllocation && (
                <p className="mt-2 text-xs text-muted">
                  Allocation at the time: idle {bpsToPct(d.currentAllocation.idleBps)}%
                  {d.currentAllocation.strategies.map((s) => ` · ${s.name} ${bpsToPct(s.bps)}%`).join("")}
                </p>
              )}
              {d.rejectionReason && d.status === "REJECTED" && <p className="mt-1 text-xs text-danger">{d.rejectionReason}</p>}
              <div className="mt-2 flex items-center gap-4 text-xs text-muted">
                <span>{new Date(d.timestamp).toLocaleString()}</span>
                {d.execution.txId && (
                  <a href={explorerTxUrl(d.execution.txId)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    View transaction
                  </a>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
