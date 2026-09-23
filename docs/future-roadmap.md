# Future Roadmap

These modules are explicitly **out of scope** for the current MVP. They
are documented here as architecture placeholders only — no contract,
agent code, or frontend surface for either exists yet.

## Module 2: Algorithmic Risk & Automated Health Guardian

Potential capabilities:

- Monitor CDP-style collateralization ratios for positions the user holds
  in integrated protocols.
- Detect approaching liquidation risk from real on-chain price/health data.
- Trigger predefined protective actions (partial debt repayment,
  collateral top-up) within the same "AI proposes, Clarity disposes"
  model already established for rebalancing.
- Risk alerts surfaced to the user before any automated action.

This would slot into the existing architecture as a new intent `action`
type (alongside `REBALANCE`) validated by a new, analogous guard
contract — not a rework of the existing vault/execution-engine/risk-guard
separation.

## Module 3: Agentic Payment Gateway

Potential capabilities:

- x402 / HTTP 402-style payment flows.
- AI-agent-controlled wallets for autonomous API/service payments.
- Micropayment escrow for pay-per-call services.

This is a materially different trust model (recurring small payments to
external, possibly unverified endpoints) and deserves its own dedicated
risk-guard-equivalent design rather than reusing vault exposure limits
built for strategy allocation.

## Why these are deferred

Both modules significantly expand the attack surface (new external
integrations, new classes of automated action) and neither has a
verified, current Stacks Testnet dependency confirmed at MVP build time.
Building them now would mean either faking the integration (explicitly
disallowed) or shipping unused scaffolding — both worse than a clear,
documented "not yet."
