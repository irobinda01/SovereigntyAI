"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cl, cvToJSON } from "@stacks/transactions";
import { useWallet } from "@/lib/wallet-context";
import { useTransaction } from "@/hooks/useTransaction";
import { getProtocolLimits, type ProtocolLimits } from "@/lib/onchain";
import { contractId, NETWORK } from "@/lib/config";
import { networkOfAddress, signAndBroadcastContractCall } from "@/lib/wallet";
import { ASSET_MODES, PURPOSES, modeLabel, purposeById } from "@/lib/presets";
import { bpsToPct, formatAsset } from "@/lib/amounts";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { NetworkPill, RealAssetTag } from "@/components/NetworkStrip";
import { TxProgress } from "@/components/vault/TxProgress";
import {
  AutonomyChoice,
  RiskFields,
  parseRisk,
  valuesFromDefaults,
  type RiskErrors,
  type RiskFormValues,
} from "@/components/vault/RiskFields";

const STEPS = ["Purpose", "Name", "Assets", "Risk", "Autonomy", "Review", "Create"] as const;
const NAME_MAX = 48;

export default function CreateVaultPage() {
  const { connected, stxAddress, connect, connecting } = useWallet();
  const tx = useTransaction();

  const [step, setStep] = useState(0);
  const [purposeId, setPurposeId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [mode, setMode] = useState<number>(1);
  const [openDeposits, setOpenDeposits] = useState(false);
  const [values, setValues] = useState<RiskFormValues>(() => valuesFromDefaults(PURPOSES[5].defaults));
  const [errors, setErrors] = useState<RiskErrors>({});
  const [accepted, setAccepted] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const [limits, setLimits] = useState<ProtocolLimits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  useEffect(() => {
    getProtocolLimits().then(setLimits).catch((e) => setLimitsError(e instanceof Error ? e.message : "Could not read protocol limits."));
  }, []);

  const purpose = purposeId !== null ? purposeById(purposeId) : null;
  const trimmed = name.trim();
  const nameChars = [...trimmed].length;
  const nameValid = nameChars >= 1 && nameChars <= NAME_MAX;
  const parsed = useMemo(() => (limits ? parseRisk(values, limits) : null), [values, limits]);

  const wrongNetwork = stxAddress ? networkOfAddress(stxAddress) !== NETWORK : false;

  function choosePurpose(id: number) {
    const p = purposeById(id);
    setPurposeId(id);
    setValues(valuesFromDefaults(p.defaults));
    setOpenDeposits(p.defaults.openDeposits);
    setAccepted(false);
    setErrors({});
    if (!nameEdited) setName(p.suggestedName);
  }

  function next() {
    if (step === 3) {
      if (!parsed) return;
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      setErrors({});
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  const canNext =
    (step === 0 && purposeId !== null) ||
    (step === 1 && nameValid) ||
    step === 2 ||
    (step === 3 && limits !== null) ||
    (step === 4 && (!values.autonomous || accepted));

  async function create() {
    if (!parsed || !parsed.ok || !purpose) return;
    const v = parsed.value;
    setStep(6);
    const res = await tx.run(() =>
      signAndBroadcastContractCall({
        contract: contractId("sovereignty-vault"),
        functionName: "create-vault",
        functionArgs: [
          Cl.stringUtf8(trimmed),
          Cl.uint(purpose.id),
          Cl.uint(mode),
          Cl.bool(openDeposits),
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
    if (res?.resultCV) setCreatedId(Number(cvToJSON(res.resultCV).value.value));
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <EmptyState title="Connect your wallet to create a treasury">
          <p>Creating a treasury is one real Stacks Testnet transaction that you sign.</p>
          <Button className="mt-4" onClick={connect} disabled={connecting}>
            Connect wallet
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create treasury</h1>
        <NetworkPill />
      </div>
      <p className="mt-1 text-sm text-muted">
        Network: Stacks {NETWORK === "testnet" ? "Testnet" : "Mainnet"}. You will use real {NETWORK === "testnet" ? "testnet " : ""}assets - they
        have no mainnet value.
      </p>

      <ol className="mt-6 grid grid-cols-7 gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="min-w-0">
            <div className={`h-1 rounded-full ${i < step ? "bg-accent" : i === step ? "bg-accent/60" : "bg-border"}`} />
            <div className={`mt-1.5 truncate text-[10px] font-medium uppercase tracking-wider ${i === step ? "text-foreground" : "text-muted-2"}`}>
              {i + 1} {label}
            </div>
          </li>
        ))}
      </ol>

      {wrongNetwork && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Your wallet account is not a {NETWORK} account. Switch accounts before creating a treasury.
        </p>
      )}

      <Card className="mt-6">
        <CardBody className="space-y-6">
          {step === 0 && (
            <>
              <Heading title="What is this treasury for?" body="Pick the purpose that fits. It sets sensible starting values you will review and can change - they are defaults, not limits, and no performance is implied." />
              <div className="grid gap-3 sm:grid-cols-2">
                {PURPOSES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => choosePurpose(p.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      purposeId === p.id ? "border-accent bg-accent/5" : "border-border-strong hover:border-muted-2"
                    }`}
                  >
                    <div className="text-sm font-semibold text-foreground">{p.label}</div>
                    <div className="text-xs text-accent">{p.tagline}</div>
                    <p className="mt-2 text-xs text-muted">{p.description}</p>
                    <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
                      {p.traits.map((t) => (
                        <li key={t}>· {t}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Heading title="Name your treasury" body="Shown on the dashboard and stored on-chain. You can rename it later." />
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                maxLength={NAME_MAX * 2}
                placeholder="Operations Treasury"
                className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
                aria-label="Treasury name"
              />
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                Examples:
                {["Operations Treasury", "BTC Savings", "DAO Treasury", "Business Reserve"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setName(n);
                      setNameEdited(true);
                    }}
                    className="rounded-full border border-border-strong px-2 py-0.5 hover:text-foreground"
                  >
                    {n}
                  </button>
                ))}
              </div>
              {!nameValid && name !== "" && <p className="text-xs text-danger">Use 1-{NAME_MAX} characters.</p>}
            </>
          )}

          {step === 2 && (
            <>
              <Heading title="Choose supported assets" body="These are REAL testnet assets: native STX and the real Testnet sBTC token." />
              <div className="grid gap-3">
                {ASSET_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      mode === m.id ? "border-accent bg-accent/5" : "border-border-strong hover:border-muted-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">{m.label}</div>
                      <div className="flex items-center gap-2">
                        <RealAssetTag />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted">{m.detail}</p>
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Who can deposit?</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { v: false, t: "Only me", d: "Just the owner wallet can deposit." },
                    { v: true, t: "Anyone", d: "Any wallet can deposit and receive receipt shares. They can only redeem their own." },
                  ].map((o) => (
                    <button
                      key={o.t}
                      type="button"
                      onClick={() => setOpenDeposits(o.v)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        openDeposits === o.v ? "border-accent bg-accent/5" : "border-border-strong hover:border-muted-2"
                      }`}
                    >
                      <div className="text-sm font-semibold text-foreground">{o.t}</div>
                      <p className="mt-1 text-xs text-muted">{o.d}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Heading
                title="Configure risk parameters"
                body={`Starting values come from the ${purpose?.label ?? "selected"} preset. They are yours to change - Clarity enforces exactly what you sign, within the protocol's ceilings.`}
              />
              {limitsError && <p className="text-xs text-danger">{limitsError}</p>}
              {!limits && !limitsError && <p className="text-sm text-muted">Reading protocol limits from the chain...</p>}
              {limits && (
                <p className="text-xs text-muted">
                  Live protocol ceilings: per-strategy exposure ≤ {bpsToPct(limits.maxExposureBps)}%, slippage ≤{" "}
                  {bpsToPct(limits.maxSlippageBps)}%, idle liquidity ≥ {bpsToPct(limits.minLiquidityBps)}%.
                </p>
              )}
              <RiskFields values={values} onChange={setValues} errors={errors} showStx={mode !== 2} showSbtc={mode !== 1} />
            </>
          )}

          {step === 4 && (
            <>
              <Heading title="Autonomy" body="Choose who may submit execution intents. The AI never has custody either way." />
              <AutonomyChoice
                autonomous={values.autonomous}
                onChange={(v) => {
                  setValues({ ...values, autonomous: v });
                  if (!v) setAccepted(false);
                }}
                accepted={accepted}
                onAccept={setAccepted}
              />
            </>
          )}

          {step === 5 && parsed && (
            <>
              <Heading title="Review" body="This is exactly what will be written to the chain when you sign." />
              {!parsed.ok ? (
                <p className="text-sm text-danger">Some risk parameters are invalid. Go back to the Risk step to fix them.</p>
              ) : (
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <Review label="Vault name" value={trimmed} />
                  <Review label="Purpose" value={purpose?.label ?? "-"} />
                  <Review label="Assets" value={modeLabel(mode)} />
                  <Review label="Deposits" value={openDeposits ? "Anyone" : "Owner only"} />
                  <Review label="Max strategy exposure" value={`${bpsToPct(parsed.value.maxExposureBps)}% per strategy`} />
                  <Review label="Min idle liquidity" value={`${bpsToPct(parsed.value.minIdleBps)}%`} />
                  <Review label="Max slippage" value={`${bpsToPct(parsed.value.maxSlippageBps)}%`} />
                  <Review label="Execution cooldown" value={`${parsed.value.cooldownBlocks} blocks`} />
                  {mode !== 2 && <Review label="Max tx (STX)" value={formatAsset(parsed.value.maxStxTx, "STX")} />}
                  {mode !== 1 && <Review label="Max tx (sBTC)" value={formatAsset(parsed.value.maxSbtcTx, "SBTC")} />}
                  <Review label="Autonomy mode" value={parsed.value.autonomous ? "Autonomous (configured)" : "Manual approval"} />
                  <Review label="Network" value={`Stacks ${NETWORK === "testnet" ? "Testnet" : "Mainnet"}`} />
                </dl>
              )}
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted">
                Stacks Testnet: real testnet assets, no mainnet value. Autonomous strategy execution is disabled on Testnet
                regardless of the mode you choose.
              </div>
            </>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <Heading title={createdId ? "Treasury created" : "Creating your treasury"} body="One real transaction, signed by your wallet." />
              <TxProgress phase={tx.phase} txId={tx.txId} error={tx.error} />
              {createdId !== null && (
                <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
                  <div className="font-medium text-foreground">
                    {trimmed} is vault #{createdId} on-chain.
                  </div>
                  <p className="mt-1 text-xs text-muted">It is empty. Deposit real testnet assets to receive receipt shares.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/vault/${createdId}/deposit`}>
                      <Button>Make the first deposit</Button>
                    </Link>
                    <Link href={`/vault/${createdId}`}>
                      <Button variant="secondary">Open treasury</Button>
                    </Link>
                  </div>
                </div>
              )}
              {tx.phase === "failed" && (
                <Button variant="secondary" onClick={() => { tx.reset(); setStep(5); }}>
                  Back to review
                </Button>
              )}
            </div>
          )}

          {step < 6 && (
            <div className="flex items-center justify-between border-t border-border pt-5">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                Back
              </Button>
              {step < 5 ? (
                <Button onClick={next} disabled={!canNext}>
                  Continue
                </Button>
              ) : (
                <Button onClick={create} disabled={!parsed?.ok || !nameValid || purposeId === null || wrongNetwork}>
                  Create vault
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
