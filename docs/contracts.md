# Smart Contracts

All contracts live in `contracts/`, are written for Clarity 3, and are covered by the suite in `tests/`
(122 Clarinet/simnet tests, run with `npm test`). See [vault-architecture.md](./vault-architecture.md) for the design.

Application code never hardcodes versioned names: `DEPLOYED_CONTRACT_NAMES` in `agent/src/config.ts` and
`apps/web/src/lib/config.ts` maps stable logical names to deployed names.

| Contract (logical) | Deployed as | Responsibility |
|---|---|---|
| `sip-010-trait` | `sip-010-trait-v4` | SIP-010 trait (structurally matches the real Testnet sBTC) |
| `strategy-trait` | `strategy-trait-v4` | Strategy adapter interface |
| `protocol-admin` | `sovereignty-protocol-admin-v4` | Admin (two-step transfer), protocol pause |
| `agent-registry` | `agent-registry-v4` | Authorized AI executors |
| `strategy-registry` | `strategy-registry-v6` | Approved strategies (zero registered) |
| `receipt-token` | `receipt-token-v7` | Receipt shares per (vault, asset, holder); mint/burn vault-only; non-transferable |
| `risk-guard` | `risk-guard-v7` | Per-vault risk config, pure `check-intent`, execution gate |
| `sovereignty-vault` | `sovereignty-vault-v7` | Multi-vault ownership, pools, deposits, redemption, indexes, pause |
| `execution-engine` | `execution-engine-v7` | Intent routing, read-only `evaluate-rebalance-intent`, gate |

## Public interface (v7)

**sovereignty-vault-v7** - `create-vault(name purpose assets open-deposits max-exposure-bps max-stx-tx max-sbtc-tx max-slippage-bps min-idle-bps autonomous cooldown)`,
`set-vault-config`, `set-risk-config`, `set-autonomous-mode`, `pause-vault`, `unpause-vault`,
`deposit-stx`, `deposit-sbtc`, `redeem-stx`, `redeem-sbtc`, `execute-rebalance` (engine-only, gated).
Reads: `get-vault`, `get-vault-owner`, `get-vault-count`, `get-owner-vault-count/id`, `get-holder-vault-count/id`,
`get-pool`, `get-position`, `get-share-balance`, `get-share-supply`, `get-idle-balance`, `get-total-balance`,
`get-strategy-allocation`, `preview-deposit`, `preview-redeem`, `supports-asset`, `is-vault-paused`.

**receipt-token-v7** - `mint`, `burn` (vault-only), `transfer` (always `u704`); reads `get-balance`, `get-total-supply`, `get-decimals`, `is-transferable`.

**risk-guard-v7** - `check-intent` (read-only pure validation), `validate-and-record-intent` (engine-only), `get-execution-environment`,
`is-strategy-execution-enabled`, `set-mainnet-execution-armed` (admin, mainnet only), `get-vault-config`, `get-protocol-limits`,
`set-protocol-limits`, `set-approved-sbtc-asset`.

**execution-engine-v7** - `evaluate-rebalance-intent` (read-only), `submit-rebalance-intent` (always `u208` on Testnet).

## Error codes

| Range | Contract |
|---|---|
| 100-199 | `sovereignty-vault-v7` (111 asset unsupported, 112 vault paused, 113 deposits restricted, 114 below min first deposit, 115 zero shares, 116 insolvent pool, 117 insufficient shares, 118 zero redemption, 124 testnet) |
| 200-299 | `execution-engine-v7` (206 vault paused, 207 asset unsupported, 208 testnet execution disabled) |
| 300-399 | `risk-guard-v7` (320 testnet execution disabled, 321 mainnet only) |
| 400-499 | `strategy-registry-v6` |
| 500-599 | `agent-registry-v4` |
| 600-699 | `sovereignty-protocol-admin-v4` |
| 700-799 | `receipt-token-v7` (700 not vault, 704 non-transferable) |

Human-readable mapping: `apps/web/src/lib/errors.ts`.

## Key invariants

- **Vault → strategy calls are never arbitrary.** `execute-rebalance`
  verifies the caller-supplied `<strategy-trait>` contract principal
  against `strategy-registry.get-strategy-contract` before invoking it.
- **`risk-guard` never calls back into `sovereignty-vault`.** This keeps
  the contract dependency graph acyclic (a Clarity requirement) while
  still giving `risk-guard` sole, tamper-proof ownership of each vault's
  risk configuration — see `docs/architecture.md`.
- **Redemptions bypass every pause.** `redeem-stx`/`redeem-sbtc`
  do not check `protocol-admin.is-paused` — pausing can stop new
  deposits and new strategy allocations, never a user's own exit.
- **Every guardrail number is recomputed on-chain**, not trusted from the
  execution engine or the AI agent. `risk-guard.validate-and-record-intent`
  takes raw balances/allocations as arguments and independently derives
  every bps calculation itself.
- **The IDLE "strategy" (`u0`) needs no registration** and is always
  considered active — it represents funds simply sitting in the vault.

## Real sBTC dependency

`Clarinet.toml` declares a `[[project.requirements]]` entry pulling the
**real, currently-deployed** sBTC token contract source directly from
Stacks Testnet:

```
SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token
```

verified live via `npm run inspect -- SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token testnet`.
This means every deposit/withdraw test in `tests/sovereignty-vault.test.ts`
and `tests/integration.test.ts` exercises the actual testnet contract's
`transfer`/`get-balance` logic in simnet — not a hand-written mock token.

## Test-only fixtures

`tests/mocks/mock-strategy.clar` implements `strategy-trait.clar` purely
so the test suite can exercise the full
`execution-engine -> risk-guard -> vault -> strategy` call path. It is
**not** part of `Clarinet.toml`, is never deployed by
`scripts/deploy-testnet.ts`, and must never be presented in the frontend
as a real, available strategy. See its header comment.
