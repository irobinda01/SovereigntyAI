# Security Model

## Core guarantee

The AI agent can be wrong. It can misread data, propose something
unprofitable, or simply be unavailable. None of that can ever let it move
funds outside the bounds the protocol and the vault owner configured in
advance, because **every** numeric and authorization check in
`risk-guard.clar` and `execution-engine.clar` is re-derived from live
on-chain state at the moment of execution — nothing about the AI's own
confidence, reasoning, or output is trusted.

This is deterministic *enforcement*, not economic *correctness*. Clarity
does not know whether allocating into a given strategy is a good idea. It
only knows — and strictly enforces — whether that allocation stays inside
the caller's configured limits.

## Threat model

| # | Threat | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| 1 | Malicious/compromised AI agent (bad recommendation) | Could propose a bad but *in-limits* rebalance | Every recommendation must still pass `risk-guard.clar`'s independent checks; the agent has no privileged data path around them | User must still choose sane risk limits; the protocol can't protect against a legitimately-in-limits but poorly timed allocation into the sole approved strategy |
| 2 | Compromised executor private key | Attacker could submit intents as the AI executor | Bounded by `agent-registry` (can be instantly revoked by admin), by each vault's own exposure/tx/slippage/cooldown limits, and by autonomous mode being opt-in per vault | Vaults with autonomous mode on and generous limits are exposed until the admin revokes the key; funds can only ever move into the one admin-approved strategy, never to an arbitrary address |
| 3 | Prompt injection via on-chain/API data | Attacker-controlled strategy name/label text attempts to alter agent behavior | The decision (action/amount/destination) is always computed by the deterministic rule-based engine — no LLM is in that path. An optional LLM pass (`agent/src/analysis/llmNarrator.ts`) only rewrites narrative text when `ANTHROPIC_API_KEY` is configured; its system prompt explicitly instructs the model to treat all input data (including strategy names) as inert data, not instructions, and its output can only overwrite three text fields — never the decision, amount, destination, or any other enforceable field. All on-chain strings also pass through `sanitizeForDisplay` before being interpolated anywhere; see `agent/src/safety/untrustedData.ts` | A sufficiently adversarial strategy name could still influence the *tone* of the narration text shown to the user, since that text is model-generated; it cannot influence what the protocol does |
| 4 | Malicious/manipulated market data | Fabricated yield numbers could motivate a bad allocation | No external yield oracle is integrated in the MVP; the agent returns `INSUFFICIENT_DATA`/`HOLD` rather than inventing one | None in the MVP — the risk only exists once a real yield oracle is integrated, and that integration must itself be verified (see `docs/strategies.md`) |
| 5 | Oracle manipulation | N/A in MVP | No oracle is used | N/A |
| 6 | Replay attacks | Re-submitting an old, already-executed intent | Per-vault strictly-increasing nonce enforced in `risk-guard.clar`, checked before any state mutation | None known |
| 7 | Transaction duplication | Same intent submitted twice concurrently | Nonce check + Clarity's atomic execution model; the second submission fails the nonce check | None known |
| 8 | Strategy contract compromise | A registered strategy contract itself turns malicious after audit | `strategy-registry.clar` lets the admin deactivate a strategy instantly; the vault only ever calls the exact registered contract principal | Funds already allocated to a compromised strategy at the moment of compromise are exposed to whatever that contract's own withdraw path allows — this is unavoidable for any external strategy integration and is why the MVP ships with zero active strategies by default |
| 9 | Admin key compromise | Attacker gains protocol-admin control | Admin can pause, register/revoke executors and strategies, and change protocol ceilings — but **no admin function can withdraw, transfer, or redirect user funds**; two-step admin transfer prevents an accidental/malicious one-shot takeover | Attacker could pause the protocol (denial of service on new deposits/rebalances) or revoke legitimate strategies/executors; redemptions remain available throughout |
| 10 | User configuration errors | Owner sets overly permissive limits | Protocol-wide ceilings (`risk-guard` `protocol-max-*`) bound every vault regardless of owner choice | Owner can still authorize more risk than is prudent within those ceilings — this is the owner's own custody decision |
| 11 | Slippage | Execution price differs from expected | `max-slippage-bps` is enforced on-chain per intent; real execution against a strategy is bounded by that strategy contract's own logic (none active in MVP) | Slippage enforcement is only as good as the strategy contract itself honoring the parameter — another reason strategies require verification before activation |
| 12 | Liquidity failure | Vault could be fully drained of idle funds by repeated rebalances | `protocol-min-liquidity-bps` floor enforced in every `validate-and-record-intent` call | Floor is a protocol-wide default; if set to 0 by governance, this protection is removed — visible on-chain via `get-protocol-limits` |
| 13 | Protocol downtime | Stacks API / agent service unavailable | Vault contracts function independently of the agent; every holder can always call `sovereignty-vault.redeem-stx` / `redeem-sbtc` directly through any wallet | Autonomous execution pauses if the agent is down; this is a deliberate fail-closed behavior, not a fail-open one |
| 14 | Stale data | Agent acts on outdated balances/config | Every agent read happens immediately before building an intent, and Clarity re-reads live state at execution time regardless of what the agent saw | A large gap between agent read and transaction confirmation could theoretically change context; the deadline field bounds this window |
| 15 | Frontend compromise | Malicious JS tricks a user into signing something unintended | The frontend never holds or requests private keys; wallet extensions (Leather, Xverse, etc.) show the real transaction contents for the user to review before signing | Standard web-supply-chain risk applies to any dApp; users should verify transaction details in their wallet, not just the frontend's UI |
| 16 | API compromise | Hiro/Stacks API returns manipulated data | Balances/config shown are best-effort; on-chain execution is the final source of truth regardless of what any API told the frontend or agent beforehand | A compromised API could mislead the agent into a bad-but-still-in-limits recommendation; it cannot cause Clarity to accept an out-of-limits execution |

