import Link from "next/link";

export interface AttentionItem {
  key: string;
  tone: "warning" | "info" | "danger";
  title: string;
  detail: string;
  href?: string;
  cta?: string;
  external?: boolean;
}

const TONE = {
  warning: { dot: "bg-warning", ring: "border-warning/30 bg-warning/5" },
  danger: { dot: "bg-danger", ring: "border-danger/30 bg-danger/5" },
  info: { dot: "bg-enforce", ring: "border-border bg-surface" },
} as const;

/** Things worth a look right now, each derived from real state. Renders nothing when there is nothing to flag. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Needs attention">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Needs attention</h2>
      <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
        {items.map((i) => {
          const t = TONE[i.tone];
          const link = i.href && i.cta && (
            i.external ? (
              <a href={i.href} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-accent hover:underline">
                {i.cta} &rarr;
              </a>
            ) : (
              <Link href={i.href} className="shrink-0 text-xs font-medium text-accent hover:underline">
                {i.cta} &rarr;
              </Link>
            )
          );
          return (
            <li key={i.key} className={`flex items-start gap-3 rounded-xl border p-4 ${t.ring}`}>
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{i.title}</div>
                <p className="mt-0.5 text-xs leading-5 text-muted">{i.detail}</p>
              </div>
              {link}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
