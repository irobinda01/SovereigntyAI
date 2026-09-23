"use client";

import { useCallback, useState } from "react";
import { describeFailure } from "@/lib/errors";
import { waitForTxResult, type TxResult } from "@/lib/onchain";

export type TxPhase = "idle" | "signing" | "confirming" | "confirmed" | "failed";

export interface TransactionState {
  phase: TxPhase;
  txId: string | null;
  error: string | null;
  result: TxResult | null;
  busy: boolean;
  /**
   * Runs one real transaction end to end: wallet signature -> broadcast ->
   * wait for on-chain confirmation. Resolves with the confirmed result, or
   * null if the user rejected it or it failed on-chain. The caller refreshes
   * chain state only AFTER a confirmed result; nothing is shown optimistically.
   */
  run: (submit: () => Promise<{ txid: string }>) => Promise<TxResult | null>;
  reset: () => void;
}

export function useTransaction(): TransactionState {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TxResult | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setTxId(null);
    setError(null);
    setResult(null);
  }, []);

  const run = useCallback(async (submit: () => Promise<{ txid: string }>) => {
    setError(null);
    setResult(null);
    setTxId(null);
    setPhase("signing");
    let txid: string;
    try {
      ({ txid } = await submit());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      setError(/cancel|reject|denied|closed/i.test(message) ? "You cancelled the request in your wallet. Nothing was submitted." : message || "Could not submit the transaction.");
      setPhase("failed");
      return null;
    }
    setTxId(txid);
    setPhase("confirming");
    try {
      const res = await waitForTxResult(txid);
      setResult(res);
      if (res.status === "confirmed") {
        setPhase("confirmed");
        return res;
      }
      setError(
        res.status === "timeout"
          ? "Still not confirmed after several minutes. It may yet confirm - check the explorer link; your balances below only update once it does."
          : describeFailure(res)
      );
      setPhase("failed");
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the transaction status.");
      setPhase("failed");
      return null;
    }
  }, []);

  return { phase, txId, error, result, busy: phase === "signing" || phase === "confirming", run, reset };
}
