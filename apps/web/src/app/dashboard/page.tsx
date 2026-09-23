"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { useBalances } from "@/hooks/useBalances";
import { useMyVaults } from "@/hooks/useMyVaults";
import { getAllDecisions, type DecisionRecord } from "@/lib/agent";
import { getRecentActivity } from "@/lib/activity";
import { getExecutionEnvironment, type ExecutionEnvironment } from "@/lib/onchain";
import { formatAsset } from "@/lib/amounts";
import { isProtocolConfigured } from "@/lib/config";
import { networkOfAddress } from "@/lib/wallet";
import { explainClarityError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { NetworkPill } from "@/components/NetworkStrip";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { AttentionPanel, type AttentionItem } from "@/components/dashboard/AttentionPanel";
import { GettingStarted, type Step } from "@/components/dashboard/GettingStarted";
import { PortfolioSection } from "@/components/dashboard/PortfolioSection";
import { RecentActivity, aiItem, chainItem, type FeedItem } from "@/components/dashboard/RecentActivity";

const STX_FAUCET = "https://explorer.hiro.so/sandbox/faucet?chain=testnet";
const LOW_STX = 100_000n; // 0.1 STX: enough for a handful of transaction fees

function Updated({ at, refreshing }: { at: number | null; refreshing: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  if (refreshing) return <span className="text-xs text-muted">Refreshing...</span>;
  if (!at) return null;
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return <span className="text-xs text-muted">Updated {s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`}</span>;
}

export default function DashboardPage() {
  const { connected, stxAddress, connect, connecting } = useWallet();
  const balances = useBalances(stxAddress);
  const { vaults, loading, refreshing, error, updatedAt, refresh } = useMyVaults(stxAddress);

  const [decisions, setDecisions] = useState<DecisionRecord[] | null>(null);
  const [activity, setActivity] = useState<FeedItem[] | null>(null);
  const [env, setEnv] = useState<ExecutionEnvironment | null>(null);

  useEffect(() => {
    getExecutionEnvironment().then(setEnv).catch(() => setEnv(null));
  }, []);

  const ids = useMemo(() => vaults.map((v) => v.overview.meta.vaultId), [vaults]);
  const ownedIds = useMemo(() => vaults.filter((v) => v.role !== "holder").map((v) => v.overview.meta.vaultId), [vaults]);
  const nameOf = useMemo(() => new Map(vaults.map((v) => [v.overview.meta.vaultId, v.overview.meta.name])), [vaults]);
  const idsKey = ids.join(",");

  // AI decision log (off-chain) and on-chain activity, for MY vaults only.
  useEffect(() => {
    if (!stxAddress || ids.length === 0) {
      setDecisions(null);
      setActivity(ids.length === 0 && updatedAt ? [] : null);
      return;
    }
    let cancelled = false;
    getAllDecisions()
      .then((all) => !cancelled && setDecisions(all.filter((d) => ids.includes(d.vaultId))))
      .catch(() => !cancelled && setDecisions([]));
    getRecentActivity(ids, ownedIds, stxAddress)
      .then((events) => !cancelled && setActivity(events.map((e) => chainItem(e, nameOf.get(e.vaultId) ?? `Vault #${e.vaultId}`))))
      .catch(() => !cancelled && setActivity([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stxAddress, idsKey, updatedAt]);

  const feed = useMemo(() => {
    const items: FeedItem[] = [...(activity ?? [])];
    (decisions ?? []).slice(0, 6).forEach((d) => items.push(aiItem(d, nameOf.get(d.vaultId) ?? `Vault #${d.vaultId}`)));
    return items.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [activity, decisions, nameOf]);

  // ------------------------------------------------------------------ derived, real state
  const claim = useMemo(() => {
    const c = { STX: 0n, SBTC: 0n };
    for (const v of vaults) for (const a of ["STX", "SBTC"] as const) c[a] += v.overview.positions[a]?.claim ?? 0n;
    return c;
  }, [vaults]);

  const hasDeposit = vaults.some((v) => Object.values(v.overview.positions).some((p) => p && p.shares > 0n));
  const hasVault = ownedIds.length > 0;
  const hasAnalysis = (decisions ?? []).length > 0;
  const funded = balances.stx !== null && balances.stx >= 1_000_000n;
  const firstOwned = ownedIds[0];
  const firstVault = ids[0];

  const steps: Step[] = [
    { key: "connect", title: "Connect wallet", detail: `Connected as ${stxAddress ? shortAddress(stxAddress, 6) : ""}.`, done: true },
    {
      key: "fund",
      title: "Get testnet STX",
      detail: "Deposits and fees use real testnet STX. The faucet is free.",
      done: funded,
      href: STX_FAUCET,
      cta: "Open faucet",
      external: true,
    },
    { key: "create", title: "Create a treasury", detail: "Choose a purpose, name, assets and risk rules; sign once.", done: hasVault, href: "/vault/create", cta: "Create" },
    {
      key: "deposit",
      title: "Make a deposit",
      detail: "Receive receipt shares - your on-chain claim on the treasury.",
      done: hasDeposit,
      href: firstVault ? `/vault/${firstVault}/deposit` : "/vault/create",
      cta: firstVault ? "Deposit" : "Create first",
    },
    {
      key: "ai",
      title: "Run an AI analysis",
      detail: "The AI reads your real state, recommends, and the contracts validate it.",
      done: hasAnalysis,
      href: firstOwned ? `/vault/${firstOwned}/recommendations` : firstVault ? `/vault/${firstVault}/recommendations` : "/vault/create",
      cta: firstVault ? "Analyze" : "Create first",
    },
  ];
  const allDone = steps.every((s) => s.done);

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (stxAddress && networkOfAddress(stxAddress) === "mainnet") {
      items.push({ key: "net", tone: "danger", title: "Wallet is on a mainnet account", detail: "SovereigntyAI runs on Stacks Testnet. Switch to a testnet account before transacting." });
    }
    if (balances.stx !== null && balances.stx < LOW_STX) {
      items.push({
        key: "lowstx",
        tone: "warning",
        title: "Low STX for network fees",
        detail: `Your wallet holds ${formatAsset(balances.stx, "STX")}. Top up from the faucet to keep transacting.`,
        href: STX_FAUCET,
        cta: "Get STX",
        external: true,
      });
    }
    for (const v of vaults) {
      const m = v.overview.meta;
      const owner = v.role !== "holder";
      if (m.paused) {
        items.push({
          key: `paused-${m.vaultId}`,
          tone: "warning",
          title: `${m.name} is paused`,
          detail: "Deposits and new allocations are disabled. Redemptions still work.",
          href: `/vault/${m.vaultId}${owner ? "/settings" : ""}`,
          cta: owner ? "Unpause" : "View",
        });
      }
      const empty = Object.values(v.overview.pools).every((p) => !p || p.total === 0n);
      if (owner && empty && !m.paused) {
        items.push({
          key: `empty-${m.vaultId}`,
          tone: "info",
          title: `${m.name} is empty`,
          detail: "Make the first deposit to mint receipt shares and start using it.",
          href: `/vault/${m.vaultId}/deposit`,
          cta: "Deposit",
        });
      }
    }
    // Latest AI outcome per vault worth surfacing.
    const seen = new Set<number>();
    for (const d of decisions ?? []) {
      if (seen.has(d.vaultId)) continue;
      seen.add(d.vaultId);
      const name = nameOf.get(d.vaultId) ?? `Vault #${d.vaultId}`;
      if (d.status === "REJECTED" && d.validation?.errorCode !== undefined) {
        items.push({
          key: `rej-${d.id}`,
          tone: "warning",
          title: `AI intent rejected for ${name}`,
          detail: `${explainClarityError(d.validation.errorCode)} Nothing was executed.`,
          href: `/vault/${d.vaultId}/recommendations`,
          cta: "Review",
        });
      } else if (d.status === "TESTNET_BLOCKED") {
        items.push({
          key: `blk-${d.id}`,
          tone: "info",
          title: `Recommendation ready for ${name}`,
          detail: "Validated against your on-chain rules. Execution is disabled on Testnet, so your allocation is unchanged.",
          href: `/vault/${d.vaultId}/recommendations`,
          cta: "Review",
        });
      }
    }
    return items.slice(0, 6);
  }, [stxAddress, balances.stx, vaults, decisions, nameOf]);

  // ------------------------------------------------------------------ gates
  if (!isProtocolConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState title="Protocol not yet deployed on this network">NEXT_PUBLIC_DEPLOYER_ADDRESS is not configured. See docs/deployment.md.</EmptyState>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-3xl border border-border-strong bg-surface p-8 text-center sm:p-12">
          <NetworkPill />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">Your treasuries, in one place.</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-muted">
            Connect a Stacks Testnet wallet to see every treasury you own or have deposited in, your receipt shares, and what the AI
            recommends. Everything is read from the chain, so it looks the same on any device.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting..." : "Connect wallet"}
            </Button>
            <Link href="/docs/user-guide">
              <Button size="lg" variant="secondary">
                How it works
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">My treasuries</h1>
            <NetworkPill />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span className="flex items-center gap-1">
              {stxAddress && shortAddress(stxAddress, 8)}
              {stxAddress && <CopyButton value={stxAddress} label="Copy address" />}
            </span>
            <span className="text-muted-2">·</span>
            <Updated at={updatedAt} refreshing={refreshing} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { refresh(); balances.refresh(); }} disabled={refreshing || loading}>
            Refresh
          </Button>
          <Link href="/vault/create">
            <Button>Create treasury</Button>
          </Link>
        </div>
      </div>

      {env && !env.strategyExecutionEnabled && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-muted">
          <span>
            <span className="font-semibold uppercase tracking-wider text-warning">Autonomous execution disabled on {env.network === "TESTNET" ? "Testnet" : "this network"}</span>
            <span className="ml-2">Recommendations are analyzed and validated; your assets are never moved between strategies.</span>
          </span>
          <Link href="/docs/vault-architecture#7-testnet-execution-gate-protocol-level" className="text-accent hover:underline">
            Learn why
          </Link>
        </div>
      )}

      {/* ----------------------------------------------------------- stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Wallet STX"
          value={balances.stx !== null ? formatAsset(balances.stx, "STX") : "-"}
          loading={balances.loading && balances.stx === null}
          sub={balances.error ? "Could not read balance" : "Real testnet balance"}
        />
        <StatTile
          label="Wallet sBTC"
          value={balances.sbtc !== null ? formatAsset(balances.sbtc, "SBTC") : "-"}
          loading={balances.loading && balances.sbtc === null}
          sub={balances.error ? "Could not read balance" : "Real testnet balance"}
        />
        <StatTile label="Your STX claim" value={formatAsset(claim.STX, "STX")} loading={loading} sub={`Across ${vaults.length} treasur${vaults.length === 1 ? "y" : "ies"}`} />
        <StatTile label="Your sBTC claim" value={formatAsset(claim.SBTC, "SBTC")} loading={loading} sub="Your share of sBTC pools" />
      </div>
      <p className="mt-2 text-xs text-muted-2">STX and sBTC are shown separately and are never converted or added together.</p>

      {/* ------------------------------------------------------- attention */}
      {attention.length > 0 && (
        <div className="mt-8">
          <AttentionPanel items={attention} />
        </div>
      )}

      {/* --------------------------------------------------- getting started */}
      {!allDone && (
        <div className="mt-8">
          <GettingStarted steps={steps} />
        </div>
      )}

      {/* ------------------------------------------- portfolio + activity */}
      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PortfolioSection vaults={vaults} loading={loading} error={error} />
        {vaults.length > 0 && <RecentActivity items={feed} loading={activity === null} />}
      </div>

      <p className="mt-12 rounded-xl border border-border bg-surface-raised p-4 text-xs leading-5 text-muted">
        Your treasury remains yours. SovereigntyAI continuously analyzes available opportunities and proposes portfolio reallocations
        within the rules you define. Clarity enforces those rules. On Testnet, recommendations can be analyzed and validated, but
        autonomous strategy execution remains disabled.
      </p>
    </div>
  );
}
