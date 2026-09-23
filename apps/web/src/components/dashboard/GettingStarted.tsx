"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export interface Step {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  href?: string;
  cta?: string;
  external?: boolean;
}

/**
 * Onboarding checklist. Every step's "done" state is derived from real state
 * (wallet balances, on-chain indexes, receipt positions, the agent's log) by the
 * caller - nothing here is a remembered or fake checkbox.
 */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-label="Getting started">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Getting started</h2>
          <p className="mt-0.5 text-xs text-muted">
            {doneCount} of {steps.length} done{next ? ` - next: ${next.title.toLowerCase()}` : ""}
          </p>
        </div>
        <div className="flex w-40 items-center gap-2" aria-hidden>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-tabular text-xs text-muted">{pct}%</span>
        </div>
      </div>

      <ol className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => {
          const isNext = next?.key === s.key;
          return (
            <li
              key={s.key}
              className={`flex flex-col rounded-xl border p-3.5 ${
                s.done ? "border-success/25 bg-success/5" : isNext ? "border-accent/40 bg-accent/5" : "border-border bg-surface-raised/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    s.done ? "bg-success text-white" : "border border-border-strong text-muted"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="text-sm font-medium text-foreground">{s.title}</span>
              </div>
              <p className="mt-1.5 flex-1 text-xs leading-5 text-muted">{s.detail}</p>
              {!s.done && s.href && s.cta && (
                <div className="mt-3">
                  {s.external ? (
                    <a href={s.href} target="_blank" rel="noreferrer">
                      <Button size="sm" variant={isNext ? "primary" : "secondary"}>
                        {s.cta}
                      </Button>
                    </a>
                  ) : (
                    <Link href={s.href}>
                      <Button size="sm" variant={isNext ? "primary" : "secondary"}>
                        {s.cta}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
