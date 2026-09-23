import { ReactNode } from "react";
import clsx from "clsx";

export function StatTile({
  label,
  value,
  sub,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl border border-border bg-surface p-5", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 font-tabular text-2xl font-semibold text-foreground">
        {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-raised" /> : value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
