# Architecture

## Core principle

**AI proposes. Clarity disposes.**

```
                OFF-CHAIN
        +---------------------+
        |      AI AGENT       |
        |                     |
        | Analyze real state  |
        | Recommend           |
        | Build intent        |
        +----------+----------+
                   |
                   | structured, typed intent
                   v
        +---------------------+
        |  EXECUTION ENGINE   |   <- authorization + routing only
        |   (execution-engine.clar)
        +----------+----------+
                   |
                   v
        +---------------------+
        |     RISK GUARD      |   <- ALL numeric guardrails, independently
        |   (risk-guard.clar) |      recomputed from on-chain state
        +----------+----------+
                   |
                   | APPROVED
                   v
        +---------------------+
        |  SOVEREIGNTY VAULT  |   <- holds real STX + sBTC, non-custodial
        | (sovereignty-vault.clar)
        +----------+----------+
                   |
                   v
           APPROVED STRATEGY
     (strategy-registry.clar entry,
      zero registered by default)
```

The AI agent is a completely separate, off-chain TypeScript service
(`agent/`). It has no special on-chain privileges beyond being an
*optionally* authorized executor principal in `agent-registry.clar` — a
role the protocol admin grants and can revoke at any time, and which is
itself bounded by every check in `risk-guard.clar`. If the agent's key is
compromised, the blast radius is exactly "whatever an authorized executor
can do to vaults that opted into autonomous mode," which is itself capped
by each vault owner's own configured limits — never arbitrary fund
movement, never an ability to change limits, never a transfer to an
arbitrary address.

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Data collection | `agent/src/data/` | Read real on-chain state (balances, config, registry entries) via the Stacks API. Never fabricates a value. |
| Analysis | `agent/src/analysis/` | Deterministic, rule-based recommendation from real state. Returns `INSUFFICIENT_DATA` rather than guessing. |
| Intent construction | `agent/src/intents/` | Assembles a typed, nonce'd, deadline'd intent. No chain writes. |
| Execution | `agent/src/execution/` | Signs and broadcasts with the executor's own Testnet-only key. |
| Authorization | `agent-registry.clar` | Is this principal allowed to submit intents at all? Admin-controlled only. |
| Routing | `execution-engine.clar` | Single entry point; sequences the checks below; contains no numeric guardrail logic itself. |
| Destination validation | `strategy-registry.clar` | Is the target strategy registered and active? |
| Guardrails | `risk-guard.clar` | Amount, exposure, slippage, nonce, deadline, cooldown, pause, liquidity — recomputed from real numbers, not trusted from the caller. |
| Custody | `sovereignty-vault.clar` | Holds real STX and sBTC as fully independent balances. Only calls the exact strategy contract recorded in the registry, for the exact asset that strategy is registered for. Withdrawals are owner-only and never blocked by protocol pause. |
| Governance | `protocol-admin.clar` | Pause/unpause, two-step admin transfer. No function here can move user funds. |

## Contract dependency graph

Clarity contracts cannot reference each other cyclically (a contract must
exist before another contract's source can reference it via `.name`), so
the dependency order is a strict DAG:

```
protocol-admin
  |-- agent-registry
  |-- strategy-registry
  |-- risk-guard
        |-- sovereignty-vault (+ sip-010-trait, strategy-trait, strategy-registry)
              |-- execution-engine (+ agent-registry, strategy-registry, risk-guard, strategy-trait)
```

`risk-guard.clar` never calls back into `sovereignty-vault.clar` — vault
ownership for risk-config mutations is instead enforced by restricting
`risk-guard`'s config-mutating functions to `contract-caller == .sovereignty-vault`,
with the vault itself checking `tx-sender == owner` before ever making that
call. This one-directional design is what keeps the whole graph acyclic
while still giving `risk-guard` an authoritative, tamper-proof link
between a vault and its risk configuration.

## Why the vault can't be tricked into calling an arbitrary contract

`execution-engine.submit-rebalance-intent` takes a `<strategy-trait>`
contract reference as an argument — supplied by whoever calls it. That
alone would let an attacker pass in a malicious contract implementing the
trait. `sovereignty-vault.execute-rebalance` closes this hole: before
ever invoking the supplied trait reference, it looks up
`strategy-registry.get-strategy-contract(dest-strategy-id)` and asserts
the supplied contract's principal is byte-for-byte identical to the
registered one. A mismatch aborts the entire transaction
(`ERR-STRATEGY-CONTRACT-MISMATCH`). See
`tests/integration.test.ts` → "the vault refuses to call a strategy
contract that does not match the strategy-registry entry".

## MVP scope boundary

This repository implements only what's described above. Two explicitly
out-of-scope modules — an automated liquidation/health guardian, and an
agentic (x402-style) payment gateway — are documented as future
extensions in [future-roadmap.md](./future-roadmap.md) and are not
present anywhere in the current contracts or agent code.
