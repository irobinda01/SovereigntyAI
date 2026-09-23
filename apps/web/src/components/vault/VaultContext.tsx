"use client";

import { createContext, useContext } from "react";
import type { VaultOverview } from "@/lib/onchain";

export interface VaultContextValue {
  vaultId: number;
  /** Fully loaded, authoritative on-chain overview (the shell only renders children once this exists). */
  overview: VaultOverview;
  viewer: string | null;
  isOwner: boolean;
  refreshing: boolean;
  /** Re-reads the whole vault from chain. Call after every CONFIRMED transaction. */
  refresh: () => Promise<void>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within the vault layout");
  return ctx;
}
