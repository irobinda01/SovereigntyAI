"use client";

import { useWallet } from "@/lib/wallet-context";
import { Button } from "./ui/Button";
import { CopyButton } from "./ui/CopyButton";
import { shortAddress } from "@/lib/format";

export function ConnectButton() {
  const { connected, connecting, stxAddress, connect, disconnect, error } = useWallet();

  if (connected && stxAddress) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-tabular hidden items-center gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs text-foreground sm:inline-flex">
          {shortAddress(stxAddress)}
          <CopyButton value={stxAddress} label="Copy address" />
        </span>
        <Button variant="secondary" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={connect} disabled={connecting} size="sm">
        {connecting ? "Connecting..." : "Connect Wallet"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
