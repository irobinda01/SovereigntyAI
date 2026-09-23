"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/Button";

/** Wallet-aware calls to action: the primary button always leads to the next useful step. */
export function HeroCtas() {
  const { connected, connect, connecting } = useWallet();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {connected ? (
        <>
          <Link href="/dashboard">
            <Button size="lg">Open my treasuries</Button>
          </Link>
          <Link href="/vault/create">
            <Button size="lg" variant="secondary">
              Create a treasury
            </Button>
          </Link>
        </>
      ) : (
        <>
          <Button size="lg" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting..." : "Connect wallet"}
          </Button>
          <Link href="/docs/user-guide">
            <Button size="lg" variant="secondary">
              How it works
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}
