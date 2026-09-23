const STAGES = [
  { label: "Live data analyzed", state: "on", note: "Real on-chain state" },
  { label: "Recommendation generated", state: "on", note: "With a reason" },
  { label: "Intent generated", state: "on", note: "Structured, with nonce and deadline" },
  { label: "Risk validation", state: "on", note: "Run by the deployed contracts" },
  { label: "Strategy execution", state: "off", note: "Disabled on Testnet" },
] as const;

/** The testnet stance, stated plainly on the home page - it is a feature, not a caveat. */
export function TestnetSafety() {
  return (
    <div className="overflow-hidden rounded-3xl border border-warning/25 bg-gradient-to-b from-warning/[0.06] to-transparent p-6 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">Explicit Testnet safety</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Recommendations, validated.
            <br />
            Execution, off.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-muted">
            On Stacks Testnet the AI can analyze, recommend and have every intent validated against your on-chain rules. The
            contracts themselves refuse to execute a strategy allocation - they read the chain id, so no key or setting can
            override it. Your assets stay exactly where they are.
          </p>
          <p className="mt-3 max-w-md text-sm text-muted-2">
            This is an intentional safety state, not an error. You will never see a &ldquo;successfully rebalanced&rdquo; message
            for something that did not happen.
          </p>
        </div>

        <ol className="grid gap-2.5">
          {STAGES.map((s) => {
            const on = s.state === "on";
            return (
              <li
                key={s.label}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${on ? "border-border bg-surface" : "border-warning/30 bg-warning/5"}`}
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    on ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  }`}
                >
                  {on ? "✓" : "⚠"}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{s.label}</div>
                  <div className="text-xs text-muted">{s.note}</div>
                </div>
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${on ? "text-success" : "text-warning"}`}>
                  {on ? "Enabled" : "Disabled"}
                </span>
              </li>
            );
          })}
          <li className="px-1 pt-1 text-xs text-muted">Your assets remain in their current vault allocation.</li>
        </ol>
      </div>
    </div>
  );
}
