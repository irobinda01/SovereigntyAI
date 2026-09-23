"use client";

import { useEffect, useMemo, useState } from "react";
import { useVault } from "@/components/vault/VaultContext";
import { getVaultEvents, type VaultEvent } from "@/lib/activity";
import { getVaultDecisions, type DecisionRecord } from "@/lib/agent";
import { ASSET_LABEL, formatAsset, formatShares, type AssetKey } from "@/lib/amounts";
import { explorerTxUrl } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { IntentStatusBadge, OffChainTag, OnChainTag } from "@/components/ui/StatusBadges";

interface Row {
  key: string;
  time: number;
  source: "chain" | "ai";
  title: string;
  lines: string[];
  txId?: string;
  status?: DecisionRecord["status"];
}

const isAsset = (v: unknown): v is AssetKey => v === "STX" || v === "SBTC";

function chainRow(e: VaultEvent): Row {
  const d = e.data;
  const asset = isAsset(d.asset) ? d.asset : null;
  const amount = typeof d.amount === "string" ? BigInt(d.amount) : null;
  const shares = typeof d.shares === "string" ? BigInt(d.shares) : null;
  const base = { key: `${e.txId}:${e.eventIndex}`, time: e.time ? Date.parse(e.time) : 0, source: "chain" as const, txId: e.txId };

  switch (e.kind) {
    case "vault-created":
      return { ...base, title: "Vault created", lines: [`Owner ${shortAddress(String(d.owner), 8)}`] };
    case "deposit":
      return {
        ...base,
        title: asset ? `${ASSET_LABEL[asset]} deposited` : "Deposit",
        lines: [
          ...(asset && amount !== null ? [`Deposited ${formatAsset(amount, asset)}`] : []),
          ...(shares !== null ? [`Receipt tokens minted: ${formatShares(shares)}`] : []),
          `By ${shortAddress(String(d.depositor), 8)}`,
        ],
      };
    case "redeem":
      return {
        ...base,
        title: "Withdrawal",
        lines: [
          ...(shares !== null ? [`Receipt tokens burned: ${formatShares(shares)}`] : []),
          ...(asset && amount !== null ? [`Received ${formatAsset(amount, asset)}`] : []),
          `By ${shortAddress(String(d.holder), 8)}`,
        ],
      };
    case "risk-config-updated":
      return { ...base, title: "Risk settings updated", lines: [`Autonomous mode ${d["autonomous-enabled"] === true ? "configured" : "off"}`] };
    case "autonomous-mode-updated":
      return { ...base, title: "Autonomous mode updated", lines: [d["autonomous-enabled"] === true ? "Configured" : "Off - manual approval"] };
    case "vault-config-updated":
      return { ...base, title: "Vault settings updated", lines: [`Name: ${String(d.name)}`, `Open deposits: ${d["open-deposits"] === true ? "yes" : "no"}`] };
    case "vault-paused":
      return { ...base, title: "Vault paused", lines: ["Deposits disabled; redemptions unaffected"] };
    case "vault-unpaused":
      return { ...base, title: "Vault unpaused", lines: [] };
    case "rebalance-executed":
    case "intent-executed":
      return { ...base, title: "Strategy allocation executed", lines: asset && amount !== null ? [formatAsset(amount, asset)] : [] };
    default:
      return { ...base, title: e.kind, lines: [] };
  }
}

function aiRow(r: DecisionRecord): Row {
  const lines: string[] = [];
  const rec = r.recommendation;
  lines.push(rec.decision === "HOLD" ? "No action recommended" : `Recommendation: ${rec.decision.replace("_", " ").toLowerCase()} (${ASSET_LABEL[r.asset]})`);
  if (r.intent) lines.push("Intent generated");
  if (r.status === "REJECTED") lines.push("Intent rejected");
  if (r.status === "TESTNET_BLOCKED") lines.push("Testnet execution blocked - no transaction was submitted");
  return {
    key: `ai:${r.id}`,
    time: Date.parse(r.timestamp),
    source: "ai",
    title: "AI recommendation generated",
    lines,
    status: r.status,
    txId: r.execution.txId ?? undefined,
  };
}

export default function ActivityPage() {
  const { vaultId } = useVault();
  const [events, setEvents] = useState<VaultEvent[] | undefined>(undefined);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getVaultEvents(vaultId)
      .then((e) => !cancelled && setEvents(e))
      .catch((err) => {
        if (cancelled) return;
        setEventsError(err instanceof Error ? err.message : "Could not load on-chain activity.");
        setEvents([]);
      });
    getVaultDecisions(vaultId)
      .then((d) => !cancelled && setDecisions(d))
      .catch(() => !cancelled && setDecisions(null));
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    (events ?? []).forEach((e) => out.push(chainRow(e)));
    (decisions ?? []).forEach((d) => out.push(aiRow(d)));
    return out.sort((a, b) => b.time - a.time);
  }, [events, decisions]);

  const loading = events === undefined || decisions === undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        This vault&apos;s own history. <OnChainTag /> rows are contract events linked to a real transaction; <OffChainTag /> rows
        are analysis records from the AI agent, not blockchain events.
      </p>

      {eventsError && <p className="text-xs text-danger">On-chain activity could not be fully loaded: {eventsError}</p>}
      {decisions === null && <p className="text-xs text-muted">AI activity is unavailable (agent not reachable); on-chain activity is shown below.</p>}
      {loading && <p className="text-sm text-muted">Loading activity...</p>}

      {!loading && rows.length === 0 && <EmptyState title="No activity yet for this vault." />}

      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.key}>
            <CardBody className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{r.title}</span>
                  {r.source === "chain" ? <OnChainTag /> : <OffChainTag />}
                  {r.status && <IntentStatusBadge status={r.status} />}
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-muted">
                  {r.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
              <div className="text-right text-xs text-muted">
                <div>{r.time ? new Date(r.time).toLocaleString() : "time pending"}</div>
                {r.source === "chain" && r.txId && (
                  <a href={explorerTxUrl(r.txId)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent hover:underline">
                    View transaction
                  </a>
                )}
                {r.source === "ai" && r.txId && (
                  <a href={explorerTxUrl(r.txId)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-accent hover:underline">
                    Related transaction
                  </a>
                )}
                {r.source === "ai" && !r.txId && <Badge tone="neutral" className="mt-1">No transaction</Badge>}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
