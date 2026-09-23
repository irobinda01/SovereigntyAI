"use client";

import Link from "next/link";
import type { VaultEvent } from "@/lib/activity";
import type { DecisionRecord } from "@/lib/agent";
import { ASSET_LABEL, formatAsset, formatShares, type AssetKey } from "@/lib/amounts";
import { explorerTxUrl } from "@/lib/config";
import { IntentStatusBadge, OffChainTag, OnChainTag } from "@/components/ui/StatusBadges";
import { Skeleton } from "@/components/ui/Skeleton";

export interface FeedItem {
  key: string;
  time: number;
  vaultId: number;
  vaultName: string;
  title: string;
  detail?: string;
  source: "chain" | "ai";
  txId?: string;
  status?: DecisionRecord["status"];
}

const isAsset = (v: unknown): v is AssetKey => v === "STX" || v === "SBTC";

export function chainItem(e: VaultEvent, vaultName: string): FeedItem {
  const d = e.data;
  const asset = isAsset(d.asset) ? d.asset : null;
  const amount = typeof d.amount === "string" ? BigInt(d.amount) : null;
  const shares = typeof d.shares === "string" ? BigInt(d.shares) : null;
  const base = { key: `${e.txId}:${e.eventIndex}`, time: e.time ? Date.parse(e.time) : 0, vaultId: e.vaultId, vaultName, source: "chain" as const, txId: e.txId };
  switch (e.kind) {
    case "vault-created":
      return { ...base, title: "Treasury created" };
    case "deposit":
      return { ...base, title: "Deposit", detail: [asset && amount !== null ? formatAsset(amount, asset) : null, shares !== null ? `${formatShares(shares)} shares minted` : null].filter(Boolean).join(" · ") };
    case "redeem":
      return { ...base, title: "Redemption", detail: [shares !== null ? `${formatShares(shares)} shares burned` : null, asset && amount !== null ? `${formatAsset(amount, asset)} received` : null].filter(Boolean).join(" · ") };
    case "risk-config-updated":
      return { ...base, title: "Risk settings updated" };
    case "autonomous-mode-updated":
      return { ...base, title: "Autonomous mode updated", detail: d["autonomous-enabled"] === true ? "Configured" : "Off" };
    case "vault-config-updated":
      return { ...base, title: "Vault settings updated" };
    case "vault-paused":
      return { ...base, title: "Vault paused" };
    case "vault-unpaused":
      return { ...base, title: "Vault unpaused" };
    default:
      return { ...base, title: e.kind };
  }
}

export function aiItem(r: DecisionRecord, vaultName: string): FeedItem {
  const rec = r.recommendation;
  return {
    key: `ai:${r.id}`,
    time: Date.parse(r.timestamp),
    vaultId: r.vaultId,
    vaultName,
    source: "ai",
    title: rec.decision === "HOLD" ? `AI analysis (${ASSET_LABEL[r.asset]}): no action` : `AI recommendation (${ASSET_LABEL[r.asset]})`,
    detail: r.status === "TESTNET_BLOCKED" ? "Validated - execution disabled on Testnet" : undefined,
    status: rec.decision === "HOLD" ? undefined : r.status,
  };
}

function ago(ms: number): string {
  if (!ms) return "pending";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RecentActivity({ items, loading }: { items: FeedItem[]; loading: boolean }) {
  return (
    <section aria-label="Recent activity">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recent activity</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        {loading && items.length === 0 && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        )}
        {!loading && items.length === 0 && <p className="p-5 text-sm text-muted">No activity yet. Deposits, redemptions and AI analyses will appear here.</p>}
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{it.title}</span>
                  {it.source === "chain" ? <OnChainTag /> : <OffChainTag />}
                  {it.status && <IntentStatusBadge status={it.status} />}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  <Link href={`/vault/${it.vaultId}`} className="hover:text-foreground hover:underline">
                    {it.vaultName}
                  </Link>
                  {it.detail ? ` · ${it.detail}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div>{ago(it.time)}</div>
                {it.txId && (
                  <a href={explorerTxUrl(it.txId)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Tx
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
