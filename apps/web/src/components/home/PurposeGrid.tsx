import Link from "next/link";
import { PURPOSES } from "@/lib/presets";
import { bpsToPct } from "@/lib/amounts";

/**
 * The six treasury purposes, from the same preset table the creation flow
 * uses (single source). Numbers shown are configuration defaults - a risk
 * posture the owner can change - never returns or performance.
 */
export function PurposeGrid() {
  return (
    <div>
      <div className="max-w-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Many treasuries, one wallet</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Every treasury has a purpose.</h2>
        <p className="mt-4 text-base leading-7 text-muted">
          Create as many independent treasuries as you need. Choosing a purpose sets sensible starting limits - you review and can
          change every one before you sign. Defaults are a starting posture, not a hard cap and not a promise of yield.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PURPOSES.map((p) => (
          <Link
            key={p.key}
            href="/vault/create"
            className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-foreground">{p.label}</div>
                <div className="text-xs text-accent">{p.tagline}</div>
              </div>
              <span aria-hidden className="text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100">
                &rarr;
              </span>
            </div>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted">{p.description}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
              <div>
                <dt className="text-muted-2">Per-strategy cap</dt>
                <dd className="font-tabular mt-0.5 font-medium text-foreground">{bpsToPct(p.defaults.maxExposureBps)}%</dd>
              </div>
              <div>
                <dt className="text-muted-2">Idle floor</dt>
                <dd className="font-tabular mt-0.5 font-medium text-foreground">{bpsToPct(p.defaults.minIdleBps)}%</dd>
              </div>
              <div>
                <dt className="text-muted-2">Max slippage</dt>
                <dd className="font-tabular mt-0.5 font-medium text-foreground">{bpsToPct(p.defaults.maxSlippageBps)}%</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-2">Default configuration values shown - editable in the creation flow.</p>
    </div>
  );
}
