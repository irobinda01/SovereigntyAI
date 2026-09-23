"use client";

import { useState } from "react";
import clsx from "clsx";

const FAQS = [
  {
    q: "Can the AI move my funds without my permission?",
    a: "No. The AI can only submit an execution intent — a proposal. Clarity independently re-validates every field (amount, exposure, slippage, deadline, nonce) against your own configured limits before anything executes, and it can only act at all if you've explicitly enabled autonomous mode for that vault.",
  },
  {
    q: "What happens if the AI recommends something outside my limits?",
    a: "Clarity rejects it on-chain, atomically — no partial execution, no funds move. This is enforced by risk-guard.clar independently of anything the AI, the frontend, or any off-chain service claims.",
  },
  {
    q: "Can the admin withdraw my funds?",
    a: "No admin function in the protocol can move, withdraw, or redirect user funds, or mint receipt shares - see the security model for the full breakdown. The admin can pause new deposits/rebalances, but redemptions are never blocked by any pause.",
  },
  {
    q: "Why does the Strategies page show nothing?",
    a: "SovereigntyAI ships with zero pre-approved strategies by design — no third-party protocol with a verified, current Testnet interface was available at build time, and this project never fakes an integration. Registering a real strategy is a deliberate, auditable governance action.",
  },
  {
    q: "What are the Mainnet protocols on the home page for?",
    a: "Pure research and AI-assisted analysis. SovereigntyAI's vaults run on Testnet and cannot allocate funds into any Mainnet contract — those cards exist so you can explore the real Stacks DeFi ecosystem, not to move money into it from here.",
  },
  {
    q: "Why can't the AI execute the reallocation it recommends?",
    a: "SovereigntyAI currently runs on Stacks Testnet with testnet assets. The AI can analyze, recommend, generate an intent and have it validated against your vault's on-chain rules, but the contracts themselves refuse strategy execution on Testnet (they read the chain id - no key or setting can override it). Your assets stay in their current allocation. This is an intentional safety state, not an error.",
  },
  {
    q: "What are receipt tokens?",
    a: "An accounting claim on one vault's pool of one asset - your fractional ownership. Deposits mint shares priced against the pool's net asset value; redeeming burns them for your proportional share. They are not profit, governance or investment tokens, and they are non-transferable in this MVP.",
  },
  {
    q: "Is this audited or ready for real funds?",
    a: "No — this is a Testnet MVP. Do not deploy this to Mainnet or use it with real value without an independent security audit.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-border border-y border-border">
      {FAQS.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(expanded ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
              aria-expanded={expanded}
            >
              <span className="text-sm font-medium text-foreground">{item.q}</span>
              <span
                className={clsx(
                  "flex h-5 w-5 shrink-0 items-center justify-center text-muted transition-transform duration-200",
                  expanded && "rotate-45"
                )}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            <div
              className={clsx(
                "grid overflow-hidden transition-all duration-200 ease-out",
                expanded ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <p className="min-h-0 text-sm leading-relaxed text-muted">{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
