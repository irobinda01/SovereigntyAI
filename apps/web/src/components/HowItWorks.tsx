const STEPS = [
  {
    n: "1",
    title: "Create treasuries & deposit",
    body: "Create as many independent treasuries as you need, each with its own purpose and limits, then deposit real testnet STX or sBTC. You receive receipt shares - your on-chain claim on that treasury - and Clarity enforces exactly the limits you sign.",
  },
  {
    n: "2",
    title: "AI reads real state, proposes",
    body: "The agent reads your treasury's actual on-chain balances and rules, then proposes a bounded reallocation as a structured intent - never a direct transfer. The deployed contracts validate it against your limits.",
  },
  {
    n: "3",
    title: "Clarity enforces - Testnet stops at validation",
    body: "Every field - exposure, slippage, nonce, deadline, liquidity - is independently recomputed on-chain. On Testnet, recommendations can be analyzed and validated, but autonomous strategy execution stays disabled, so your assets never move.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {STEPS.map((s) => (
        <div key={s.n}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong font-tabular text-sm font-semibold text-foreground">
            {s.n}
          </div>
          <div className="mt-4 text-sm font-semibold text-foreground">{s.title}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
