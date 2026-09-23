import type { ReactNode } from "react";

interface Node {
  title: string;
  tag: string;
  body: ReactNode;
  side: "user" | "chain" | "offchain";
}

const NODES: Node[] = [
  { title: "You", tag: "Owner", side: "user", body: "Hold receipt shares - your claim on a treasury. Only you can redeem them." },
  { title: "Vault", tag: "sovereignty-vault", side: "chain", body: "Holds and accounts for the assets, one isolated pool per vault and asset. Mints and burns receipts." },
  { title: "Risk guard", tag: "risk-guard", side: "chain", body: "Recomputes every limit on-chain: exposure, idle floor, slippage, nonce, deadline, cooldown." },
  { title: "Execution engine", tag: "execution-engine", side: "chain", body: "Receives the AI's intent, validates it read-only, and applies the network gate." },
  { title: "AI agent", tag: "off-chain", side: "offchain", body: "Analyzes real data and proposes. It has no keys to your funds and cannot redefine a rule." },
];

const SIDE = {
  user: { ring: "border-accent/40", dot: "bg-accent", label: "text-accent" },
  chain: { ring: "border-enforce/40", dot: "bg-enforce", label: "text-enforce" },
  offchain: { ring: "border-border-strong", dot: "bg-muted-2", label: "text-muted" },
} as const;

/**
 * The security model as a picture: ownership at the top, Clarity enforcement in
 * the middle, an off-chain proposer at the bottom. Authority flows upward;
 * proposals flow downward-in - the AI is never above the vault.
 */
export function FlowDiagram() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-center">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">The model</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          AI proposes.
          <br />
          Clarity enforces.
          <br />
          You keep ownership.
        </h2>
        <p className="mt-4 max-w-md text-base leading-7 text-muted">
          The AI is an optimization layer, never a custodian. Every rule that protects your treasury lives in Clarity contracts
          that no one - not the AI, not the admin, not the vault owner - can bypass.
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-muted">
          {[
            "It cannot withdraw to arbitrary addresses or change your limits",
            "It cannot mint receipts or authorize itself",
            "Anything outside your rules is rejected on-chain, atomically",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <svg className="mt-1 shrink-0 text-success" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </li>
          ))}
        </ul>
      </div>

      <ol className="relative">
        {NODES.map((n, i) => {
          const s = SIDE[n.side];
          const last = i === NODES.length - 1;
          return (
            <li key={n.title} className="relative pl-10 pb-4 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-1.25rem)] w-px bg-border-strong" />}
              <span aria-hidden className={`absolute left-0 top-4 flex h-6 w-6 items-center justify-center rounded-full border bg-background ${s.ring}`}>
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              </span>
              <div className={`rounded-xl border bg-surface p-4 ${s.ring}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">{n.title}</div>
                  <div className={`font-mono text-[11px] ${s.label}`}>{n.tag}</div>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted">{n.body}</p>
              </div>
            </li>
          );
        })}
        <li className="pl-10 pt-3 text-xs text-muted-2">Real on-chain data feeds the agent. Nothing in this stack is simulated.</li>
      </ol>
    </div>
  );
}
