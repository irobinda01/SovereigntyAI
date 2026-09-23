# AI Agent

The agent (`agent/`) is a standalone TypeScript/Node service. It has no
special powers over user funds beyond being an *optionally* authorized
executor principal — see [security-model.md](./security-model.md).

## Pipeline

```
data/          real on-chain reads (balances, risk config, registry state)
  -> analysis/   deterministic recommendation (REBALANCE | HOLD | INSUFFICIENT_DATA)
       + optional LLM narration pass (see below) -- text only, never numbers
    -> intents/    typed, nonce'd, deadline'd ExecutionIntent (no chain writes)
      -> execution/  sign + broadcast with the executor's own Testnet key
        -> monitoring/  poll the real API until the tx confirms or fails
```

Every stage is a separate module specifically so "what data did we use"
and "what did we decide" and "did we actually execute" stay independently
inspectable — see `agent/src/pipeline.ts` for how they're wired together.

## Why the MVP's "AI" is rule-based, not LLM-based

The spec is explicit: never invent yield data, never invent balances,
never invent a "the AI recommends this because market conditions X"
narrative that isn't backed by a real signal. At MVP build time, no
audited third-party Stacks Testnet yield strategy with a verifiable,
current sBTC-compatible interface was available to integrate (see
[strategies.md](./strategies.md)). Without a real yield signal, an LLM
asked "which strategy is best" would have nothing truthful to reason
about — so `agent/src/analysis/decisionEngine.ts` is a deterministic
function: it reads real balances and real risk-guard limits and proposes
a bounded, rule-based allocation of idle capital into the (currently
zero-or-one) protocol-approved strategy, or `HOLD`/`INSUFFICIENT_DATA`
when there's nothing safe to propose. Every number in its output reason
string is one it just read from chain, not a estimate.

This keeps "AI decides" true without dressing up a placeholder as
intelligence. When a real, verified strategy with a genuine yield signal
is integrated, `decisionEngine.ts` is the only file that needs to grow a
comparison step — the rest of the pipeline (intent construction,
Clarity-side enforcement, execution) does not change.

## Optional LLM narration layer

`agent/src/analysis/llmNarrator.ts` calls Claude (`claude-haiku-4-5-20251001`)
when `ANTHROPIC_API_KEY` is set, to rewrite a recommendation's `reason`,
`expectedBenefit`, and `riskAssessment` strings in clearer language. It is
deliberately narrow:

- The model is given the deterministic engine's already-final decision,
  amount, and real on-chain numbers, and told explicitly that it cannot
  change any of them — only phrase them.
- Its response is parsed as JSON containing exactly those three string
  fields; `decision`, `destStrategyId`, `amount`, `maxSlippageBps`,
  `deadline`, and `confidence` are copied through from the deterministic
  result untouched, never read from the model's output.
- Any on-chain string interpolated into the prompt (e.g. a strategy's
  `name`) is treated as inert data in the prompt itself — see
  `docs/security-model.md` threat #3.
- On any error, timeout (8s), or a response that doesn't parse as the
  expected JSON shape, it silently falls back to the deterministic text.
  Without an API key configured, this function is a no-op passthrough.

This is why the "AI feature" can be both genuinely LLM-powered (when
configured) and impossible for the model to use to move funds out of
bounds — the two concerns are handled by entirely separate code paths
that never share write access to the same fields.

## Confidence score

