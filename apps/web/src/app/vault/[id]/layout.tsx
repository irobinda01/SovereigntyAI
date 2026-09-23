"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import clsx from "clsx";
import { useMemo } from "react";
import { useWallet } from "@/lib/wallet-context";
import { useVaultOverview } from "@/hooks/useVaultOverview";
import { VaultContext } from "@/components/vault/VaultContext";
import { NetworkPill } from "@/components/NetworkStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { isProtocolConfigured } from "@/lib/config";
import { modeLabel, purposeById } from "@/lib/presets";
import { shortAddress } from "@/lib/format";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "deposit", label: "Deposit" },
  { slug: "redeem", label: "Redeem" },
  { slug: "strategies", label: "Strategies" },
  { slug: "recommendations", label: "AI recommendations" },
  { slug: "activity", label: "Activity" },
  { slug: "settings", label: "Settings" },
];

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { stxAddress } = useWallet();
  const vaultId = Number(params.id);
  const validId = Number.isInteger(vaultId) && vaultId > 0;

  const { overview, error, refreshing, refresh } = useVaultOverview(validId ? vaultId : 0, stxAddress ?? null);

  const value = useMemo(
    () =>
      overview
        ? {
            vaultId,
            overview,
            viewer: stxAddress ?? null,
            isOwner: Boolean(stxAddress) && overview.meta.owner === stxAddress,
            refreshing,
            refresh,
          }
        : null,
    [overview, vaultId, stxAddress, refreshing, refresh]
  );

  if (!isProtocolConfigured()) {
    return (
      <Shell>
        <EmptyState title="Protocol not configured">NEXT_PUBLIC_DEPLOYER_ADDRESS is not set for this build.</EmptyState>
      </Shell>
    );
  }

  if (!validId) {
    return (
      <Shell>
        <EmptyState title="Invalid vault id" />
      </Shell>
    );
  }

  if (error && overview === undefined) {
    return (
      <Shell>
        <EmptyState title="Could not read this vault from the chain">
          {error}
          <div className="mt-4">
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        </EmptyState>
      </Shell>
    );
  }

  if (overview === undefined) {
    return (
      <Shell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <p className="mt-6 text-sm text-muted">Reading live vault state from the Stacks Testnet...</p>
      </Shell>
    );
  }

  if (overview === null || !value) {
    return (
      <Shell>
        <EmptyState title={`Vault #${vaultId} does not exist on-chain`}>
          <Link href="/dashboard" className="text-accent hover:underline">
            Back to my treasuries
          </Link>
        </EmptyState>
      </Shell>
    );
  }

  const { meta, risk } = overview;
  const purpose = purposeById(meta.purpose);
  const base = `/vault/${vaultId}`;

  return (
    <VaultContext.Provider value={value}>
      <Shell>
        <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
          &larr; My treasuries
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{meta.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>Vault #{vaultId}</span>
              <span className="text-muted-2">·</span>
              <span className="flex items-center gap-1">
                owner {shortAddress(meta.owner, 8)}
                <CopyButton value={meta.owner} label="Copy owner address" />
              </span>
              {value.isOwner && <Badge tone="accent">You own this</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{purpose.label}</Badge>
            <Badge tone="neutral">{modeLabel(meta.assets)}</Badge>
            <Badge tone={meta.paused ? "warning" : "success"}>{meta.paused ? "Paused" : "Active"}</Badge>
            <Badge tone={risk.autonomousEnabled ? "enforce" : "neutral"}>
              {risk.autonomousEnabled ? "Autonomous configured" : "Manual approval"}
            </Badge>
            <NetworkPill />
          </div>
        </div>

        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Vault sections">
          {TABS.map((t) => {
            const href = t.slug ? `${base}/${t.slug}` : base;
            const active = t.slug ? pathname.startsWith(href) : pathname === base;
            return (
              <Link
                key={t.slug || "overview"}
                href={href}
                className={clsx(
                  "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8">{children}</div>
      </Shell>
    </VaultContext.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
}
