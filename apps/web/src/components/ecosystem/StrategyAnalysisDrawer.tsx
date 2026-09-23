"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CopyButton } from "@/components/ui/CopyButton";
import { EcosystemProtocol, ProtocolAnalysis, analyzeEcosystemProtocol } from "@/lib/ecosystem";
import { categoryInfo } from "@/lib/ecosystemCategories";
import { CategoryIcon } from "./CategoryIcon";
import { shortAddress, formatUsdCompact } from "@/lib/format";

export function StrategyAnalysisDrawer({
  protocol,
  onClose,
}: {
  protocol: EcosystemProtocol | null;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<ProtocolAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    if (!protocol) return;
    setAnalysis(null);
    setError(null);
    setShowTechnical(false);
    setLoading(true);
    analyzeEcosystemProtocol(protocol.id)
      .then(setAnalysis)
      .catch(() =>
        setError(
          "The AI analysis needs the SovereigntyAI agent service, which is not reachable right now. Everything above (verification, value locked, plain-language summary and risks) is still live."
        )
      )
      .finally(() => setLoading(false));
  }, [protocol]);

  return (
    <Drawer open={protocol !== null} onClose={onClose} title={protocol?.name ?? ""}>
      {protocol && (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-enforce/30 bg-enforce/5 p-3 text-xs text-muted">
            For research only. This is a real Stacks <strong className="text-foreground">Mainnet</strong>{" "}
            protocol shown so you can learn about it — SovereigntyAI vaults run on{" "}
            <strong className="text-foreground">Testnet</strong> and cannot put your funds into it.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={categoryInfo(protocol.category).tone}>
              <CategoryIcon category={protocol.category} />
              {categoryInfo(protocol.category).label}
            </Badge>
            <Badge tone={protocol.verification.exists ? "success" : protocol.verification.unreachable ? "neutral" : "danger"}>
              {protocol.verification.exists ? "Verified & active" : protocol.verification.unreachable ? "Checking..." : "Not found on-chain"}
            </Badge>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">In plain terms</div>
            <p className="mt-2 text-base leading-relaxed text-foreground">{protocol.plainSummary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-raised p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-2">Value locked</div>
              <div className="font-tabular mt-0.5 text-lg font-semibold text-foreground">
                {(analysis?.tvlUsd ?? protocol.tvlUsd) !== null
                  ? formatUsdCompact((analysis?.tvlUsd ?? protocol.tvlUsd) as number)
                  : "Unavailable"}
              </div>
              <div className="text-[10px] text-muted-2">live, via DefiLlama</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-2">On-chain status</div>
              <div className="font-tabular mt-0.5 text-lg font-semibold text-foreground">
                {protocol.verification.exists ? "Live" : "Not found"}
              </div>
              <div className="text-[10px] text-muted-2">
                {protocol.verification.blockHeight
                  ? `deployed at block ${protocol.verification.blockHeight.toLocaleString()}`
                  : "checked live via Hiro API"}
              </div>
            </div>
          </div>

          <a
            href={protocol.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Visit official site ↗
          </a>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">How it works</div>
            <ol className="mt-3 flex flex-col gap-3">
              {protocol.howItWorks.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                  <span className="font-tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-muted">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Things to know before using it</div>
            <ul className="mt-3 flex flex-col gap-2">
              {protocol.risks.map((risk, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs leading-relaxed text-muted"
                >
                  {risk}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              AI perspective
              <span className="normal-case font-normal text-muted">(education only, not financial advice)</span>
            </div>

            {loading && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted">Verifying live contract state and consulting AI...</p>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs text-danger">
                AI agent unavailable: {error}. Everything above is unaffected — it does not depend on the AI.
              </p>
            )}

            {analysis && !loading && (
              <div className="mt-3 space-y-3">
                <p className="text-sm leading-relaxed text-foreground">{analysis.analysis}</p>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted">
                  <span className="font-semibold text-warning">Not verified: </span>
                  {analysis.caveats}
                </div>
                {analysis.stxPriceUsd !== null && (
                  <p className="font-tabular text-xs text-muted">
                    Real-time STX price at analysis time: ${analysis.stxPriceUsd.toFixed(4)} (
                    {analysis.stxPriceChange24h !== null && analysis.stxPriceChange24h >= 0 ? "+" : ""}
                    {analysis.stxPriceChange24h?.toFixed(2)}% 24h)
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowTechnical((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground"
            >
              Technical details
              <span className="text-sm">{showTechnical ? "−" : "+"}</span>
            </button>
            {showTechnical && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <Info label="Category (raw)" value={protocol.category} />
                <div>
                  <div className="text-muted">Contract address</div>
                  <div className="font-tabular flex items-center gap-1.5 text-foreground">
                    {shortAddress(protocol.mainnetContract, 10)}
                    <CopyButton value={protocol.mainnetContract} label="Copy contract address" />
                  </div>
                </div>
                {protocol.verification.txId && (
                  <a
                    href={`https://explorer.hiro.so/txid/0x${protocol.verification.txId.replace(/^0x/, "")}?chain=mainnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 text-accent hover:underline"
                  >
                    View deployment transaction on explorer ↗
                  </a>
                )}
              </div>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={onClose} className="mt-2">
            Close
          </Button>
        </div>
      )}
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
