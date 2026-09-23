"use client";

import { useEffect, useState } from "react";
import { getProtocolSnapshot, type ProtocolSnapshot } from "@/lib/onchain";
import { getStxMarketData, type StxMarketData } from "@/lib/ecosystem";
import { isProtocolConfigured, NETWORK, explorerAddressUrl, DEPLOYER_ADDRESS, contractId } from "@/lib/config";
import { Skeleton } from "@/components/ui/Skeleton";
import { shortAddress } from "@/lib/format";

const POLL_MS = 20_000;

/** `SN3VMH…F4J8F1.sbtc-token`: short address, full contract name. */
function contractLabel(id: string): string {
  const [addr, name] = id.split(".");
  return name ? `${addr.slice(0, 6)}…${addr.slice(-4)}.${name}` : shortAddress(id, 8);
}

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };

/**
 * "Live on Testnet" panel. Every value is read from the chain when the page
 * loads and refreshed every 20s. Each row has three honest states - loading,
 * value, or "unavailable" - so a failed read never looks like an endless
 * spinner and is never replaced by a placeholder number.
 */
export function LiveConsole() {
  const [snap, setSnap] = useState<Load<ProtocolSnapshot>>({ state: "loading" });
  const [price, setPrice] = useState<Load<StxMarketData>>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (isProtocolConfigured()) {
        getProtocolSnapshot()
          .then((data) => !cancelled && setSnap({ state: "ok", data }))
          .catch((e) => !cancelled && setSnap((prev) => (prev.state === "ok" ? prev : { state: "error", message: e instanceof Error ? e.message : "unavailable" })));
      } else {
        setSnap({ state: "error", message: "Protocol address not configured for this build." });
      }
      getStxMarketData()
        .then((data) => {
          if (cancelled) return;
          priceFailures = 0;
          setPrice({ state: "ok", data });
        })
        .catch((e) => {
          if (cancelled) return;
          priceFailures++;
          // Keep showing the last good reading; only show an error if there has never been one.
          setPrice((prev) => (prev.state === "ok" ? prev : { state: "error", message: e instanceof Error ? e.message : "unavailable" }));
        });
    }

    let priceFailures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      poll();
      // Poll every 20s normally; retry after 4s / 8s / 16s while the price is failing.
      const wait = priceFailures === 0 ? POLL_MS : Math.min(POLL_MS, 4_000 * 2 ** (priceFailures - 1));
      timer = setTimeout(loop, wait);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const s = snap.state === "ok" ? snap.data : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-xl shadow-black/[0.08]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live on {NETWORK === "testnet" ? "Stacks Testnet" : "Stacks"}
        </div>
        <span className="text-[11px] text-muted-2">read from the chain</span>
      </div>

      <dl className="divide-y divide-border">
        <Row label="Block height" state={snap}>
          {s && <span className="font-tabular">{s.blockHeight.toLocaleString()}</span>}
        </Row>
        <Row label="Protocol status" state={snap}>
          {s && (
            <span className={s.paused ? "text-warning" : "text-success"}>{s.paused ? "Paused" : "Active"}</span>
          )}
        </Row>
        <Row label="Treasuries created" state={snap}>
          {s && <span className="font-tabular">{s.vaultCount.toLocaleString()}</span>}
        </Row>
        <Row label="Approved sBTC" state={snap}>
          {s && (s.approvedSbtc ? <span className="font-tabular text-xs" title={s.approvedSbtc}>{contractLabel(s.approvedSbtc)}</span> : <span className="text-warning">Not configured</span>)}
        </Row>
        <Row label="Strategies registered" state={snap}>
          {s && (
            <span>
              <span className="font-tabular">{s.activeStrategyCount}</span>
              {s.activeStrategyCount === 0 && <span className="ml-1.5 text-xs text-muted">none verified on Testnet</span>}
            </span>
          )}
        </Row>
        <Row label="Strategy execution" state={snap} emphasize>
          {s && (
            <span className={s.environment.strategyExecutionEnabled ? "text-success" : "text-warning"}>
              {s.environment.strategyExecutionEnabled ? "Enabled" : `Disabled on ${s.environment.network === "TESTNET" ? "Testnet" : "this network"}`}
            </span>
          )}
        </Row>
        <div className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <dt className="text-muted">STX / USD</dt>
          <dd className="font-medium text-foreground">
            {price.state === "loading" && <Skeleton className="h-4 w-24" />}
            {price.state === "error" && <span className="text-xs font-normal text-muted">retrying...</span>}
            {price.state === "ok" && (
              <span className="font-tabular" title={`Source: ${price.data.source ?? "market data"}${price.data.stale ? " (last good reading)" : ""}`}>
                ${price.data.usd.toFixed(3)}{" "}
                <span className={price.data.usd24hChange >= 0 ? "text-success" : "text-danger"}>
                  {price.data.usd24hChange >= 0 ? "+" : ""}
                  {price.data.usd24hChange.toFixed(2)}%
                </span>
                {price.data.stale && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wider text-warning">delayed</span>}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {snap.state === "error" && (
        <div className="border-t border-border bg-surface-raised px-5 py-3 text-xs text-muted">
          Could not read the chain just now ({snap.message}). Nothing is being guessed - this panel will retry automatically.
        </div>
      )}

      {isProtocolConfigured() && (
        <a
          href={explorerAddressUrl(DEPLOYER_ADDRESS)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted transition-colors hover:text-foreground"
          title={contractId("sovereignty-vault")}
        >
          <span>Verify the deployed contracts on the explorer</span>
          <span aria-hidden>&rarr;</span>
        </a>
      )}
    </div>
  );
}

function Row({
  label,
  state,
  emphasize,
  children,
}: {
  label: string;
  state: Load<unknown>;
  emphasize?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3 text-sm ${emphasize ? "bg-warning/5" : ""}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-foreground">
        {state.state === "loading" && <Skeleton className="h-4 w-24" />}
        {state.state === "error" && <span className="text-xs font-normal text-muted">unavailable</span>}
        {state.state === "ok" && children}
      </dd>
    </div>
  );
}