`Recommendation.confidence` is purely informational, surfaced to the UI
so a user can see how mechanical vs. judgment-based a given
recommendation was (e.g. `1.0` for a deterministic on-chain fact like "no
active strategy exists" vs. `0.6` for the bounded-allocation case). It is
never read by any Clarity contract and never gates whether an intent is
built or submitted — see `docs/security-model.md` threat model and the
explicit non-use of confidence anywhere in `pipeline.ts`.

## `INSUFFICIENT_DATA` policy

If a required fact can't be established from a real source —
`agent/src/data/*.ts` throws rather than returning a default. Callers
(the pipeline, the API layer) surface that as an error/HOLD rather than
proceeding with a guess. There is no fallback branch anywhere in the
codebase that substitutes a placeholder value for missing on-chain data.

## Ecosystem Explorer (`analysis/strategyAnalysis.ts`)

Separate from the vault-scoped decision engine above, the agent also
powers a "Strategy Explorer" surfaced on the frontend's home page: a
curated list of real Stacks **Mainnet** DeFi protocols
(`data/ecosystemProtocols.ts`) that a user can click to get an
AI-assisted analysis. This is purely informational — SovereigntyAI vaults
run on Testnet and have no ability to allocate funds into any Mainnet
contract, and the UI says so explicitly.

Every protocol's `mainnetContract` was verified live against
`https://api.hiro.so` before being added to the list, and `analyzeProtocol`
re-verifies liveness on every request rather than trusting the static
list to stay accurate. It also fetches a real, current STX price
(CoinGecko, no API key required). The only numbers ever presented as
"current" are these two live-checked facts — never a protocol-specific
TVL, APY, or yield figure, since none is independently verified. The
system prompt explicitly forbids the model from stating such a number,
and a second, code-level check (`noHallucinatedDomains`) rejects any
model response that names a website other than the protocol's own real,
verified one — defense in depth against the model volunteering a
plausible-but-wrong domain from its own training data, which was observed
happening once during testing (`zest.org` instead of the protocol's real
site) before this guard was added.

## Prompt-injection defense

See `agent/src/safety/untrustedData.ts` and
[security-model.md](./security-model.md) threat #3. In short: the MVP
sends no on-chain/API text to an LLM, so there is no prompt to inject
into; any on-chain string that *is* displayed (e.g. a strategy's `name`)
is passed through `sanitizeForDisplay` first, and none of it can change
what the agent actually does — that's governed entirely by the
deterministic code paths in `decisionEngine.ts` and `submitIntent.ts`.

## Running it

```bash
cd agent
cp .env.example .env   # fill in DEPLOYER_ADDRESS, optionally EXECUTOR_PRIVATE_KEY
npm install
npm run dev
```

`GET /api/health` reports whether an executor key is configured. Without
one, the agent can still serve `/api/vaults/:id/recommendation` (pure
read + analysis) but `/api/vaults/:id/execute` will reject with a clear
"not configured" error rather than silently doing nothing.

## Endpoints

| Method | Path | Effect |
|---|---|---|
| GET | `/api/health` | Liveness + config summary (no secrets) |
| GET | `/api/protocol-context` | Real block height, pause state, active strategies |
| GET | `/api/vaults/:id` | Real vault balances + risk config |
| POST | `/api/vaults/:id/recommendation` | Analysis only — never signs or broadcasts |
| POST | `/api/vaults/:id/execute` | Full pipeline — may broadcast a real transaction |
| GET | `/api/vaults/:id/decisions` | This agent's own decision log for one vault |
| GET | `/api/decisions` | Full decision log |
| GET | `/api/ecosystem/strategies` | Curated real Mainnet protocols + live contract verification |
| GET | `/api/ecosystem/stx-price` | Real-time STX price (CoinGecko) |
| POST | `/api/ecosystem/strategies/:id/analyze` | AI analysis of one protocol — read-only, informational |

## Running the analysis without the standalone agent

The web app's server routes run this same pipeline **in-process** (`apps/web/src/lib/server/agentCore.ts` loads `agent/src`), so
"Run AI analysis" and the recommendation history work with only the web app running:

| Route | Purpose |
|---|---|
| `POST /api/vaults/:id/recommendation?asset=STX|SBTC` | recommendation -> intent -> on-chain read-only validation -> gate (never signs) |
| `GET /api/vaults/:id/decisions`, `GET /api/decisions` | the agent's off-chain decision log |

Configuration is bridged from the web app's `NEXT_PUBLIC_*` settings plus, optionally, `agent/.env` (`ANTHROPIC_API_KEY` for Claude wording;
`EXECUTOR_ADDRESS`, or an address derived from `EXECUTOR_PRIVATE_KEY`, used only to evaluate intents as the executor). The private key itself is never
loaded into the web process. The standalone agent (`agent/`, port 4021) is still used by the chat widget and the AI protocol analysis, and both
processes share `agent/data/decisions.json`. The agent's relative imports are extensionless (bundler resolution) so the web bundler can load them.
