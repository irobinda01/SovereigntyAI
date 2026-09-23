import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DOCS, docGroups, getDocMeta } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation - SovereigntyAI",
  description: "Guides, architecture, contracts and the security model for the SovereigntyAI non-custodial treasury protocol.",
};

const FLOW = [
  { n: "1", title: "Connect", body: "Use a Stacks Testnet wallet account.", href: "/docs/user-guide#the-five-minute-flow" },
  { n: "2", title: "Create a treasury", body: "Purpose, name, assets, risk, autonomy, review, sign.", href: "/docs/user-guide#creating-a-treasury" },
  { n: "3", title: "Deposit", body: "Real testnet assets in, receipt shares out.", href: "/docs/user-guide#depositing" },
  { n: "4", title: "Get AI recommendations", body: "Analyzed and validated. Never executed on Testnet.", href: "/docs/user-guide#ai-recommendations" },
  { n: "5", title: "Redeem", body: "Burn shares, receive your proportional assets.", href: "/docs/user-guide#redeeming" },
];

const PRINCIPLES = [
  { title: "AI proposes", body: "The AI analyzes real on-chain state and proposes bounded intents. It has no custody and no authority of its own." },
  { title: "Clarity enforces", body: "Every limit is recomputed on-chain. On Testnet the contracts themselves refuse strategy execution." },
  { title: "Receipts represent ownership", body: "Deposits mint shares priced against the pool's real net asset value, isolated per vault and per asset." },
  { title: "You retain ownership", body: "Only holders can redeem their own shares. No admin, owner or AI function can move anyone else's funds." },
];

export default async function DocsLanding({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  // Old links used /docs?page=<slug>.
  const { page } = await searchParams;
  if (page && getDocMeta(page)) redirect(`/docs/${page}`);

  return (
    <div className="py-10 lg:py-14">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Documentation</div>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Build on, and trust, your treasury.</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
        How SovereigntyAI works, from your first deposit to the contract-level security model. Written against the code that is
        actually deployed on Stacks Testnet.
      </p>

      <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm text-muted">
        <span className="font-semibold text-foreground">Stacks Testnet.</span> Real testnet assets with no mainnet value. The AI can
        analyze, recommend and validate, but autonomous strategy execution is disabled.
      </div>

      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Quick start</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((s) => (
            <li key={s.n}>
              <Link
                href={s.href}
                className="group flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/[0.06]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong font-tabular text-xs font-semibold text-foreground">
                  {s.n}
                </span>
                <span className="mt-3 text-sm font-semibold text-foreground">{s.title}</span>
                <span className="mt-1 text-xs leading-5 text-muted">{s.body}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Principles</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-surface p-5">
              <div className="text-sm font-semibold text-foreground">{p.title}</div>
              <p className="mt-1.5 text-sm leading-6 text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 space-y-10">
        {docGroups().map((g) => (
          <div key={g.group}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{g.group}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {g.docs.map((d) => (
                <Link
                  key={d.slug}
                  href={`/docs/${d.slug}`}
                  className="group rounded-xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/[0.06]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{d.title}</span>
                    <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">
                      &rarr;
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{d.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <p className="mt-14 text-xs text-muted-2">{DOCS.length} guides. Press Ctrl+K (or /) anywhere in the docs to search.</p>
    </div>
  );
}
