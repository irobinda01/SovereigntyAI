"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getHolderVaultIds, getOwnerVaultIds, getVaultOverview, type VaultOverview } from "@/lib/onchain";

export interface MyVault {
  overview: VaultOverview;
  role: "owner" | "holder" | "owner+holder";
}

const AUTO_REFRESH_MS = 45_000;

/**
 * "My treasuries": vaults the connected wallet OWNS (the vault contract's
 * on-chain owner index) plus vaults it HOLDS receipt shares in (the on-chain
 * holder index). Both indexes live in the contract - no localStorage, no
 * database - so this works from any browser and can never show a vault that
 * does not exist or omit one that does.
 *
 * Refreshes quietly every 45s while the tab is visible. A refresh failure
 * never clears data that is already on screen; `loading` is only true for the
 * first load, `refreshing` for later ones.
 */
export function useMyVaults(address: string | null) {
  const [vaults, setVaults] = useState<MyVault[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setVaults([]);
      setUpdatedAt(null);
      loaded.current = false;
      return;
    }
    if (loaded.current) setRefreshing(true);
    else setLoading(true);
    try {
      const [ownedIds, heldIds] = await Promise.all([getOwnerVaultIds(address), getHolderVaultIds(address)]);
      const ids = [...new Set([...ownedIds, ...heldIds])].sort((a, b) => a - b);
      const results = await Promise.all(
        ids.map(async (id): Promise<MyVault | null> => {
          const overview = await getVaultOverview(id, address);
          if (!overview) return null;
          const owned = ownedIds.includes(id);
          const held = heldIds.includes(id);
          return { overview, role: owned && held ? "owner+holder" : owned ? "owner" : "holder" };
        })
      );
      setVaults(results.filter((v): v is MyVault => v !== null));
      setUpdatedAt(Date.now());
      setError(null);
      loaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load treasuries.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    loaded.current = false;
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!address) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [address, refresh]);

  return { vaults, loading, refreshing, error, updatedAt, refresh };
}
