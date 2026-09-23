const GUARANTEES = [
  {
    n: "01",
    title: "Non-custodial by design",
    body: "Funds leave a vault only when a holder burns their own receipt shares. There is no admin, owner or AI function that can withdraw anyone else's funds anywhere in the protocol.",
  },
  {
    n: "02",
    title: "Deterministic enforcement",
    body: "Every exposure, slippage, and liquidity check is independently recomputed on-chain from real balances at the moment of execution — never trusted from the AI, the frontend, or any off-chain source.",
  },
  {
    n: "03",
    title: "Bounded, revocable autonomy",
    body: "The AI can only ever propose intents inside the limits you set, and only submit them if you turned autonomous mode on. On Testnet the chain itself refuses to execute any strategy allocation, whatever anyone configures.",
  },
  {
    n: "04",
    title: "Receipts, not promises",
    body: "Deposits mint receipt shares priced against the pool's real net asset value, isolated per vault and per asset. STX and sBTC are separate pools - never converted, summed or cross-valued.",
  },
  {
    n: "05",
    title: "On-chain verifiability",
    body: "Every deposit, withdrawal, rejection, and execution is a real Testnet transaction with a real explorer link — nothing shown in this app is asserted without a chain to check it against.",
  },
  {
    n: "06",
    title: "Transparent AI",
    body: "Recommendations are grounded in real on-chain state and, when narrated by Claude, in live-verified facts only — the model can explain a decision, never invent a yield figure to justify one.",
  },
];

export function GuaranteeList() {
  return (
    <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
      {GUARANTEES.map((g) => (
        <div key={g.n} className="flex gap-4">
          <span className="font-tabular text-sm font-medium text-muted-2">{g.n}</span>
          <div>
            <div className="text-sm font-semibold text-foreground">{g.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{g.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
