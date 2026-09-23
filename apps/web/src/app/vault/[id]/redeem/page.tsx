"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cl, cvToJSON } from "@stacks/transactions";
import { useVault } from "@/components/vault/VaultContext";
import { useWallet } from "@/lib/wallet-context";
import { useBalances } from "@/hooks/useBalances";
import { useTransaction } from "@/hooks/useTransaction";
import { previewRedeem, type Asset } from "@/lib/onchain";
import { ASSET_LABEL, formatAsset, formatShares, percentOf } from "@/lib/amounts";
import { vaultAssets } from "@/lib/derive";
import { contractId, NETWORK, SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME } from "@/lib/config";
import { networkOfAddress, postConditions, signAndBroadcastContractCall } from "@/lib/wallet";
import { explainClarityError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { NetworkPill } from "@/components/NetworkStrip";
import { TxProgress } from "@/components/vault/TxProgress";

type Preview = { state: "idle" } | { state: "loading" } | { state: "ok"; amount: bigint } | { state: "error"; message: string };

export default function RedeemPage() {
  const { overview, vaultId, viewer, refresh } = useVault();
  const { connect, connecting } = useWallet();
  const balances = useBalances(viewer);
  const tx = useTransaction();

  const assets = vaultAssets(overview);
  const [asset, setAsset] = useState<Asset>(assets[0]);
  const [sharesText, setSharesText] = useState("");
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  const [done, setDone] = useState<{ asset: Asset; shares: bigint; received: bigint } | null>(null);

  const pool = overview.pools[asset]!;
  const position = overview.positions[asset];
  const held = position?.shares ?? 0n;

  const shares = useMemo(() => (/^\d+$/.test(sharesText.trim()) ? BigInt(sharesText.trim()) : null), [sharesText]);

  useEffect(() => {
    if (!viewer || shares === null || shares <= 0n) {
      setPreview({ state: "idle" });
      return;
    }
    let cancelled = false;
    setPreview({ state: "loading" });
    const t = setTimeout(() => {
      previewRedeem(vaultId, asset, shares, viewer)
        .then((r) => {
          if (cancelled) return;
          setPreview(r.ok ? { state: "ok", amount: r.amount } : { state: "error", message: explainClarityError(r.code) });
        })
        .catch((e) => !cancelled && setPreview({ state: "error", message: e instanceof Error ? e.message : "Preview unavailable." }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [viewer, vaultId, asset, shares, pool.total, pool.supply]);

  if (!viewer) {
    return (
      <EmptyState title="Connect your wallet to redeem">
        <Button className="mt-4" onClick={connect} disabled={connecting}>
          Connect wallet
        </Button>
      </EmptyState>
    );
  }

  const walletNetwork = networkOfAddress(viewer);
  const wrongNetwork = walletNetwork !== NETWORK;

  let blocker: string | null = null;
  if (wrongNetwork) blocker = `Your wallet account is a ${walletNetwork} account. Switch to a ${NETWORK} account.`;
  else if (sharesText.trim() !== "" && shares === null) blocker = "Enter a whole number of receipt shares.";
  else if (shares !== null && shares > held) blocker = explainClarityError(117);
  else if (preview.state === "error") blocker = preview.message;
  else if (preview.state === "ok" && preview.amount > pool.idle) blocker = explainClarityError(105);

  const canSubmit = !blocker && shares !== null && shares > 0n && preview.state === "ok" && !tx.busy;

  async function submit() {
    if (shares === null || preview.state !== "ok") return;
    const contract = contractId("sovereignty-vault");
    const expected = preview.amount;
    const res = await tx.run(() =>
      asset === "STX"
        ? signAndBroadcastContractCall({
            contract,
            functionName: "redeem-stx",
            functionArgs: [Cl.uint(vaultId), Cl.uint(shares)],
            postConditions: postConditions.redeemStx(expected),
          })
        : signAndBroadcastContractCall({
            contract,
            functionName: "redeem-sbtc",
            functionArgs: [Cl.uint(vaultId), Cl.uint(shares), Cl.contractPrincipal(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME)],
            postConditions: postConditions.redeemSbtc(expected),
          })
    );
    if (!res) return;
    const received = res.resultCV ? BigInt(cvToJSON(res.resultCV).value.value) : 0n;
    await Promise.all([refresh(), balances.refresh()]);
    setDone({ asset, shares, received });
    setSharesText("");
  }

  if (done && tx.phase === "confirmed") {
    const pos = overview.positions[done.asset];
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-success">Redemption confirmed</div>
          <dl className="mt-4 grid gap-3 text-sm">
            <Line label="Receipt tokens burned" value={formatShares(done.shares)} />
            <Line label="Received" value={formatAsset(done.received, done.asset)} />
            <Line label="Receipt tokens remaining" value={formatShares(pos?.shares ?? 0n)} />
            <Line label="Your remaining ownership" value={`${percentOf(pos?.shares ?? 0n, overview.pools[done.asset]!.supply)}%`} />
          </dl>
          <p className="mt-3 text-xs text-muted">Read back from the contracts after confirmation.</p>
        </div>
        <TxProgress phase={tx.phase} txId={tx.txId} error={tx.error} />
        <div className="flex gap-2">
          <Link href={`/vault/${vaultId}`}>
            <Button>View treasury</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null);
              tx.reset();
            }}
          >
            Redeem more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Redeem from {overview.meta.name}</CardTitle>
          <NetworkPill />
        </CardHeader>
        <CardBody className="space-y-5">
          {assets.length > 1 && (
            <div className="flex gap-2">
              {assets.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={tx.busy}
                  onClick={() => {
                    setAsset(a);
                    setSharesText("");
                  }}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    asset === a ? "border-accent bg-accent/10 text-foreground" : "border-border-strong text-muted hover:text-foreground"
                  }`}
                >
                  {ASSET_LABEL[a]} pool
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Your receipt position - {ASSET_LABEL[asset]}</div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Field label="Receipt tokens" value={formatShares(held)} />
              <Field label="Ownership" value={`${percentOf(held, pool.supply)}%`} />
              <Field label="Vault assets" value={formatAsset(pool.total, asset)} />
              <Field label="Available to redeem now" value={formatAsset(position?.redeemable ?? 0n, asset)} />
            </dl>
          </div>

          {held === 0n ? (
            <p className="text-sm text-muted">You hold no {ASSET_LABEL[asset]} receipt shares in this vault, so there is nothing to redeem.</p>
          ) : (
            <>
              <div>
                <label htmlFor="shares" className="text-xs font-medium uppercase tracking-wider text-muted">
                  Receipt shares to redeem
                </label>
                <input
                  id="shares"
                  inputMode="numeric"
                  autoComplete="off"
                  value={sharesText}
                  onChange={(e) => setSharesText(e.target.value)}
                  placeholder="0"
                  disabled={tx.busy}
                  className="font-tabular mt-2 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
                />
                <div className="mt-2 flex gap-1.5">
                  {([25, 50, 75, 100] as const).map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      disabled={tx.busy}
                      onClick={() => setSharesText(((held * BigInt(pct)) / 100n).toString())}
                      className="flex-1 rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
                    >
                      {pct === 100 ? "All" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              <dl className="rounded-lg border border-border p-4 text-sm">
                <Line
                  label="Estimated redemption"
                  value={preview.state === "ok" ? formatAsset(preview.amount, asset) : preview.state === "loading" ? "calculating..." : "-"}
                />
                <Line
                  label="Ownership after redemption"
                  value={shares !== null && shares <= held ? `${percentOf(held - shares, pool.supply - shares)}%` : "-"}
                />
              </dl>

              {blocker && <p className="text-xs text-danger">{blocker}</p>}

              <Button className="w-full" onClick={submit} disabled={!canSubmit}>
                {tx.phase === "signing" ? "Waiting for signature..." : tx.phase === "confirming" ? "Confirming on-chain..." : "Redeem"}
              </Button>
              <TxProgress phase={tx.phase} txId={tx.txId} error={tx.error} />
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2 text-sm text-muted">
          <div className="text-xs font-semibold uppercase tracking-wider text-foreground">How redemption works</div>
          <p>
            Redemption burns your receipt tokens and transfers the corresponding available vault assets according to the
            vault&apos;s redemption rules: you receive your proportional share of the pool (rounded down, in the pool&apos;s favour).
          </p>
          <p>
            Only <strong>idle</strong> funds can be paid out. If part of the pool is allocated to a strategy, redeem fewer shares
            or wait until it is idle.
          </p>
          <p>Redemption is never blocked by a protocol or vault pause. Only you can redeem your own shares.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-tabular mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-tabular text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
