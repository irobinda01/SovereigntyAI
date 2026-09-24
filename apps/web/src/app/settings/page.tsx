"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { useMyVaults } from "@/hooks/useMyVaults";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DEPLOYER_ADDRESS, NETWORK, STACKS_API_URL, SBTC_CONTRACT_ID, contractId, isProtocolConfigured } from "@/lib/config";
import { bpsToPct } from "@/lib/amounts";
import { modeLabel, purposeById } from "@/lib/presets";

export default function SettingsPage() {
  const { connected, stxAddress, connect } = useWallet();
  const { vaults, loading } = useMyVaults(stxAddress);
  const owned = vaults.filter((v) => v.role !== "holder");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Network and contracts</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <ConfigRow label="Network" value={NETWORK} />
          <ConfigRow label="Stacks API" value={STACKS_API_URL} />
          <ConfigRow label="Protocol deployer" value={isProtocolConfigured() ? DEPLOYER_ADDRESS : "not configured"} />
          <ConfigRow label="sBTC contract (real Testnet)" value={SBTC_CONTRACT_ID} />
          {isProtocolConfigured() && (
            <>
              <ConfigRow label="Vault contract" value={contractId("sovereignty-vault")} />
              <ConfigRow label="Receipt-token contract" value={contractId("receipt-token")} />
              <ConfigRow label="Risk guard" value={contractId("risk-guard")} />
              <ConfigRow label="Execution engine" value={contractId("execution-engine")} />
            </>
          )}
        </CardBody>
      </Card>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Treasuries you own</h2>

        {!connected && (
          <div className="mt-3">
            <EmptyState title="Connect your wallet to manage your treasuries">
              <Button className="mt-4" onClick={connect}>
                Connect wallet
              </Button>
            </EmptyState>
          </div>
        )}

        {connected && !loading && owned.length === 0 && (
          <div className="mt-3">
            <EmptyState title="You do not own a treasury yet.">
              <Link href="/vault/create">
                <Button className="mt-4">Create treasury</Button>
              </Link>
            </EmptyState>
          </div>
        )}

        <div className="mt-3 grid gap-3">
          {owned.map(({ overview }) => (
            <Link key={overview.meta.vaultId} href={`/vault/${overview.meta.vaultId}/settings`}>
              <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/[0.06]">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{overview.meta.name}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {purposeById(overview.meta.purpose).label} · {modeLabel(overview.meta.assets)} · Vault #{overview.meta.vaultId}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>exposure cap {bpsToPct(overview.risk.maxExposureBps)}%</span>
                    <span>{overview.risk.autonomousEnabled ? "Autonomous configured" : "Manual"}</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-tabular mt-0.5 break-all text-foreground">{value}</div>
    </div>
  );
}
