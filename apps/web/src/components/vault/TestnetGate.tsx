import type { ExecutionEnvironment, RiskConfig } from "@/lib/onchain";
import type { DecisionRecord } from "@/lib/agent";
import { explainClarityError } from "@/lib/errors";

// The testnet execution gate, explained. This is an INTENTIONAL SAFETY STATE,
// never an error - so it uses the neutral/enforce palette and calm wording,
// not the danger palette. The `environment` values come from risk-guard-v7 on
// chain; the UI never decides on its own that execution is (or is not) allowed.

export const TESTNET_REASON =
  "SovereigntyAI is currently operating on Stacks Testnet using testnet assets. Autonomous strategy execution is disabled for the current testnet environment.";

export function TestnetExecutionBanner({ environment }: { environment: ExecutionEnvironment }) {
  if (environment.strategyExecutionEnabled) return null;
  const testnet = environment.network === "TESTNET";
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">
        {testnet ? "Autonomous execution disabled on Testnet" : "Strategy execution not armed"}
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">Reallocation cannot be executed yet.</p>
      <p className="mt-1 text-sm text-muted">
        {testnet
          ? TESTNET_REASON
          : "Strategy execution has not been armed by protocol governance on this network, so no strategy transaction can be submitted."}
      </p>
      <p className="mt-3 text-xs text-muted">
        This is an intentional safety state, not an error. Your assets remain in their current vault allocation and no
        strategy transaction is ever submitted.
      </p>
    </div>
  );
}

export function AutonomousModeNotice({ risk, environment }: { risk: RiskConfig; environment: ExecutionEnvironment }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Autonomous mode</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{risk.autonomousEnabled ? "Configured" : "Off - manual approval"}</div>
      {risk.autonomousEnabled ? (
        <p className="mt-2 text-sm text-muted">
          The AI is authorized to prepare and evaluate execution intents within your configured limits.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Every execution intent must be signed by you. The AI can still analyse and recommend.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted">Current network</dt>
          <dd className="mt-0.5 font-medium text-foreground">Stacks {environment.network === "TESTNET" ? "Testnet" : "Mainnet"}</dd>
        </div>
        <div>
          <dt className="text-muted">Live autonomous strategy execution</dt>
          <dd className={`mt-0.5 font-medium ${environment.strategyExecutionEnabled ? "text-success" : "text-warning"}`}>
            {environment.strategyExecutionEnabled ? "Enabled" : "Disabled"}
          </dd>
        </div>
      </dl>
      {!environment.strategyExecutionEnabled && (
        <p className="mt-3 text-xs text-muted">
          {risk.autonomousEnabled
            ? "Autonomous mode is configured, but live autonomous strategy execution is disabled on Testnet. "
            : ""}
          Reason: {environment.network === "TESTNET" ? "Testnet safety restriction." : "not armed by governance."}
        </p>
      )}
    </div>
  );
}

type RowState = "ok" | "warn" | "fail" | "na";

function Row({ state, children }: { state: RowState; children: React.ReactNode }) {
  const icon = state === "ok" ? "✓" : state === "warn" ? "⚠" : state === "fail" ? "✕" : "–";
  const color =
    state === "ok" ? "text-success" : state === "warn" ? "text-warning" : state === "fail" ? "text-danger" : "text-muted-2";
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className={`mt-px w-4 shrink-0 text-center font-semibold ${color}`} aria-hidden>
        {icon}
      </span>
      <span className="text-foreground">{children}</span>
    </li>
  );
}

/** The step-by-step outcome of one recommendation, derived only from what the record actually contains. */
export function ExecutionStatusChecklist({ record, environment }: { record: DecisionRecord; environment: ExecutionEnvironment }) {
  const v = record.validation;
  const evaluated = v !== null && v.status !== "UNAVAILABLE";
  const passed = v?.status === "PASSED";
  const gateBlocked = !environment.strategyExecutionEnabled;
  const executed = record.execution.state === "CONFIRMED";

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">AI recommendation</div>
      <ul className="mt-3 grid gap-2">
        <Row state="ok">Live data analyzed</Row>
        <Row state="ok">Recommendation generated</Row>
        <Row state={evaluated ? "ok" : "warn"}>{evaluated ? "Vault limits evaluated" : "Vault limits could not be evaluated"}</Row>
        <Row state={!v ? "na" : passed ? "ok" : v.status === "FAILED" ? "fail" : "warn"}>
          {!v
            ? "Risk parameters not evaluated (nothing to validate)"
            : passed
              ? "Risk parameters checked"
              : v.status === "FAILED"
                ? `Risk parameters rejected the intent${v.errorCode !== undefined ? ` - ${explainClarityError(v.errorCode)}` : ""}`
                : "Risk parameters could not be checked"}
        </Row>
        <Row state={record.intent ? "ok" : "na"}>{record.intent ? "Execution intent generated" : "No execution intent (no executable action)"}</Row>
        {record.intent && gateBlocked && <Row state="warn">Testnet execution restricted</Row>}
        {record.intent && (
          <Row state={executed ? "ok" : "fail"}>{executed ? "Strategy reallocation executed" : "Strategy reallocation not executed"}</Row>
        )}
      </ul>
      {record.intent && !executed && (
        <p className="mt-3 text-sm font-medium text-foreground">Your assets remain in their current vault allocation.</p>
      )}
    </div>
  );
}
