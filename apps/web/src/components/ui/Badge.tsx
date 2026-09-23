import { HTMLAttributes } from "react";
import clsx from "clsx";

type Tone = "neutral" | "accent" | "enforce" | "success" | "danger" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-raised text-muted border border-border-strong",
  accent: "bg-accent/10 text-accent border border-accent/30",
  enforce: "bg-enforce/10 text-enforce border border-enforce/30",
  success: "bg-success/10 text-success border border-success/30",
  danger: "bg-danger/10 text-danger border border-danger/30",
  warning: "bg-warning/10 text-warning border border-warning/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
