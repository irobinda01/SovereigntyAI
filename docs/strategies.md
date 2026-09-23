# Strategies

## Model

Every vault's funds, for either supported asset (STX or sBTC), are either:

- **IDLE** (strategy id `u0`) — sitting in the vault, not deployed anywhere, always valid, needs no registration; or
- allocated to a **registered, active entry** in `strategy-registry.clar` whose own recorded asset matches.

`execution-engine.clar` will not route funds to any strategy id that
isn't both registered and explicitly activated by the protocol admin,
and additionally rejects any intent whose asset doesn't match that
strategy's own registered asset (`ERR-ASSET-STRATEGY-MISMATCH`) — an STX
intent can never be routed into an sBTC-only strategy or vice versa.

## MVP status: zero active strategies

As of this MVP's build, **no third-party Stacks Testnet DeFi protocol
with a verified, current contract interface was confirmed available**
for either STX or sBTC within the scope of this build. Per the project's
explicit rule (never fake an integration that doesn't exist),
`strategy-registry.clar` ships with **zero** registered strategies.

This means, honestly and by design, that on a fresh deployment:

- The `/strategies` page will show "No live strategies are currently
  available on this network" rather than any placeholder cards.
- The AI agent's decision engine will consistently return `HOLD` with the
  reason "No STX/sBTC strategy is currently registered and active" for
  any vault with idle funds in that asset.
- `execute-rebalance` cannot succeed against any real destination until
  governance registers and activates one for that specific asset.

## How a real strategy gets added (deliberately manual)

1. Verify the candidate protocol's contract is a real, current Stacks
   Testnet deployment (`npm run inspect -- <contract-id> testnet`) — not
   a mainnet address, not an old tutorial address.
2. Confirm it exposes (or can be wrapped to expose) `strategy-trait.clar`'s
   interface: `deposit(uint)`, `withdraw(uint)`, `get-strategy-balance(principal)`.
3. Protocol admin calls `strategy-registry.register-strategy` with the
   strategy's asset explicitly tagged `"STX"` or `"SBTC"` (registers
   inactive by default) and then `strategy-registry.activate-strategy` —
   two separate, auditable on-chain transactions.
4. For sBTC strategies, `risk-guard.set-approved-sbtc-asset` already
   constrains the accepted sBTC contract. STX needs no equivalent
   configuration — it's native and always accepted.

This is intentionally not automatable by the AI agent or by any single
admin transaction — registering a strategy is a governance decision with
real fund-safety consequences, not a config toggle.

## Test-only fixture

`tests/mocks/mock-strategy.clar` exists solely to exercise the full
on-chain call path in the Clarinet test suite. It performs no yield
generation, is never part of `Clarinet.toml`, is never deployed to
Testnet, and must never appear in the frontend's strategy list. See
`docs/contracts.md` "Test-only fixtures".
