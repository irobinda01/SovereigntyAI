import { bpsToPct } from "@/lib/amounts";

export interface AllocationSlice {
  label: string;
  bps: number;
  tone: "idle" | "strategy";
}

const STRATEGY_COLORS = ["bg-enforce", "bg-accent", "bg-success", "bg-warning", "bg-danger"];

function colorFor(slice: AllocationSlice, index: number) {
  return slice.tone === "idle" ? "bg-muted-2/60" : STRATEGY_COLORS[index % STRATEGY_COLORS.length];
}

/**
 * Stacked bar of a pool's REAL allocation: idle vs each strategy. Every slice
 * is derived from on-chain balances by the caller; with no data the caller
 * renders an empty state instead of this component.
 */
export function AllocationBar({ slices }: { slices: AllocationSlice[] }) {
  const total = slices.reduce((s, x) => s + x.bps, 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised" role="img" aria-label="Allocation">
        {slices.map((s, i) =>
          s.bps > 0 ? (
            <div key={s.label} className={colorFor(s, i)} style={{ width: `${(s.bps / Math.max(total, 1)) * 100}%` }} />
          ) : null
        )}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted">
              <span className={`h-2 w-2 rounded-full ${colorFor(s, i)}`} />
              {s.label}
            </span>
            <span className="font-tabular font-medium text-foreground">{bpsToPct(s.bps)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
