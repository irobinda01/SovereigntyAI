"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { connectWallet, disconnectWallet, getAddresses, walletIsConnected } from "./wallet";

interface WalletState {
  connected: boolean;
  stxAddress: string | null;
  btcAddress: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [stxAddress, setStxAddress] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (walletIsConnected()) {
      try {
        const { stx, btc } = getAddresses();
        setStxAddress(stx);
        setBtcAddress(btc ?? null);
      } catch {
        // stale/corrupt local session — treat as disconnected
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { stx, btc } = await connectWallet();
      setStxAddress(stx);
      setBtcAddress(btc ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setStxAddress(null);
    setBtcAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ connected: Boolean(stxAddress), stxAddress, btcAddress, connecting, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
