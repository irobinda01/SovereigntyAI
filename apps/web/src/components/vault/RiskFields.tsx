"use client";

import { bpsToPct, formatUnits, parseUnits, pctToBps } from "@/lib/amounts";
import type { ProtocolLimits, RiskConfig } from "@/lib/onchain";
import type { RiskDefaults } from "@/lib/presets";

export interface RiskFormValues {
  maxExposurePct: string;
  minIdlePct: string;
  maxSlippagePct: string;
  maxStxTx: string; // STX, decimal
  maxSbtcTx: string; // sBTC, decimal
  cooldown: string; // blocks, integer
  autonomous: boolean;
}

export interface ParsedRisk {
  maxExposureBps: number;
  minIdleBps: number;
  maxSlippageBps: number;
  maxStxTx: bigint;
  maxSbtcTx: bigint;
  cooldownBlocks: number;
  autonomous: boolean;
}

const plain = (v: bigint, decimals: number) => formatUnits(v, decimals).replace(/,/g, "");

export function valuesFromDefaults(d: RiskDefaults): RiskFormValues {
  return {
    maxExposurePct: bpsToPct(d.maxExposureBps),
    minIdlePct: bpsToPct(d.minIdleBps),
    maxSlippagePct: bpsToPct(d.maxSlippageBps),
    maxStxTx: plain(d.maxStxTx, 6),
    maxSbtcTx: plain(d.maxSbtcTx, 8),
    cooldown: String(d.cooldownBlocks),
    autonomous: d.autonomous,
  };
}

export function valuesFromConfig(r: RiskConfig): RiskFormValues {
  return {
    maxExposurePct: bpsToPct(r.maxExposureBps),
    minIdlePct: bpsToPct(r.minIdleBps),
    maxSlippagePct: bpsToPct(r.maxSlippageBps),
    maxStxTx: plain(r.maxStxTx, 6),
    maxSbtcTx: plain(r.maxSbtcTx, 8),
    cooldown: String(r.cooldownBlocks),
    autonomous: r.autonomousEnabled,
  };
}

export type RiskErrors = Partial<Record<keyof RiskFormValues, string>>;

/**
 * Exact parse + validation against the LIVE protocol ceilings (read from
 * risk-guard on-chain). The contract remains the enforcement point; this only
 * stops a doomed transaction from ever reaching the wallet.
 */
export function parseRisk(v: RiskFormValues, limits: ProtocolLimits): { ok: true; value: ParsedRisk } | { ok: false; errors: RiskErrors } {
  const errors: RiskErrors = {};
  const exposure = pctToBps(v.maxExposurePct);
  const idle = pctToBps(v.minIdlePct);
  const slippage = pctToBps(v.maxSlippagePct);
  const stx = parseUnits(v.maxStxTx, 6);
  const sbtc = parseUnits(v.maxSbtcTx, 8);
  const cooldown = /^\d+$/.test(v.cooldown.trim()) ? Number(v.cooldown.trim()) : null;

  if (exposure === null || exposure <= 0) errors.maxExposurePct = "Enter a percentage greater than 0 (max 2 decimals).";
  else if (exposure > limits.maxExposureBps) errors.maxExposurePct = `The protocol ceiling is ${bpsToPct(limits.maxExposureBps)}%.`;

  if (idle === null) errors.minIdlePct = "Enter a percentage (max 2 decimals).";
  else if (idle < limits.minLiquidityBps) errors.minIdlePct = `The protocol minimum is ${bpsToPct(limits.minLiquidityBps)}%.`;
  else if (idle > 10_000) errors.minIdlePct = "Cannot exceed 100%.";

  if (slippage === null || slippage <= 0) errors.maxSlippagePct = "Enter a percentage greater than 0 (max 2 decimals).";
  else if (slippage > limits.maxSlippageBps) errors.maxSlippagePct = `The protocol ceiling is ${bpsToPct(limits.maxSlippageBps)}%.`;

  if (stx === null || stx <= 0n) errors.maxStxTx = "Enter an amount greater than 0 (max 6 decimals).";
  if (sbtc === null || sbtc <= 0n) errors.maxSbtcTx = "Enter an amount greater than 0 (max 8 decimals).";

  if (cooldown === null) errors.cooldown = "Enter a whole number of blocks.";
  else if (cooldown < limits.minCooldownBlocks) errors.cooldown = `The protocol minimum is ${limits.minCooldownBlocks} block(s).`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      maxExposureBps: exposure!,
      minIdleBps: idle!,
      maxSlippageBps: slippage!,
      maxStxTx: stx!,
      maxSbtcTx: sbtc!,
      cooldownBlocks: cooldown!,
      autonomous: v.autonomous,
    },
  };
}

