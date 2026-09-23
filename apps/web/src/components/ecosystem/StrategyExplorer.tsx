"use client";

import { useEffect, useMemo, useState } from "react";
import { EcosystemProtocol, listEcosystemProtocols } from "@/lib/ecosystem";
import { allCategories, categoryInfo } from "@/lib/ecosystemCategories";
import { StrategyCard } from "./StrategyCard";
import { StrategyAnalysisDrawer } from "./StrategyAnalysisDrawer";
import { EcosystemStats } from "./EcosystemStats";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StxPriceTicker } from "@/components/StxPriceTicker";
import clsx from "clsx";

type SortKey = "tvl" | "name";

export function StrategyExplorer() {
  const [protocols, setProtocols] = useState<EcosystemProtocol[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EcosystemProtocol | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("tvl");

  // Load, then refresh every 60s. Failures retry with backoff (3s, 6s, 12s...) and
  // NEVER clear data that was already loaded: an error only shows if nothing has loaded yet.
  useEffect(() => {
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const load = () => {
      listEcosystemProtocols()
        .then((list) => {
          if (cancelled) return;
          failures = 0;
          setProtocols(list);
          setError(null);
          timer = setTimeout(load, 60_000);
        })
        .catch((err) => {
          if (cancelled) return;
          failures++;
          setError(err instanceof Error ? err.message : "Could not load ecosystem data.");
          timer = setTimeout(load, Math.min(30_000, 3_000 * 2 ** (failures - 1)));
        });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    protocols?.forEach((p) => {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    });
    return counts;
  }, [protocols]);

  const filtered = useMemo(() => {
    if (!protocols) return null;
    const q = query.trim().toLowerCase();
    const result = protocols.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.plainSummary.toLowerCase().includes(q) ||
        categoryInfo(p.category).label.toLowerCase().includes(q)
      );
    });
    return [...result].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1);
    });
  }, [protocols, query, activeCategory, sort]);

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Ecosystem Intelligence</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Every major real, verified Stacks Mainnet protocol, explained in plain English, with live
            value-locked figures — no crypto experience needed. Click any card for a full breakdown.
          </p>
        </div>
        <StxPriceTicker />
      </div>

      <div className="mt-3 rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-xs text-muted">
        For research only. These are real protocols on the Stacks <span className="text-foreground">Mainnet</span> —{" "}
        <span className="text-foreground">SovereigntyAI itself runs on Testnet</span> and cannot move your
        funds into any of them. &quot;Verified&quot; means we independently confirmed the contract is really
        deployed and live right now; value-locked figures are fetched live from DefiLlama. Neither means
        the protocol is safe or risk-free.
      </div>

      {protocols && protocols.length > 0 && <EcosystemStats protocols={protocols} />}

      {protocols && protocols.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, e.g. &quot;lending&quot; or &quot;swap&quot;..."
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent sm:max-w-xs"
            />
            <div className="flex items-center gap-2 text-xs text-muted">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              >
                <option value="tvl">Highest value locked</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterPill active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              All ({protocols.length})
            </FilterPill>
            {allCategories()
              .filter((c) => categoryCounts[c])
              .map((c) => (
                <FilterPill key={c} active={activeCategory === c} onClick={() => setActiveCategory(c)}>
                  {categoryInfo(c).label} ({categoryCounts[c]})
                </FilterPill>
              ))}
          </div>
        </div>
      )}

      {error && !protocols && (
        <div className="mt-6">
          <EmptyState title="Live ecosystem data is temporarily unreachable">
            {error}. Retrying automatically - nothing is being guessed in the meantime.
          </EmptyState>
        </div>
      )}

      {!protocols && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-4 h-12 w-full" />
              <Skeleton className="mt-4 h-5 w-20" />
            </div>
          ))}
        </div>
      )}

      {protocols && protocols.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No ecosystem protocols configured." />
        </div>
      )}

      {filtered && filtered.length === 0 && protocols && protocols.length > 0 && (
        <div className="mt-6">
          <EmptyState title="No protocols match your search.">Try a different name or clear the filter.</EmptyState>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtered?.map((p) => (
          <StrategyCard key={p.id} protocol={p} onAnalyze={() => setSelected(p)} />
        ))}
      </div>

      <StrategyAnalysisDrawer protocol={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border-strong text-muted hover:border-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
