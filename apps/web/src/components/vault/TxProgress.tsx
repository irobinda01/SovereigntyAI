"use client";

import { explorerTxUrl } from "@/lib/config";
import type { TxPhase } from "@/hooks/useTransaction";

const COPY: Record<Exclude<TxPhase, "idle">, { title: string; body: string }> = {
  signing: { title: "Waiting for your wallet", body: "Review and sign the transaction in your wallet. Nothing has been sent yet." },
  confirming: {
    title: "Broadcast - waiting for confirmation",
    body: "The transaction is on the network. Balances stay as they were until it is confirmed on-chain.",
  },
  confirmed: { title: "Confirmed on-chain", body: "The transaction was included in a block. State on this page has been re-read from the chain." },
  failed: { title: "Not completed", body: "" },
};

export function TxProgress({ phase, txId, error }: { phase: TxPhase; txId: string | null; error: string | null }) {
  if (phase === "idle") return null;
  const c = COPY[phase];
  const tone =
    phase === "confirmed"
      ? "border-success/30 bg-success/5"
      : phase === "failed"
        ? "border-danger/30 bg-danger/5"
        : "border-border-strong bg-surface-raised";
  return (
    <div role="status" aria-live="polite" className={`rounded-lg border p-4 text-sm ${tone}`}>
      <div className="flex items-center gap-2 font-medium text-foreground">
        {(phase === "signing" || phase === "confirming") && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-2 border-t-transparent" />
        )}
        {c.title}
      </div>
      <p className="mt-1 text-xs text-muted">{phase === "failed" ? error : c.body}</p>
      {txId && (
        <a href={explorerTxUrl(txId)} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-accent hover:underline">
          View transaction {txId.slice(0, 14)}...
        </a>
      )}
    </div>
  );
}
