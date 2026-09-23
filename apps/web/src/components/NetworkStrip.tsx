"use client";

import { useWallet } from "@/lib/wallet-context";
import { networkOfAddress } from "@/lib/wallet";
import { NETWORK } from "@/lib/config";

const NETWORK_LABEL = NETWORK === "testnet" ? "Testnet" : "Mainnet";

/**
 * Persistent, tasteful network indicator. Always visible: the user must never
 * confuse Testnet assets with mainnet assets. If the connected wallet account
 * is a mainnet account this becomes a warning, and the transaction forms
 * refuse to build anything for it.
 */
export function NetworkStrip() {
  const { stxAddress } = useWallet();
  const walletNet = stxAddress ? networkOfAddress(stxAddress) : null;
  const mismatch = walletNet !== null && walletNet !== "unknown" && walletNet !== NETWORK;

  if (mismatch) {
    return (
      <div role="alert" className="border-b border-danger/30 bg-danger/10 px-6 py-2 text-center text-xs font-medium text-danger">
        Your connected wallet account is a {walletNet.toUpperCase()} account. SovereigntyAI runs on Stacks {NETWORK_LABEL} -
        switch to a {NETWORK} account in your wallet. No transaction will be built for this account.
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-surface-raised px-6 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        Stacks {NETWORK_LABEL}
        <span className="text-muted-2">·</span>
        {NETWORK === "testnet" ? "Real testnet assets - no mainnet value" : "Real assets"}
      </span>
    </div>
  );
}

export function NetworkPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-warning ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Stacks {NETWORK_LABEL}
    </span>
  );
}

export function RealAssetTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border-strong bg-surface-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted ${className}`}
    >
      Real {NETWORK === "testnet" ? "testnet " : ""}asset
    </span>
  );
}
