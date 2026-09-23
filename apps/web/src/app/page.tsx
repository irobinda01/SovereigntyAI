import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StrategyExplorer } from "@/components/ecosystem/StrategyExplorer";
import { GuaranteeList } from "@/components/GuaranteeList";
import { Faq } from "@/components/Faq";
import { HowItWorks } from "@/components/HowItWorks";
import { HeroCtas } from "@/components/home/HeroCtas";
import { LiveConsole } from "@/components/home/LiveConsole";
import { FlowDiagram } from "@/components/home/FlowDiagram";
import { ShareCalculator } from "@/components/home/ShareCalculator";
import { PurposeGrid } from "@/components/home/PurposeGrid";
import { TestnetSafety } from "@/components/home/TestnetSafety";
import { Reveal } from "@/components/home/Reveal";

const TRUST = ["Non-custodial", "Clarity-enforced", "Real testnet assets", "No mock data"];

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`mx-auto max-w-6xl px-6 py-20 sm:py-28 ${className}`}>
      <Reveal>{children}</Reveal>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
            backgroundSize: "32px 32px",
            maskImage: "linear-gradient(to bottom, black 40%, transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-200px] -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
        />

        <div className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:pb-28">
          <div>
            <ul className="flex flex-wrap gap-2 animate-[fadeIn_0.5s_ease-out]">
              {TRUST.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-border-strong bg-surface-raised px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted"
                >
                  {t}
                </li>
              ))}
            </ul>

            <h1 className="mt-6 animate-[fadeIn_0.6s_ease-out] text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              AI proposes.
              <br />
              Clarity enforces.
              <br />
              <span className="text-accent">You retain ownership.</span>
            </h1>

            <p className="mt-6 max-w-xl animate-[fadeIn_0.7s_ease-out] text-lg leading-8 text-muted">
              Your treasury remains yours. SovereigntyAI continuously analyzes available opportunities and proposes portfolio
              reallocations within the rules you define. Clarity enforces those rules.
            </p>
            <p className="mt-3 max-w-xl animate-[fadeIn_0.75s_ease-out] text-sm leading-6 text-muted-2">
              On Testnet, recommendations can be analyzed and validated, but autonomous strategy execution remains disabled.
            </p>

            <div className="mt-8 animate-[fadeIn_0.9s_ease-out]">
              <HeroCtas />
            </div>
          </div>

          <div className="animate-[fadeIn_0.9s_ease-out]">
            <LiveConsole />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <Section className="border-t border-border">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">How it works</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">From deposit to redemption in three moves.</h2>
        </div>
        <div className="mt-12">
          <HowItWorks />
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/docs/user-guide">
            <Button variant="secondary">Read the user guide</Button>
          </Link>
          <Link href="/docs/vault-architecture">
            <Button variant="ghost">Vault architecture &rarr;</Button>
          </Link>
        </div>
      </Section>

      {/* ------------------------------------------------------- the model */}
      <Section className="border-t border-border">
        <FlowDiagram />
      </Section>

      {/* ------------------------------------------------- receipt shares */}
      <Section className="border-t border-border bg-surface-raised/40 !max-w-none">
        <div className="mx-auto max-w-6xl">
          <ShareCalculator />
        </div>
      </Section>

      {/* -------------------------------------------------------- purposes */}
      <Section>
        <PurposeGrid />
      </Section>

      {/* ---------------------------------------------------- testnet stance */}
      <Section className="pt-0">
        <TestnetSafety />
      </Section>

      {/* -------------------------------------------------------- guarantees */}
      <Section className="border-t border-border">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Guarantees</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Enforced in code, not in a terms of service.</h2>
        </div>
        <div className="mt-12">
          <GuaranteeList />
        </div>
      </Section>

      {/* ---------------------------------------------- ecosystem (mainnet) */}
      <div className="border-t border-border pt-20 sm:pt-28">
        <StrategyExplorer />
      </div>

      {/* ------------------------------------------------------------- faq */}
      <Section className="max-w-3xl border-t border-border">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Frequently asked</h2>
        <div className="mt-10">
          <Faq />
        </div>
      </Section>

      {/* ----------------------------------------------------------- final cta */}
      <section className="mx-auto max-w-6xl px-6 pb-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border-strong bg-surface px-6 py-14 text-center sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
            />
            <h2 className="relative text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Your treasury remains yours.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base leading-7 text-muted">
              Create your first treasury on Stacks Testnet in a few minutes. Real testnet assets, receipt shares you can verify
              on-chain, and rules only you can change.
            </p>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/vault/create">
                <Button size="lg">Create a treasury</Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="secondary">
                  Explore the docs
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
