import { EcosystemProtocol } from "@/lib/ecosystem";
import { formatUsdCompact } from "@/lib/format";

export function EcosystemStats({ protocols }: { protocols: EcosystemProtocol[] }) {
  const verifiedCount = protocols.filter((p) => p.verification.exists).length;
  const categories = new Set(protocols.map((p) => p.category)).size;
  const knownTvls = protocols.filter((p) => p.tvlUsd !== null);
  const combinedTvl = knownTvls.reduce((sum, p) => sum + (p.tvlUsd ?? 0), 0);

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Protocols tracked" value={String(protocols.length)} />
      <StatCard label="Verified live now" value={String(verifiedCount)} />
      <StatCard label="Categories" value={String(categories)} />
      <StatCard
        label="Combined value locked"
        value={knownTvls.length > 0 ? formatUsdCompact(combinedTvl) : "—"}
        hint={knownTvls.length > 0 ? `live, via DefiLlama, ${knownTvls.length}/${protocols.length} reporting` : "unavailable"}
      />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="font-tabular text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}
