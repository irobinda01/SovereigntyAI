"use client";

import { useMemo, useState } from "react";

// Mirrors the on-chain formula in sovereignty-vault-v7 (compute-deposit-shares),
// using exact bigint arithmetic and FLOOR division - the same rounding the
// contract uses. This is an ILLUSTRATION driven only by the numbers the visitor
// types; it reads no vault and shows no real balances.

function toInt(v: string): bigint | null {
  return /^\d{1,15}$/.test(v.trim()) ? BigInt(v.trim()) : null;
}

export function ShareCalculator() {
  const [assets, setAssets] = useState("120");
  const [supply, setSupply] = useState("100");
  const [deposit, setDeposit] = useState("12");

  const result = useMemo(() => {
    const total = toInt(assets);
    const sup = toInt(supply);
    const amt = toInt(deposit);
    if (total === null || sup === null || amt === null) return { kind: "invalid" as const };
    if (amt === 0n) return { kind: "zero" as const };
    if (sup === 0n) {
      return total === 0n
        ? { kind: "ok" as const, shares: amt, price: null, ownership: "100.00", first: true }
        : { kind: "insolvent" as const };
    }
    if (total === 0n) return { kind: "insolvent" as const };
    const shares = (amt * sup) / total; // floor, like the contract
    if (shares === 0n) return { kind: "tiny" as const };
    const newSupply = sup + shares;
    const own = (shares * 10_000n) / newSupply;
    const priceScaled = (total * 10_000n) / sup; // price with 4 decimals
    const price = `${priceScaled / 10_000n}.${(priceScaled % 10_000n).toString().padStart(4, "0")}`;
    return {
      kind: "ok" as const,
      shares,
      price,
      ownership: `${own / 100n}.${(own % 100n).toString().padStart(2, "0")}`,
      first: false,
    };
  }, [assets, supply, deposit]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Receipt shares</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Ownership you can calculate.</h2>
        <p className="mt-4 max-w-md text-base leading-7 text-muted">
          Depositing mints receipt shares priced against the pool&apos;s current value - not a fixed 1:1 - so a new deposit can never
          dilute anyone. Redeeming burns them for your proportional share. Rounding always favours the pool, so no one can mint a
          free share.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-surface-raised p-4 font-mono text-[13px] leading-7 text-muted">
          <div>
            shares = <span className="text-foreground">floor</span>(deposit &times; supply &divide; pool assets)
          </div>
          <div>
            payout = <span className="text-foreground">floor</span>(shares &times; pool assets &divide; supply)
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border-strong bg-surface p-5 shadow-xl shadow-black/[0.06]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">Try the formula</div>
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
            Example inputs - edit them
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Pool assets" value={assets} onChange={setAssets} />
          <Field label="Shares outstanding" value={supply} onChange={setSupply} />
          <Field label="Your deposit" value={deposit} onChange={setDeposit} />
        </div>

        <div className="mt-5 rounded-xl border border-border bg-surface-raised p-4" aria-live="polite">
          {result.kind === "ok" && (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Out label="You receive" value={`${result.shares.toLocaleString("en-US")} shares`} strong />
              <Out label="Share price" value={result.price ?? "first deposit: 1:1"} />
              <Out label="Your ownership" value={`${result.ownership}%`} />
            </dl>
          )}
          {result.kind === "zero" && <Note>Enter a deposit greater than zero.</Note>}
          {result.kind === "invalid" && <Note>Use whole, non-negative numbers.</Note>}
          {result.kind === "tiny" && <Note>That deposit is too small to mint even one share at this price - the contract rejects it rather than round you to nothing.</Note>}
          {result.kind === "insolvent" && <Note>A pool with shares but no assets (or assets but no shares) is refused by the contract.</Note>}
        </div>
        <p className="mt-3 text-xs text-muted-2">An illustration of the on-chain math using only the numbers above. It does not read any vault.</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-tabular mt-1.5 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
    </label>
  );
}

function Out({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-tabular mt-0.5 ${strong ? "text-lg font-semibold text-foreground" : "font-medium text-foreground"}`}>{value}</dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
