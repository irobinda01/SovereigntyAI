"use client";

import { EcosystemProtocol } from "@/lib/ecosystem";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { categoryInfo } from "@/lib/ecosystemCategories";
import { CategoryIcon } from "./CategoryIcon";
import { formatUsdCompact } from "@/lib/format";

export function StrategyCard({ protocol, onAnalyze }: { protocol: EcosystemProtocol; onAnalyze: () => void }) {
  const category = categoryInfo(protocol.category);

  return (
    <Card
      className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/6"
      onClick={onAnalyze}
    >
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-foreground">{protocol.name}</div>
          <Badge tone={protocol.verification.exists ? "success" : protocol.verification.unreachable ? "neutral" : "danger"}>
            {protocol.verification.exists ? "Verified & active" : protocol.verification.unreachable ? "Checking..." : "Not found on-chain"}
          </Badge>
        </div>

        <Badge tone={category.tone} className="mt-2">
          <CategoryIcon category={protocol.category} />
          {category.label}
        </Badge>

        <p className="mt-3 text-sm leading-relaxed text-foreground line-clamp-3">{protocol.plainSummary}</p>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-2">Value locked</div>
            <div className="font-tabular text-sm font-semibold text-foreground">
              {protocol.tvlUsd !== null ? formatUsdCompact(protocol.tvlUsd) : "Unavailable"}
            </div>
          </div>
          <span className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
            See how it works →
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
