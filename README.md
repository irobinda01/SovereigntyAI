# SovereigntyAI

**AI decides. Clarity enforces. You retain custody.**

A non-custodial, AI-assisted autonomous sBTC treasury protocol on the Stacks
blockchain.

## Overview

SovereigntyAI lets a user deposit real testnet sBTC into a personal,
non-custodial vault, configure deterministic on-chain risk limits, and
optionally let an AI agent propose and execute bounded rebalances into
protocol-approved strategies. The AI never has unrestricted custody: every
recommendation it produces is a structured intent that Clarity contracts
independently re-validate against the user's own configured limits before
anything executes.

## Why SovereigntyAI

Autonomous DeFi agents are usually trusted with either full custody or a
hard-coded allowance that's hard to reason about. SovereigntyAI's answer is
architectural: the AI agent is a separate, off-chain service with no
privileged path to funds, and every one of its proposals passes through the
same deterministic Clarity checks a human-submitted transaction would.
"AI proposes, Clarity disposes" isn't a tagline here — it's the literal
shape of the call graph. See [`docs/architecture.md`](docs/architecture.md).

## Architecture

```
AI AGENT (off-chain)  ->  EXECUTION ENGINE  ->  RISK GUARD  ->  SOVEREIGNTY VAULT  ->  APPROVED STRATEGY
```

Full diagram, contract dependency graph, and design rationale in
[`docs/architecture.md`](docs/architecture.md).

## AI + Clarity Security Model

The AI can misjudge, misread, or simply be offline. What it cannot do:
steal funds, change its own permissions, change risk limits, call an
arbitrary contract, replay or extend an expired intent, or exceed any
configured exposure/slippage/liquidity bound — every one of those is
independently re-checked on-chain, not trusted from the caller. Full threat
model and a section-by-section answer to "can the AI do X" in
[`docs/security-model.md`](docs/security-model.md).

## MVP

This build implements: vault creation, deposit/withdraw of real testnet
sBTC, per-vault risk configuration, an AI agent that reads real on-chain
state and proposes bounded rebalances, a strategy registry, and full
Clarity-side enforcement — tested end-to-end including explicit rejection
paths (54 Clarinet/simnet tests + 12 agent unit tests, all passing).

**Explicitly not built in this MVP** (see
[`docs/future-roadmap.md`](docs/future-roadmap.md)): an automated
liquidation/health-guardian module, and an agentic (x402-style) payment
gateway.

## Supported Assets

**STX** (native) and **sBTC**, via the real, currently-deployed Stacks
Testnet contract `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`
(verified live — see [`docs/testnet.md`](docs/testnet.md)). The two are
tracked as completely independent balances, risk limits, and strategy
allocations within the same vault — an intent for one can never touch
the other's funds or be routed into a strategy registered for the other
asset (`ERR-ASSET-STRATEGY-MISMATCH`).

## Testnet

Network config, verified contract addresses, and current Stacks.js package
versions: [`docs/testnet.md`](docs/testnet.md).

## Smart Contracts

8 Clarity contracts, dependency graph, error code ranges, and key
invariants: [`docs/contracts.md`](docs/contracts.md).

| Contract | Deployed as | Responsibility |
|---|---|---|
| `sip-010-trait.clar` | `sip-010-trait-v4` | SIP-010 token trait |
| `strategy-trait.clar` | `strategy-trait-v4` | Strategy adapter interface |
| `protocol-admin.clar` | `sovereignty-protocol-admin-v4` | Admin identity, pause/unpause |
| `agent-registry.clar` | `agent-registry-v4` | Authorized AI executor identities |
| `strategy-registry.clar` | `strategy-registry-v6` | Registered/active strategies, per asset |
| `risk-guard.clar` | `risk-guard-v6` | Every numeric/authorization guardrail |
| `sovereignty-vault.clar` | `sovereignty-vault-v6` | Custody, deposit/withdraw, allocation — STX + sBTC |
| `execution-engine.clar` | `execution-engine-v6` | Single entry point for intents |

## AI Agent

Pipeline, honesty constraints (why the decision itself is deterministic
and rule-based rather than a black box), the optional Claude-powered
narration layer, and API reference: [`docs/ai-agent.md`](docs/ai-agent.md).

## Risk Guardrails

Per-vault: max exposure per strategy, max transaction size (set
independently per asset), max slippage, autonomous mode on/off, cooldown
between executions (exposure/slippage/cooldown/autonomous are shared
across STX and sBTC; only the transaction-size cap is asset-specific).
Protocol-wide: ceilings on all of the above plus a minimum-liquidity
floor and emergency pause. All enforced in `risk-guard.clar`, all
independently recomputed on-chain from real balances every time — never
trusted from the caller.

## Strategy Architecture

Adapter pattern via `strategy-trait.clar` + `strategy-registry.clar`.
Each strategy supports exactly one asset (STX or sBTC), and
`execution-engine.clar` enforces that an intent's asset matches its
destination strategy's own registered asset before anything executes.
The MVP ships with **zero pre-approved strategies for either asset** —
no third-party Stacks Testnet protocol with a verified, current
interface was confirmed available at build time, and the project does
not fake integrations. See [`docs/strategies.md`](docs/strategies.md).

