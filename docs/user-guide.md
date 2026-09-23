# User Guide

How to use SovereigntyAI from first connection to redemption. Everything you see in the app is read from the
Stacks Testnet chain; nothing is simulated.

> **You are on Stacks Testnet.** Assets are real *testnet* assets with no mainnet value. On Testnet the AI can
> analyze, recommend and validate, but **autonomous strategy execution is disabled** and your assets never move
> between strategies.

## The five-minute flow

1. **Connect** a Stacks **Testnet** wallet account (addresses start with `ST`). A mainnet account is refused.
2. **Create a treasury** in seven steps: Purpose, Name, Assets, Risk, Autonomy, Review, Create. You sign one transaction.
3. **Deposit** real testnet STX or sBTC. You receive **receipt shares**: your on-chain claim on that treasury.
4. **Ask the AI** for a recommendation. It reads real state and, if anything fits your limits, proposes an action and has the contracts validate it.
5. **Redeem** any time: burn receipt shares, get your proportional share of the idle assets back.

## Creating a treasury

You can create as many treasuries as you like; each is an independent pool with its own rules.

| Step | What you decide |
|---|---|
| **1. Purpose** | Conservative, Aggressive, Business, DAO, Institutional or Custom. The purpose only sets *starting values*. |
| **2. Name** | Stored on-chain; renameable later. |
| **3. Assets** | STX, sBTC, or both. Both means two **separate** pools; they are never converted or summed. Also choose who may deposit: only you, or anyone. |
| **4. Risk** | Maximum strategy exposure, minimum idle liquidity, maximum slippage, cooldown, maximum transaction size. |
| **5. Autonomy** | Manual (you sign every intent) or Autonomous (the AI executor may submit within your limits). |
| **6. Review** | Exactly what will be written to the chain. |
| **7. Create** | Sign the transaction; the app waits for confirmation. |

> **Presets are defaults, not limits.** You review and can change every number. Clarity stores and enforces exactly what you signed, inside the protocol's ceilings (which the form reads live from the chain).

## Depositing

1. Open the treasury and choose **Deposit**.
2. Pick the asset and amount. The form checks your wallet balance and network.
3. **You will receive** shows the receipt shares the contract itself calculates, plus your ownership after the deposit.
4. Sign. Your wallet shows exactly how much you are sending; anything else is rejected by the chain.
5. After confirmation, the page re-reads the chain and shows the shares minted and your real ownership.

The first deposit into an empty pool must be at least **1 STX** or **0.0001 sBTC**. After that, shares are priced against the pool's current net asset value, so a new deposit can never dilute existing holders.

## Understanding your position

| Term | Meaning |
|---|---|
| **Receipt tokens (shares)** | Your fractional ownership of one treasury's pool of one asset. An accounting claim; not a profit, governance or investment token. Non-transferable. |
| **Ownership %** | your shares / total shares, computed from on-chain balances. |
| **Estimated claim** | What your shares entitle you to (includes any part deployed to a strategy). |
| **Available to redeem** | The part of your claim that is **idle** right now. |
| **Idle** | Funds sitting in the vault, redeemable immediately. |
| **Allocation** | How the pool is deployed (idle vs strategies). Changing allocation never changes anyone's shares. |

## Redeeming

Choose **Redeem**, enter receipt shares (or 25/50/75/100%), review the estimated redemption, and sign. Your shares are burned and the proportional assets are sent to you. Only you can redeem your shares. Redemption is **never** blocked by a protocol or vault pause. If part of the pool is allocated to a strategy, only idle funds can be paid out; redeem fewer shares or wait.

## AI recommendations

Open **AI recommendations** and run an analysis for a pool. The agent:

1. reads your treasury's real on-chain state,
2. proposes an action, or says no action is needed (a genuine result when no strategy is approved),
3. builds a structured **intent** (asset, source, destination, amount, slippage, exposure, nonce, deadline),
4. asks the **deployed contracts** to validate it (read-only; no transaction, no fee),
5. applies the environment gate and **stops**.

### Statuses

| Status | Meaning |
|---|---|
| **Recommended** | The AI proposed something; nothing has been checked yet. |
| **Validating** | Being evaluated against your on-chain risk rules. |
| **Validated** | The contracts accepted the intent. |
| **Testnet blocked** | Validated, but strategy execution is disabled on Testnet. No transaction was created. |
| **Rejected** | Your on-chain rules (or missing data) refused it; the reason is shown. |
| **Executed / Failed / Expired** | Mainnet outcomes: confirmed on-chain, failed on-chain, or the deadline passed. |

When a recommendation is **Testnet blocked** you will see: Recommendation READY, Risk validation PASSED, Execution authorization NOT AVAILABLE ON TESTNET, Strategy transaction NOT SUBMITTED, Vault allocation UNCHANGED. **This is an intentional safety state, not an error.** There is no "execute anyway".

AI events are labelled **Off-chain AI event**: they are analysis records, not blockchain events.

## Autonomous mode

Autonomous mode lets the AI executor *prepare and submit* intents inside your limits. It cannot withdraw funds, change your limits, mint receipts or call unapproved contracts. On Testnet, even with autonomous mode on, live execution is disabled. The UI states this wherever autonomy is shown.

## Activity

Each treasury's **Activity** tab merges two clearly-labelled sources: **On-chain** events (vault created, deposits, receipt shares minted, redemptions, setting changes), each linked to its real transaction, and **Off-chain AI** events (recommendations, intents, rejections, testnet blocks).

## Troubleshooting

| You see | Why | What to do |
|---|---|---|
| "Your wallet account is a mainnet account" | The wallet is on a mainnet account. | Switch to a Testnet account. Nothing is built for mainnet accounts. |
| Deposit disabled: "Only the vault owner can deposit" | The vault is owner-only. | Ask the owner to open deposits in Settings. |
| "Below minimum first deposit" | Empty pools need at least 1 STX / 0.0001 sBTC first. | Deposit at least the minimum. |
| Redeem: "Not enough idle liquidity" | Part of your claim is allocated to a strategy. | Redeem fewer shares. |
| Transaction "not completed" with a post-condition message | The transaction would have moved assets you did not approve. | Nothing moved. Retry. |
| Waiting a long time | Block confirmation can take a few minutes. | Balances only update after confirmation; use the explorer link. |
| AI recommendations say "agent unavailable" | The agent service is not running or unreachable. | Your funds are unaffected. Start the agent (see Deployment). |
| A recommendation says HOLD | No approved strategy exists, or nothing fits your limits. | This is the honest result; no strategy is registered on Testnet. |

## Where to go next

- [Vault Architecture](/docs/vault-architecture): how shares, pools and the testnet gate work.
- [Security Model](/docs/security-model): what the AI, the admin and owners can and cannot do.
- [Testnet](/docs/testnet): real assets, faucets and the sBTC contract.