function Field({
  label,
  hint,
  value,
  onChange,
  error,
  suffix,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted">{label}</label>
      <div className="relative mt-1.5">
        <input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className={`font-tabular w-full rounded-lg border bg-surface-raised px-3 py-2 pr-16 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60 ${
            error ? "border-danger" : "border-border-strong"
          }`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{suffix}</span>
      </div>
      <p className={`mt-1 text-xs ${error ? "text-danger" : "text-muted"}`}>{error ?? hint}</p>
    </div>
  );
}

export function RiskFields({
  values,
  onChange,
  errors,
  disabled,
  showStx = true,
  showSbtc = true,
}: {
  values: RiskFormValues;
  onChange: (next: RiskFormValues) => void;
  errors: RiskErrors;
  disabled?: boolean;
  showStx?: boolean;
  showSbtc?: boolean;
}) {
  const set = <K extends keyof RiskFormValues>(k: K) => (v: RiskFormValues[K]) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="Maximum strategy exposure"
        hint="Largest share of the pool any ONE strategy may hold."
        suffix="% of pool"
        value={values.maxExposurePct}
        onChange={set("maxExposurePct")}
        error={errors.maxExposurePct}
        disabled={disabled}
      />
      <Field
        label="Minimum idle liquidity"
        hint="Share of the pool that must always stay idle (redeemable)."
        suffix="% of pool"
        value={values.minIdlePct}
        onChange={set("minIdlePct")}
        error={errors.minIdlePct}
        disabled={disabled}
      />
      <Field
        label="Maximum slippage"
        hint="Highest slippage an intent may request."
        suffix="%"
        value={values.maxSlippagePct}
        onChange={set("maxSlippagePct")}
        error={errors.maxSlippagePct}
        disabled={disabled}
      />
      <Field
        label="Execution cooldown"
        hint="Stacks blocks that must pass between executions."
        suffix="blocks"
        value={values.cooldown}
        onChange={set("cooldown")}
        error={errors.cooldown}
        disabled={disabled}
      />
      {showStx && (
        <Field
          label="Maximum transaction size (STX)"
          hint="Largest single STX movement an intent may make."
          suffix="STX"
          value={values.maxStxTx}
          onChange={set("maxStxTx")}
          error={errors.maxStxTx}
          disabled={disabled}
        />
      )}
      {showSbtc && (
        <Field
          label="Maximum transaction size (sBTC)"
          hint="Largest single sBTC movement an intent may make."
          suffix="sBTC"
          value={values.maxSbtcTx}
          onChange={set("maxSbtcTx")}
          error={errors.maxSbtcTx}
          disabled={disabled}
        />
      )}
    </div>
  );
}

export function AutonomyChoice({
  autonomous,
  onChange,
  disabled,
  accepted,
  onAccept,
}: {
  autonomous: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accepted: boolean;
  onAccept: (v: boolean) => void;
}) {
  const option = (value: boolean, title: string, body: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(value)}
      className={`rounded-xl border p-4 text-left transition-colors ${
        autonomous === value ? "border-accent bg-accent/5" : "border-border-strong hover:border-muted-2"
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs text-muted">{body}</p>
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {option(false, "Manual", "The AI recommends. Every execution intent must be signed by you.")}
        {option(true, "Autonomous", "The AI executor may submit intents on its own - but only inside your limits, and re-validated by Clarity.")}
      </div>
      {autonomous && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs text-muted">
          <p className="font-semibold uppercase tracking-wider text-warning">Autonomous mode</p>
          <p className="mt-2">
            The AI is authorized to prepare and evaluate execution intents within your configured limits. It cannot withdraw to
            arbitrary addresses, change your limits, access your keys, mint receipt shares, or call unapproved contracts.
          </p>
          <p className="mt-2 font-medium text-foreground">
            You are on Stacks Testnet: even with autonomous mode on, live autonomous strategy execution is disabled. Nothing will
            be moved between strategies - the AI can only analyse, recommend and validate.
          </p>
          <label className="mt-3 flex items-center gap-2 text-foreground">
            <input type="checkbox" checked={accepted} disabled={disabled} onChange={(e) => onAccept(e.target.checked)} />
            I understand.
          </label>
        </div>
      )}
    </div>
  );
}