## Installation

Prerequisites: Node.js 20+, [Clarinet](https://docs.hiro.so/clarinet) 3.x.

```bash
git clone <this-repo>
cd SovereigntyAI
npm install              # contracts + Clarinet test suite deps
cd agent && npm install && cd ..
cd apps/web && npm install && cd ../..
```

## Environment Variables

See [`.env.example`](.env.example) (reference), [`agent/.env.example`](agent/.env.example),
and [`apps/web/.env.example`](apps/web/.env.example) for the authoritative,
scoped lists. Nothing sensitive is ever exposed to the frontend — the AI
executor's private key lives only in `agent/.env`, server-side.

## Local Development

```bash
# 1. Contracts — check + full test suite (no network required beyond the
#    one-time real sbtc-token source fetch already recorded in Clarinet.toml)
npm run check
npm test

# 2. AI agent
cd agent
cp .env.example .env   # fill in DEPLOYER_ADDRESS once deployed
npm run dev             # http://localhost:4021

# 3. Frontend
cd apps/web
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

## Clarinet Tests

```
npm test
```

65 tests across 5 files covering every path in spec section 29 for both
supported assets: valid/invalid deposit, valid/unauthorized withdrawal,
unauthorized executor, invalid/replayed nonce, expired intent, excessive
amount/exposure/slippage, unauthorized/inactive strategy, asset/strategy
mismatch, paused protocol, invalid vault/asset/destination, cooldown
violation, and admin privilege boundaries — plus an explicit **security
demonstration** test: an AI-submitted intent exceeding the owner's
configured exposure limit is rejected on-chain (`tests/integration.test.ts`).

Deposit/withdraw tests exercise the **real, currently-deployed** sBTC token
contract's own logic inside Clarinet's simnet (pulled in via
`[[project.requirements]]` in `Clarinet.toml`), not a hand-written mock;
STX tests move simnet's native token directly.

## Testnet Deployment

Full runbook — generating a deployer wallet, funding it, running
`npm run deploy:testnet`, verifying, and the required post-deploy bootstrap
calls: [`docs/deployment.md`](docs/deployment.md).

## Real Testnet Walkthrough

**Deployed and live** — all 8 contracts are on Stacks Testnet under
`ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE`, bootstrapped (approved sBTC
asset set, a dedicated AI executor wallet funded and registered), and a
real vault created and funded. Full contract-by-contract addresses and
transaction ids: [`docs/deployment.md`](docs/deployment.md#current-live-deployment).

**Verified end-to-end with real funds**: a real vault was created, 2 real
testnet STX deposited into it (STX is native, so no peg-in needed), and
the agent confirmed reading that real balance and producing a real
Claude-narrated recommendation against live on-chain state.

Not yet done: no real sBTC has been deposited anywhere (requires an
actual Bitcoin-testnet peg-in, not a faucet — see
[`docs/testnet.md`](docs/testnet.md)), and no strategy is registered for
either asset (see [`docs/strategies.md`](docs/strategies.md)), so a full
deposit→rebalance→confirm cycle has only been exercised in the Clarinet
simnet suite so far, not on live Testnet. Step-by-step walkthrough for
completing that: [`docs/deployment.md`](docs/deployment.md#7-real-testnet-acceptance-walkthrough).

## Security Model

Full threat model (16 threats, impact, mitigation, residual risk) and a
direct answer to every question in the spec's final self-review:
[`docs/security-model.md`](docs/security-model.md).

## Limitations

- **Zero pre-approved strategies at MVP ship time** — idle capital stays
  idle until governance registers and activates a verified strategy. See
  [`docs/strategies.md`](docs/strategies.md).
- **No off-chain event indexer** — the frontend discovers "your vaults" via
  a per-browser localStorage hint (`apps/web/src/lib/localVaultIndex.ts`),
  re-verified against real on-chain ownership before display, not an
  indexed database. A vault id can always be opened directly at
  `/vault/[id]` regardless.
- **The AI's decision engine is deterministic/rule-based, not LLM-driven**
  — a deliberate choice given no verified real yield signal exists yet to
  reason about. See [`docs/ai-agent.md`](docs/ai-agent.md).
- **Not audited.** Testnet only. Do not deploy to Mainnet without an
  independent security audit.

## Future Roadmap

Two explicitly deferred modules — an automated risk/health guardian, and
an agentic (x402) payment gateway — are documented as architecture
placeholders only, with no code in this repository yet:
[`docs/future-roadmap.md`](docs/future-roadmap.md).

## Contributing

This is an MVP built to a fixed spec. Issues and PRs that improve test
coverage, fix a security-relevant defect, or add a real, verified strategy
integration (per `docs/strategies.md`'s process) are especially welcome.
Please do not add mock data, demo modes, or simulated transactions anywhere
in the codebase — see spec section 38.
