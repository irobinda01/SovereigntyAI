"use client";

import { useEffect, useState } from "react";
import { getStxMarketData, StxMarketData } from "@/lib/ecosystem";
import { Skeleton } from "@/components/ui/Skeleton";

export function StxPriceTicker() {
  const [data, setData] = useState<StxMarketData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getStxMarketData()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === undefined) return <Skeleton className="h-6 w-28" />;
  if (data === null) return null;

  const up = data.usd24hChange >= 0;

  return (
    <div className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-raised px-3 py-1.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      </span>
      <span className="font-tabular text-xs font-medium text-foreground">${data.usd.toFixed(3)}</span>
      <span className={`font-tabular text-xs ${up ? "text-success" : "text-danger"}`}>
        {up ? "+" : ""}
        {data.usd24hChange.toFixed(2)}%
      </span>
      <span className="text-xs text-muted">STX</span>
    </div>
  );
}
