"use client";

import { useEffect, useState } from "react";
import { Cl } from "@stacks/transactions";
import { useVault } from "@/components/vault/VaultContext";
import { useTransaction } from "@/hooks/useTransaction";
import { getProtocolLimits, type ProtocolLimits } from "@/lib/onchain";
import { contractId, NETWORK } from "@/lib/config";
import { networkOfAddress, signAndBroadcastContractCall } from "@/lib/wallet";
import { modeLabel, purposeById } from "@/lib/presets";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { TxProgress } from "@/components/vault/TxProgress";
import { AutonomousModeNotice } from "@/components/vault/TestnetGate";
import {
  AutonomyChoice,
  RiskFields,
  parseRisk,
  valuesFromConfig,
  type RiskErrors,
  type RiskFormValues,
} from "@/components/vault/RiskFields";

export default function VaultSettingsPage() {
  const { overview, vaultId, viewer, isOwner, refresh } = useVault();
  const { meta, risk } = overview;
  const wrongNetwork = viewer ? networkOfAddress(viewer) !== NETWORK : false;

  const [limits, setLimits] = useState<ProtocolLimits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  useEffect(() => {
    getProtocolLimits().then(setLimits).catch((e) => setLimitsError(e instanceof Error ? e.message : "Could not read protocol limits."));
  }, []);

  // --- metadata form
  const [name, setName] = useState(meta.name);
  const [openDeposits, setOpenDeposits] = useState(meta.openDeposits);
  const metaTx = useTransaction();
  const nameChars = [...name.trim()].length;
  const nameValid = nameChars >= 1 && nameChars <= 48;

  // --- risk form
  const [values, setValues] = useState<RiskFormValues>(() => valuesFromConfig(risk));
  const [errors, setErrors] = useState<RiskErrors>({});
  const [accepted, setAccepted] = useState(risk.autonomousEnabled);
  const riskTx = useTransaction();

  // --- pause
  const pauseTx = useTransaction();

  const contract = contractId("sovereignty-vault");
  const showStx = overview.meta.assets !== 2;
  const showSbtc = overview.meta.assets !== 1;

  async function saveMeta() {
    const res = await metaTx.run(() =>
      signAndBroadcastContractCall({
        contract,
        functionName: "set-vault-config",
        functionArgs: [Cl.uint(vaultId), Cl.stringUtf8(name.trim()), Cl.bool(openDeposits)],
      })
    );
    if (res) await refresh();
  }

  async function saveRisk() {
    if (!limits) return;
    const parsed = parseRisk(values, limits);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const v = parsed.value;
    const res = await riskTx.run(() =>
      signAndBroadcastContractCall({
        contract,
        functionName: "set-risk-config",
        functionArgs: [
          Cl.uint(vaultId),
          Cl.uint(v.maxExposureBps),
          Cl.uint(v.maxStxTx),
          Cl.uint(v.maxSbtcTx),
          Cl.uint(v.maxSlippageBps),
          Cl.uint(v.minIdleBps),
          Cl.bool(v.autonomous),
          Cl.uint(v.cooldownBlocks),
        ],
      })
    );
    if (res) await refresh();
  }

  async function togglePause() {
    const res = await pauseTx.run(() =>
      signAndBroadcastContractCall({
        contract,
        functionName: meta.paused ? "unpause-vault" : "pause-vault",
        functionArgs: [Cl.uint(vaultId)],
      })
    );
    if (res) await refresh();
  }

  const autonomyNeedsAck = values.autonomous && !risk.autonomousEnabled && !accepted;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vault</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 text-sm sm:grid-cols-3">
          <Info label="Purpose" value={purposeById(meta.purpose).label} note="Fixed at creation" />
          <Info label="Supported assets" value={modeLabel(meta.assets)} note="Fixed at creation" />
          <Info label="Owner" value={meta.owner} mono />
        </CardBody>
      </Card>

      {!isOwner && (
        <p className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted">
          You are viewing this vault as a non-owner. Only the owner can change its settings. Every parameter below is enforced by
          the contracts and cannot be changed by the AI, the protocol admin, or anyone else.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Name and deposit access</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner || metaTx.busy}
              className="mt-1.5 w-full max-w-md rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={openDeposits} disabled={!isOwner || metaTx.busy} onChange={(e) => setOpenDeposits(e.target.checked)} />
            Allow other wallets to deposit and receive receipt shares
          </label>
          <p className="text-xs text-muted">
            Depositors can only ever redeem their own receipt shares. As owner you can change limits and autonomy but you can never
            move another depositor&apos;s funds.
          </p>
          {isOwner && (
            <Button
              onClick={saveMeta}
              disabled={!nameValid || wrongNetwork || metaTx.busy || (name.trim() === meta.name && openDeposits === meta.openDeposits)}
            >
              Save
            </Button>
          )}
          <TxProgress phase={metaTx.phase} txId={metaTx.txId} error={metaTx.error} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk parameters</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          {limitsError && <p className="text-xs text-danger">{limitsError}</p>}
          <RiskFields
            values={values}
            onChange={setValues}
            errors={errors}
            disabled={!isOwner || riskTx.busy}
            showStx={showStx}
            showSbtc={showSbtc}
          />
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Autonomy</div>
            <AutonomyChoice
              autonomous={values.autonomous}
              onChange={(v) => setValues({ ...values, autonomous: v })}
              disabled={!isOwner || riskTx.busy}
              accepted={accepted}
              onAccept={setAccepted}
            />
          </div>
          {isOwner && (
            <Button onClick={saveRisk} disabled={!limits || wrongNetwork || riskTx.busy || autonomyNeedsAck}>
              Save risk parameters
            </Button>
          )}
          <TxProgress phase={riskTx.phase} txId={riskTx.txId} error={riskTx.error} />
        </CardBody>
      </Card>

      <AutonomousModeNotice risk={risk} environment={overview.environment} />

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{meta.paused ? "Vault is paused" : "Pause vault"}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              Pausing stops new deposits and any new strategy allocation. It never stops redemptions - every holder can always redeem
              their idle funds.
            </p>
            <Button variant={meta.paused ? "primary" : "secondary"} onClick={togglePause} disabled={wrongNetwork || pauseTx.busy}>
              {meta.paused ? "Unpause vault" : "Pause vault"}
            </Button>
            <TxProgress phase={pauseTx.phase} txId={pauseTx.txId} error={pauseTx.error} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value, note, mono }: { label: string; value: string; note?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 break-all font-medium text-foreground ${mono ? "font-tabular text-xs" : ""}`}>{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-muted-2">{note}</div>}
    </div>
  );
}