## What the admin role can never do

Enumerated explicitly because it is the load-bearing claim of "non-custodial":

- Cannot call `redeem-stx` / `redeem-sbtc` or `deposit-*` on another principal's behalf, and cannot mint or burn receipt shares.
- Cannot move funds out of any vault.
- Cannot change a vault's own risk configuration (only the vault owner can, via `sovereignty-vault.set-risk-config`).
- Cannot bypass `risk-guard`'s numeric checks for any intent.
- Can pause new deposits/rebalances protocol-wide, but redemptions remain available at all times.

## What the AI executor role can never do

- Cannot register or revoke itself, or any other executor (`agent-registry.clar` restricts this to the admin).
- Cannot change any vault's risk configuration.
- Cannot change protocol-wide risk ceilings.
- Cannot call any contract other than the one contract, function pair the vault itself verifies against `strategy-registry`.
- Cannot execute for a vault that has not explicitly enabled autonomous mode.
- Cannot exceed that vault's own exposure, transaction size, or slippage limits — enforced independently by `risk-guard.clar` on every call.

## Final self-review (spec section 58)

| Question | Answer |
|---|---|
| Can the AI steal funds? | No — it can only trigger `execute-rebalance` into the one registry-verified strategy contract, never a transfer to an arbitrary address. |
| Can the AI change its own permissions? | No — only `protocol-admin` can call `agent-registry.register-executor`/`revoke-executor`. |
| Can the AI change risk limits? | No — `risk-guard.set-vault-risk-config` only accepts calls from `sovereignty-vault.clar`, which only accepts calls from the vault owner. |
| Can the AI call arbitrary contracts? | No — `sovereignty-vault.execute-rebalance` verifies the supplied strategy contract against `strategy-registry` before calling it. |
| Can the AI replay an old intent? | No — strictly-increasing per-vault nonce, checked on-chain. |
| Can the AI execute an expired intent? | No — `deadline` is checked against `stacks-block-height` on-chain. |
| Can the AI exceed maximum exposure? | No — recomputed from real balances on every call, capped by both the vault's own limit and the protocol-wide ceiling. |
| Can the AI bypass slippage limits? | No — checked on-chain against the vault's configured maximum. |
| Can the admin directly withdraw user funds? | No — no admin function touches vault balances. |
| Can a malicious strategy drain the vault? | Only up to whatever was already allocated to it — which is why the MVP ships with zero active strategies until one is independently verified. |
| Can malicious external data manipulate the AI? | The decision itself is always computed by the deterministic rule-based engine, not an LLM. An optional LLM narration pass can be influenced in tone but is structurally unable to change the decision, amount, or any enforceable field; see threat #3. |
| Can a frontend compromise steal user keys? | The frontend never has access to a user's private key — wallet software mediates all signing. |
| Can duplicate transactions cause double execution? | No — nonce enforcement + Clarity's atomic transaction model. |
