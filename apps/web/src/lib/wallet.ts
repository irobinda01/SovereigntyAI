"use client";

import { connect, disconnect, isConnected, getLocalStorage, request } from "@stacks/connect";
import { Pc, type ClarityValue, type PostCondition } from "@stacks/transactions";
import { NETWORK, SBTC_ASSET_NAME, SBTC_CONTRACT_ID, contractId } from "./config";

export interface WalletAddresses {
  stx: string;
  btc?: string;
}

// Thin wrapper around @stacks/connect's current request-based API
// (SIP-030 / WBIP) - the modern replacement for the deprecated
// showConnect/openContractCall flow. This module never touches a
// private key; the connected wallet extension signs everything.

export async function connectWallet(): Promise<WalletAddresses> {
  await connect();
  return getAddresses();
}

export function disconnectWallet() {
  disconnect();
}

export function walletIsConnected(): boolean {
  try {
    return isConnected();
  } catch {
    return false;
  }
}

export function getAddresses(): WalletAddresses {
  const data = getLocalStorage();
  const stxEntry = data?.addresses?.stx?.[0];
  const btcEntry = data?.addresses?.btc?.[0];
  if (!stxEntry) throw new Error("No STX address found in wallet session.");
  return { stx: stxEntry.address, btc: btcEntry?.address };
}

/**
 * Which Stacks network an address belongs to, from its version prefix:
 * ST / SN are testnet, SP / SM are mainnet. This is how the app validates
 * that the connected wallet account is a Testnet account BEFORE building any
 * transaction - a mainnet account can never be asked to sign here.
 */
export function networkOfAddress(address: string): "testnet" | "mainnet" | "unknown" {
  if (/^S[TN]/.test(address)) return "testnet";
  if (/^S[PM]/.test(address)) return "mainnet";
  return "unknown";
}

// ------------------------------------------------------------------
// Post-conditions.
//
// Every state-changing call below declares EXACTLY the asset movement the
// user expects, and is sent in Deny mode: any transfer not listed makes the
// chain abort the transaction instead of executing it. (Omitting these was
// the original cause of every browser deposit failing with
// `abort_by_post_condition` on Testnet.)
// ------------------------------------------------------------------

export const postConditions = {
  /** The depositor sends exactly `amount` microSTX (and nothing else). */
  depositStx: (sender: string, amount: bigint): PostCondition[] => [
    Pc.principal(sender).willSendEq(amount).ustx(),
  ],
  /** The depositor sends exactly `amount` sats of the real Testnet sBTC token. */
  depositSbtc: (sender: string, amount: bigint): PostCondition[] => [
    Pc.principal(sender).willSendEq(amount).ft(SBTC_CONTRACT_ID, SBTC_ASSET_NAME),
  ],
  /**
   * The vault contract sends the holder AT MOST `maxAmount` (the
   * contract's own preview of the payout). This caps what can leave the vault
   * in this transaction; if the share price moved up between preview and
   * inclusion the chain aborts the transaction safely and the user retries.
   */
  redeemStx: (maxAmount: bigint): PostCondition[] => [
    Pc.principal(contractId("sovereignty-vault")).willSendLte(maxAmount).ustx(),
  ],
  redeemSbtc: (maxAmount: bigint): PostCondition[] => [
    Pc.principal(contractId("sovereignty-vault")).willSendLte(maxAmount).ft(SBTC_CONTRACT_ID, SBTC_ASSET_NAME),
  ],
};

export async function signAndBroadcastContractCall(opts: {
  contract: `${string}.${string}`;
  functionName: string;
  functionArgs: ClarityValue[];
  /** Explicit post-conditions. Calls that move no assets pass none and are still sent in Deny mode. */
  postConditions?: PostCondition[];
}): Promise<{ txid: string }> {
  const result = await request("stx_callContract", {
    contract: opts.contract,
    functionName: opts.functionName,
    functionArgs: opts.functionArgs,
    postConditions: opts.postConditions ?? [],
    postConditionMode: "deny",
    network: NETWORK,
  });
  if (!result.txid) {
    throw new Error("Wallet did not return a transaction id.");
  }
  return { txid: result.txid };
}
