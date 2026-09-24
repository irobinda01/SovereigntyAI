"use client";

import { useState } from "react";
import type { PoolEcosystemAnalysis, StrategyEvaluation } from "@/lib/agent";
import { ASSET_LABEL, bpsToPct, formatAsset } from "@/lib/amounts";
import { EXPLORER_BASE } from "@/lib/config";
import { Badge } from "@/components/ui/Badge";
import { OffChainTag } from "@/components/ui/StatusBadges";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pctText = (p: number) => (p < 0.01 ? "<0.01%" : `${p.toFixed(2)}%`);

/**
 * Result of comparing one asset pool with the real Mainnet ecosystem protocols.
 * Presentation only: nothing here changes the vault, and the "not executed"
 * notice is always shown - the analysis is never applied.
 */
export function PoolEcosystemAnalysisView({ analysis }: { analysis: PoolEcosystemAnalysis }) {
  const asset = analysis.asset;
  const label = ASSET_LABEL[asset];
  const candidates = analysis.strategies.filter((s) => s.verdict === "CANDIDATE");
  const excluded = analysis.strategies.filter((s) => s.verdict === "EXCLUDED");
  const [showExcluded, setShowExcluded] = useState(false);
  const deployable = BigInt(analysis.pool.maxDeployable);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label} pool vs real ecosystem strategies</div>
          <div className="flex flex-wrap items-center gap-2">
            <OffChainTag />
            <Badge tone="warning">Analysis only - not executed</Badge>
          </div>
        </div>

        <p className="mt-3 text-sm text-foreground">{analysis.summary}</p>

        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">{analysis.executionNote}</div>

        <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Item label="Pool balance" value={formatAsset(BigInt(analysis.pool.totalBalance), asset)} />
          <Item label="Idle" value={`${formatAsset(BigInt(analysis.pool.idleBalance), asset)} (${bpsToPct(analysis.pool.idleBps)}%)`} />
          <Item
            label="Your limits"
            value={`${bpsToPct(analysis.pool.maxExposureBps)}% max per strategy · ${bpsToPct(analysis.pool.minIdleBps)}% min idle`}
          />
          <Item label="Most your rules would allow" value={deployable > 0n ? formatAsset(deployable, asset) : "Nothing right now"} />
        </dl>

        {analysis.blockers.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
            {analysis.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Ranked candidates ({candidates.length})</h3>
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reviewed protocol qualifies for this pool right now.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {candidates.map((s) => (
              <StrategyCard key={s.protocolId} s={s} asset={asset} top={s.protocolId === analysis.topPickId} />
            ))}
          </div>
        )}
      </section>

      {excluded.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
            aria-expanded={showExcluded}
          >
            {showExcluded ? "Hide" : "Show"} {excluded.length} protocol{excluded.length === 1 ? "" : "s"} not considered for {label}
          </button>
          {showExcluded && (
            <div className="mt-3 grid gap-3">
              {excluded.map((s) => (
                <StrategyCard key={s.protocolId} s={s} asset={asset} top={false} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">What this analysis does not tell you</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
          {analysis.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Generated {new Date(analysis.generatedAt).toLocaleString()} from live on-chain state and public data.
          {analysis.stxPriceUsd !== null && ` STX price used: $${analysis.stxPriceUsd.toFixed(4)}.`}
        </p>
      </div>
    </div>
  );
}

function StrategyCard({ s, asset, top }: { s: StrategyEvaluation; asset: PoolEcosystemAnalysis["asset"]; top: boolean }) {
  const h = s.hypotheticalAllocation;
  const candidate = s.verdict === "CANDIDATE";
  return (
    <div className={`rounded-xl border p-5 ${top ? "border-accent/50 bg-accent/5" : "border-border bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {s.rank !== null && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-foreground">
              {s.rank}
            </span>
          )}
          <div>
            <div className="text-sm font-semibold text-foreground">{s.name}</div>
            <div className="text-xs text-muted">{s.category}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {top && <Badge tone="accent">Best fit</Badge>}
          {candidate && <Badge tone={s.riskTier === 1 ? "success" : s.riskTier === 2 ? "warning" : "danger"}>{s.riskLabel} risk</Badge>}
          <Badge tone={s.contractLive === true ? "success" : s.contractLive === false ? "danger" : "neutral"}>
            {s.contractLive === true ? "Contract live" : s.contractLive === false ? "Contract not found" : "Not verified"}
          </Badge>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">{s.plainSummary}</p>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-foreground">
        {s.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {candidate && <p className="mt-2 text-xs text-muted">{s.riskNote}</p>}

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <Item label="Live TVL (DefiLlama)" value={s.tvlUsd !== null ? usd(s.tvlUsd) : "Unavailable"} />
        <Item
          label="If executed (hypothetical)"
          value={h ? `${formatAsset(BigInt(h.amount), asset)} · ${bpsToPct(h.bpsOfPool)}% of pool` : "-"}
        />
        <Item label="Share of protocol TVL" value={h?.shareOfProtocolTvlPct != null ? pctText(h.shareOfProtocolTvlPct) : "-"} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <a href={s.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Protocol site (check live rates)
        </a>
        <a
          href={`${EXPLORER_BASE}/address/${s.contractId}?chain=mainnet`}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Mainnet contract
        </a>
      </div>
    </div>
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
