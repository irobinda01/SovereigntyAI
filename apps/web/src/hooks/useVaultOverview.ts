"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVaultOverview, type VaultOverview } from "@/lib/onchain";

export interface VaultOverviewState {
  /** undefined = loading, null = vault does not exist on-chain */
  overview: VaultOverview | null | undefined;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads the authoritative on-chain overview of one vault for the connected
 * viewer. `refresh()` re-reads everything from the chain - it is what runs
 * after every confirmed transaction, so displayed balances/shares are always
 * chain state, never an optimistic guess.
 */
export function useVaultOverview(vaultId: number, viewer: string | null): VaultOverviewState {
  const [overview, setOverview] = useState<VaultOverview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const next = await getVaultOverview(vaultId, viewer);
      if (mine !== seq.current) return; // a newer refresh superseded this one
      setOverview(next);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load vault.");
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, [vaultId, viewer]);

  useEffect(() => {
    setOverview(undefined);
    refresh();
  }, [refresh]);

  return { overview, error, refreshing, refresh };
}
