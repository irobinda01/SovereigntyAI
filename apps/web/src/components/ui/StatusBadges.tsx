import { Badge } from "./Badge";
import type { IntentStatus, ExecutionState } from "@/lib/agent";

type Tone = "neutral" | "accent" | "enforce" | "success" | "danger" | "warning";

const STATUS: Record<IntentStatus, { tone: Tone; label: string }> = {
  RECOMMENDED: { tone: "accent", label: "Recommended" },
  VALIDATING: { tone: "warning", label: "Validating" },
  VALIDATED: { tone: "enforce", label: "Validated" },
  TESTNET_BLOCKED: { tone: "warning", label: "Testnet blocked" },
  EXECUTED: { tone: "success", label: "Executed" },
  FAILED: { tone: "danger", label: "Failed" },
  EXPIRED: { tone: "neutral", label: "Expired" },
  REJECTED: { tone: "danger", label: "Rejected" },
};

export function IntentStatusBadge({ status }: { status: IntentStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const EXECUTION: Record<ExecutionState, { tone: Tone; label: string }> = {
  NOT_APPLICABLE: { tone: "neutral", label: "Nothing to execute" },
  NOT_EXECUTED_TESTNET: { tone: "warning", label: "Not executed - Testnet" },
  NOT_SUBMITTED: { tone: "neutral", label: "Not submitted" },
  SUBMITTED: { tone: "enforce", label: "Submitted" },
  CONFIRMED: { tone: "success", label: "Confirmed" },
  FAILED: { tone: "danger", label: "Failed" },
};

export function ExecutionBadge({ state }: { state: ExecutionState }) {
  const s = EXECUTION[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function OffChainTag() {
  return (
    <span
      title="Produced by the off-chain AI agent. It is a record of analysis, not a blockchain event."
      className="inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted"
    >
      Off-chain AI event
    </span>
  );
}

export function OnChainTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-enforce/30 bg-enforce/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-enforce">
      On-chain
    </span>
  );
}
