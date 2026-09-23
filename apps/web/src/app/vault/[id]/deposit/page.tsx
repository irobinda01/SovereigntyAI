"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cl, cvToJSON } from "@stacks/transactions";
import { useVault } from "@/components/vault/VaultContext";
import { useWallet } from "@/lib/wallet-context";
import { useBalances } from "@/hooks/useBalances";
import { useTransaction } from "@/hooks/useTransaction";
import { getProtocolLimits, previewDeposit, isProtocolPaused, type Asset } from "@/lib/onchain";
import { ASSET_LABEL, DECIMALS, formatAsset, formatShares, formatUnits, parseUnits, percentOf } from "@/lib/amounts";
import { ownershipAfterDeposit, vaultAssets } from "@/lib/derive";
import { contractId, SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, NETWORK } from "@/lib/config";
import { networkOfAddress, postConditions, signAndBroadcastContractCall } from "@/lib/wallet";
import { explainClarityError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { NetworkPill, RealAssetTag } from "@/components/NetworkStrip";
import { TxProgress } from "@/components/vault/TxProgress";

// Kept back from a "Max" STX deposit so the account can still pay the network fee.
const STX_FEE_RESERVE = 50_000n; // 0.05 STX

type Preview = { state: "idle" } | { state: "loading" } | { state: "ok"; shares: bigint } | { state: "error"; message: string };

export default function DepositPage() {
  const { overview, vaultId, viewer, refresh } = useVault();
  const { connect, connecting } = useWallet();
  const balances = useBalances(viewer);
  const tx = useTransaction();

  const assets = vaultAssets(overview);
  const [asset, setAsset] = useState<Asset>(assets[0]);
  const [amountText, setAmountText] = useState("");
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  const [protocolPaused, setProtocolPaused] = useState<boolean | null>(null);
  const [sbtcApproved, setSbtcApproved] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<{ asset: Asset; amount: bigint; shares: bigint } | null>(null);

  const decimals = DECIMALS[asset];
  const amount = useMemo(() => parseUnits(amountText, decimals), [amountText, decimals]);
  const walletBalance = asset === "STX" ? balances.stx : balances.sbtc;
  const pool = overview.pools[asset]!;
  const position = overview.positions[asset];

  useEffect(() => {
    isProtocolPaused().then(setProtocolPaused).catch(() => setProtocolPaused(null));
    getProtocolLimits()
      .then((l) => setSbtcApproved(l.approvedSbtcAsset !== null))
      .catch(() => setSbtcApproved(null));
  }, []);

  // The contract computes the share preview - the UI never re-implements the pricing formula.
  useEffect(() => {
    if (!viewer || amount === null || amount <= 0n) {
      setPreview({ state: "idle" });
      return;
    }
    let cancelled = false;
    setPreview({ state: "loading" });
    const t = setTimeout(() => {
      previewDeposit(vaultId, asset, amount, viewer)
        .then((r) => {
          if (cancelled) return;
          setPreview(r.ok ? { state: "ok", shares: r.shares } : { state: "error", message: explainClarityError(r.code) });
        })
        .catch((e) => !cancelled && setPreview({ state: "error", message: e instanceof Error ? e.message : "Preview unavailable." }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [viewer, vaultId, asset, amount, pool.total, pool.supply]);

  if (!viewer) {
    return (
      <EmptyState title="Connect your wallet to deposit">
        <Button className="mt-4" onClick={connect} disabled={connecting}>
          Connect wallet
        </Button>
      </EmptyState>
    );
  }

  const walletNetwork = networkOfAddress(viewer);
  const wrongNetwork = walletNetwork !== NETWORK;
  const isOwner = overview.meta.owner === viewer;

  // ---- blocking conditions, in the order the user should fix them
  let blocker: string | null = null;
  if (wrongNetwork) blocker = `Your wallet account is a ${walletNetwork} account. Switch to a ${NETWORK} account.`;
  else if (protocolPaused) blocker = explainClarityError(102);
  else if (overview.meta.paused) blocker = explainClarityError(112);
  else if (!overview.meta.openDeposits && !isOwner) blocker = explainClarityError(113);
  else if (asset === "SBTC" && sbtcApproved === false) blocker = explainClarityError(109);
  else if (amountText.trim() !== "" && amount === null) blocker = `Enter a valid amount with at most ${decimals} decimals.`;
  else if (amount !== null && amount > 0n && walletBalance !== null && amount > walletBalance)
    blocker = `Amount exceeds your wallet's ${ASSET_LABEL[asset]} balance.`;
  else if (amount !== null && amount > 0n && asset === "STX" && walletBalance !== null && amount + STX_FEE_RESERVE > walletBalance)
    blocker = "Keep about 0.05 STX in your wallet to pay the network fee.";
  else if (preview.state === "error") blocker = preview.message;

  const canSubmit = !blocker && amount !== null && amount > 0n && preview.state === "ok" && !tx.busy && walletBalance !== null;

  async function submit() {
    if (!viewer || amount === null || preview.state !== "ok") return;
    const contract = contractId("sovereignty-vault");
    const res = await tx.run(() =>
      asset === "STX"
        ? signAndBroadcastContractCall({
            contract,
            functionName: "deposit-stx",
            functionArgs: [Cl.uint(vaultId), Cl.uint(amount)],
            postConditions: postConditions.depositStx(viewer, amount),
          })
        : signAndBroadcastContractCall({
            contract,
            functionName: "deposit-sbtc",
            functionArgs: [Cl.uint(vaultId), Cl.uint(amount), Cl.contractPrincipal(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME)],
            postConditions: postConditions.depositSbtc(viewer, amount),
          })
    );
    if (!res) return;
    // Confirmed: the shares minted come from the contract's own return value...
    const minted = res.resultCV ? BigInt(cvToJSON(res.resultCV).value.value) : 0n;
    // ...and everything displayed afterwards is re-read from the chain.
    await Promise.all([refresh(), balances.refresh()]);
    setConfirmed({ asset, amount, shares: minted });
    setAmountText("");
  }

  if (confirmed && tx.phase === "confirmed") {
    const pos = overview.positions[confirmed.asset];
    const p = overview.pools[confirmed.asset]!;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-success">Deposit confirmed</div>
          <dl className="mt-4 grid gap-3 text-sm">
            <Line label="Vault" value={overview.meta.name} />
            <Line label="Deposited" value={formatAsset(confirmed.amount, confirmed.asset)} />
            <Line label="Receipt tokens minted" value={formatShares(confirmed.shares)} />
            <Line label="Your vault ownership" value={`${percentOf(pos?.shares ?? 0n, p.supply)}%`} />
            <Line label="Your receipt balance" value={formatShares(pos?.shares ?? 0n)} />
          </dl>
          <p className="mt-3 text-xs text-muted">Read back from the vault and receipt contracts after confirmation.</p>
        </div>
        <TxProgress phase={tx.phase} txId={tx.txId} error={tx.error} />
        <div className="flex gap-2">
          <Link href={`/vault/${vaultId}`}>
            <Button>View treasury</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmed(null);
              tx.reset();
            }}
          >
            Make another deposit
          </Button>
        </div>
      </div>
    );
  }

  const sharesAfter = preview.state === "ok" ? preview.shares : null;
  const ownershipAfter =
    sharesAfter !== null ? ownershipAfterDeposit(position?.shares ?? 0n, pool.supply, sharesAfter) : null;

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Deposit into {overview.meta.name}</CardTitle>
          <NetworkPill />
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-raised p-4 text-sm">
            <div>
              <div className="text-xs text-muted">Your wallet - STX</div>
              <div className="font-tabular mt-0.5 font-medium text-foreground">{balances.stx !== null ? formatAsset(balances.stx, "STX") : "..."}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Your wallet - sBTC</div>
              <div className="font-tabular mt-0.5 font-medium text-foreground">{balances.sbtc !== null ? formatAsset(balances.sbtc, "SBTC") : "..."}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted">Asset</label>
              <RealAssetTag />
            </div>
            <div className="flex gap-2">
              {assets.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={tx.busy}
                  onClick={() => {
                    setAsset(a);
                    setAmountText("");
                  }}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    asset === a ? "border-accent bg-accent/10 text-foreground" : "border-border-strong text-muted hover:text-foreground"
                  }`}
                >
                  {ASSET_LABEL[a]}
                </button>
              ))}
            </div>
            {assets.length === 1 && (
              <p className="mt-2 text-xs text-muted">This vault holds {ASSET_LABEL[assets[0]]} only.</p>
            )}
          </div>

          <div>
            <label htmlFor="amount" className="text-xs font-medium uppercase tracking-wider text-muted">
              Amount ({ASSET_LABEL[asset]})
            </label>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0.0"
              disabled={tx.busy}
              className="font-tabular mt-2 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
            />
            {walletBalance !== null && walletBalance > 0n && (
              <div className="mt-2 flex gap-1.5">
                {([25, 50, 75, 100] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={tx.busy}
                    onClick={() => {
                      let target = (walletBalance * BigInt(pct)) / 100n;
                      if (pct === 100 && asset === "STX") target = target > STX_FEE_RESERVE ? target - STX_FEE_RESERVE : 0n;
                      setAmountText(formatUnits(target, decimals).replace(/,/g, ""));
                    }}
                    className="flex-1 rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4 text-sm">
            <Line
              label="You will receive"
              value={
                preview.state === "ok"
                  ? `${formatShares(preview.shares)} receipt shares`
                  : preview.state === "loading"
                    ? "calculating..."
                    : "-"
              }
            />
            <Line label="Ownership after deposit" value={ownershipAfter !== null ? `${percentOf(ownershipAfter, 10_000n)}%` : "-"} />
            <Line label="Network" value={`Stacks ${NETWORK === "testnet" ? "Testnet" : "Mainnet"}`} />
          </div>

          {blocker && <p className="text-xs text-danger">{blocker}</p>}

          <Button className="w-full" onClick={submit} disabled={!canSubmit}>
            {tx.phase === "signing" ? "Waiting for signature..." : tx.phase === "confirming" ? "Confirming on-chain..." : "Deposit"}
          </Button>

          <TxProgress phase={tx.phase} txId={tx.txId} error={tx.error} />
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-2 text-sm text-muted">
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground">How a deposit works</div>
            <p>You sign one real transaction that declares exactly how much you are sending. The vault then:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>receives your asset,</li>
              <li>updates this pool&apos;s accounting,</li>
              <li>mints receipt shares to you.</li>
            </ol>
            <p>
              Shares are priced against this pool&apos;s current net asset value - <em>not</em> a fixed 1:1 once the pool holds
              assets - so a new deposit can never dilute existing holders.
            </p>
            <p className="text-xs">
              Current pool: {formatAsset(pool.total, asset)} for {formatShares(pool.supply)} shares.
            </p>
          </CardBody>
        </Card>
      </div>
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
