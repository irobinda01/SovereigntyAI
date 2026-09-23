"use client";

import { useEffect, useState, useCallback } from "react";
import { getStxBalance, getSbtcBalance } from "@/lib/onchain";

interface BalanceState {
  stx: bigint | null;
  sbtc: bigint | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBalances(address: string | null): BalanceState {
  const [stx, setStx] = useState<bigint | null>(null);
  const [sbtc, setSbtc] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address) {
      setStx(null);
      setSbtc(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getStxBalance(address), getSbtcBalance(address)])
      .then(([stxBal, sbtcBal]) => {
        if (cancelled) return;
        setStx(stxBal);
        setSbtc(sbtcBal);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load balances.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  return { stx, sbtc, loading, error, refresh };
}
