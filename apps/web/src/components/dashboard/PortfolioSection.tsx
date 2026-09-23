"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { MyVault } from "@/hooks/useMyVaults";
import { purposeById } from "@/lib/presets";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { VaultCard } from "@/components/vault/VaultCard";

type Filter = "all" | "owned" | "deposited";
type Sort = "recent" | "name" | "purpose";

/** The list of treasuries with filter, search and sort - all client-side over the real on-chain data. */
export function PortfolioSection({
  vaults,
  loading,
  error,
}: {
  vaults: MyVault[];
  loading: boolean;
  error: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: vaults.length,
      owned: vaults.filter((v) => v.role !== "holder").length,
      deposited: vaults.filter((v) => v.role !== "owner").length,
    }),
    [vaults]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = vaults.filter((v) => {
      if (filter === "owned" && v.role === "holder") return false;
      if (filter === "deposited" && v.role === "owner") return false;
      if (!q) return true;
      return v.overview.meta.name.toLowerCase().includes(q) || purposeById(v.overview.meta.purpose).label.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return a.overview.meta.name.localeCompare(b.overview.meta.name);
      if (sort === "purpose") return a.overview.meta.purpose - b.overview.meta.purpose || a.overview.meta.vaultId - b.overview.meta.vaultId;
      return b.overview.meta.vaultId - a.overview.meta.vaultId; // newest first
    });
  }, [vaults, filter, sort, query]);

  const FILTERS: Array<[Filter, string]> = [
    ["all", "All"],
    ["owned", "I own"],
    ["deposited", "I deposited in"],
  ];

  return (
    <section aria-label="Treasuries">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Treasuries ({vaults.length})</h2>
        {vaults.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search treasuries"
              aria-label="Search treasuries"
              className="w-40 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent sm:w-52"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort treasuries"
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="recent">Newest first</option>
              <option value="name">Name (A-Z)</option>
              <option value="purpose">Purpose</option>
            </select>
          </div>
        )}
      </div>

      {vaults.length > 0 && (counts.owned > 0 && counts.deposited > 0) && (
        <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Filter treasuries">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === key ? "border-accent bg-accent/10 text-foreground" : "border-border-strong text-muted hover:text-foreground"
              )}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      )}

      {error && vaults.length === 0 && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          Could not read your treasuries from the chain: {error}. Retrying automatically.
        </p>
      )}
      {error && vaults.length > 0 && <p className="mt-3 text-xs text-warning">Showing your last successful read - the latest refresh failed ({error}).</p>}

      {loading && vaults.length === 0 && (
        <div className="mt-4 grid gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}

      {!loading && !error && vaults.length === 0 && (
        <div className="mt-4">
          <EmptyState title="No treasuries yet.">
            Create your first treasury, then deposit real testnet STX or sBTC. You receive receipt shares - your on-chain claim on that treasury.
            <div className="mt-4">
              <Link href="/vault/create">
                <Button>Create treasury</Button>
              </Link>
            </div>
          </EmptyState>
        </div>
      )}

      {vaults.length > 0 && shown.length === 0 && <p className="mt-6 text-sm text-muted">No treasuries match your filter.</p>}

      <div className="mt-4 grid gap-4">
        {shown.map((v) => (
          <VaultCard key={v.overview.meta.vaultId} vault={v} />
        ))}
      </div>
    </section>
  );
}
