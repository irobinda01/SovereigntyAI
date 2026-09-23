# Vault Architecture (v7): multi-vault, receipt shares, testnet execution gate

**AI proposes. Clarity enforces. Receipt tokens represent ownership. The user retains ownership. Testnet recommendations never become autonomous execution.**

## 1. What was wrong with the previous vault

Found by reading the code and, where possible, the real chain — not assumed.

| # | Problem | Evidence |
|---|---|---|
| 1 | **Every browser deposit/withdraw aborted on-chain.** The wallet call carried no post-conditions in `deny` mode, but `deposit-stx` performs a `stx-transfer?` from the user. | Two real Testnet `deposit-stx` transactions on `sovereignty-vault-v6` finished `abort_by_post_condition` (mode `deny`, 0 post-conditions); the only success used mode `allow`. |
| 2 | **Successful transactions looked failed.** `waitForTxResult` threw on any non-2xx; the Hiro API answers HTTP 404 for a freshly broadcast txid until indexed. | Reproduced by the ops script on the first live run. |
| 3 | **No receipt tokens / no share accounting.** Deposits were raw owner-only counters, so multiple depositors and fractional ownership were impossible. | `sovereignty-vault-v6.clar` |
| 4 | `create-vault()` took no name/purpose/assets/risk parameters; risk config was a second transaction. | contract + create page |
| 5 | Vault discovery used `localStorage`, not chain state. | `localVaultIndex.ts` |
| 6 | Amounts parsed with binary floats (`Number(x) * 10**n`). | `DepositWithdrawForm.tsx`, `RiskConfigForm.tsx` |
| 7 | No testnet execution gate: the engine would submit a real strategy transaction on Testnet, and the agent only recommended when autonomous mode was on. | `execution-engine-v6`, `decisionEngine.ts` |
| 8 | Agent decision log keyed by vault id only, so a fresh deployment (ids restart at 1) would inherit unrelated records. | `store.ts` |

## 2. Contracts

| Contract | Deployed as | Responsibility |
|---|---|---|
| `sovereignty-vault` | `sovereignty-vault-v7` | Many vaults in one contract (`vault-id → config`); ownership; pools; deposits; redemption; on-chain owner/holder indexes; pause |
| `receipt-token` | `receipt-token-v7` | Receipt share balances per `(vault-id, asset, holder)`; mint/burn only by the vault; non-transferable |
| `risk-guard` | `risk-guard-v7` | Per-vault risk parameters; pure `check-intent`; **execution gate** |
| `execution-engine` | `execution-engine-v7` | Intent authorization + routing; read-only `evaluate-rebalance-intent`; gate |
| `strategy-registry` | `strategy-registry-v6` (unchanged) | Approved strategies |
| `agent-registry` | `agent-registry-v4` (unchanged) | Authorized AI executors |
| `protocol-admin` | `sovereignty-protocol-admin-v4` (unchanged) | Admin, emergency pause |

No contract is deployed per vault. The seven-contract split from the brief was reduced to what the
existing suite already provided plus one new contract (`receipt-token`).

## 3. Multi-vault model

`ONE USER = MANY VAULTS`. `create-vault` takes name, purpose (0 conservative … 5 custom), asset mode
(1 STX, 2 sBTC, 3 both), deposit policy, and the full risk configuration, and writes vault + config
atomically — the owner signs exactly the numbers they reviewed. Purpose and assets are immutable
afterwards (depositors rely on them); name, deposit policy and risk parameters are owner-editable.

Discovery is on-chain: `owner-vaults` (vaults I created) and `holder-vaults` (vaults I ever deposited
in), so any device sees the same list. The frontend never reads `localStorage` for this.

## 4. Receipt tokens

A receipt share is an **accounting claim** on one vault's pool of one asset. Not a profit, governance
or investment token. Key `(vault-id, asset, holder)`; supply key `(vault-id, asset)`. Vault #1 shares
can never affect vault #2, and STX shares never mix with sBTC shares.

* Only `sovereignty-vault-v7` can mint/burn (`contract-caller` check). There is no admin, owner or AI
  path to mint. Users cannot mint. The only public functions are `mint`, `burn`, `transfer`.
* **Non-transferable in the MVP.** `transfer` exists and always returns `(err u704)`. This keeps
  "who may redeem" identical to "who deposited". If transfers are ever enabled they move only the
  economic claim — never vault ownership, permissions or AI authority, which are not represented by shares.
* The contract is SIP-013-*shaped* (a token class is `(vault-id, asset)`) but deliberately does not claim
  SIP-013 trait conformance.

## 5. Accounting and share pricing

Per `(vault, asset)` pool the vault tracks `idle`, `strategy-allocation`, and `total = idle + allocated`
(net asset value, allocated at cost). Pools are credited only by deposits and debited only by
redemptions/allocations. **Raw token balances of the contract are never read**, so an unsolicited
"donation" cannot move the share price.

```
first deposit into an empty pool : shares = amount                (>= minimum)
later deposits                   : shares = floor(amount * supply / total)
redemption                       : payout = floor(shares * total / supply)
```

Worked example (tested): pool 120 for 100 shares (price 1.2), deposit 12 ⇒ **10** shares, not 12.
Both operations **floor** (pool's favour), so rounding can never create free shares or free assets;
zero-share deposits and zero-payout redemptions are rejected. Redemption pays only **idle** funds.

**Strategy allocation never changes shares.** Moving 20 → 40 into a strategy changes `idle` and
`allocation`, not `total` and not supply. Receipts = ownership; allocation = deployment.

Limitation: NAV is allocated principal at cost. When a verified strategy with a valuation source exists
the pricing helpers take `total` as an input, so only the NAV source needs to change.

### First-depositor / inflation defence

1. Internal accounting (above) — the classic ERC-4626 donation attack has no lever.
2. Minimum first deposit (1 STX / 0.0001 sBTC) so a pool cannot start in a degenerate dust state.
3. Zero-share deposits rejected; supply-without-assets and assets-without-supply are refused as insolvent.

Tested: attacker mints the minimum, donates 5,000 STX directly, victim deposits and redeems exactly what
they put in; attacker's claim is unchanged.

## 6. STX and sBTC

STX is native: `stx-transfer?`, never SIP-010. sBTC uses the real Testnet token
`SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token` (verified live: 8 decimals, FT `sbtc-token`,
SIP-010 `transfer(amount sender recipient memo)`), and the vault refuses any other token contract.

**Multi-asset decision.** No verified on-chain STX/sBTC price source exists on Testnet, so a vault
supporting both keeps **two separate pools with two separate share classes** — never summed, converted or
cross-valued. Nothing in the code adds STX units to sBTC units.

## 7. Testnet execution gate (protocol level)

`risk-guard-v7.is-strategy-execution-enabled = (chain-id == mainnet) AND mainnet-execution-armed`.

* `chain-id` is read from the chain: **no admin key, transaction or frontend can enable strategy
  execution on Testnet** (`set-mainnet-execution-armed` fails with `u321` off mainnet).
* `armed` defaults to `false`, so even a mainnet deployment fails closed.
* Enforced in **three independent layers**: engine, risk-guard record, vault `execute-rebalance`; plus
  the agent service (`execution/gate.ts`, checked before the executor key is read).
* Enabled on Testnet: analysis, recommendation, intent generation, and **risk validation** — the read-only
  `evaluate-rebalance-intent` runs every rule on the deployed contracts and reports the verdict, with no
  transaction. The gate is checked *after* every risk rule, so "blocked" always means "otherwise valid",
  and a blocked attempt reverts everything: no nonce consumed, no cooldown started.

Lifecycle statuses: `RECOMMENDED → VALIDATING → VALIDATED | REJECTED → TESTNET_BLOCKED` (or
`EXECUTED`/`FAILED` on an armed mainnet; `EXPIRED` for lapsed deadlines). The UI never shows a
"rebalanced" message for a blocked intent and offers no "execute anyway".

## 8. AI flow

`real on-chain state → deterministic analysis (+ optional Claude narration of the text only) →
recommendation → structured intent → on-chain read-only validation → environment gate → STOP`.
Recommendations no longer depend on the autonomy flag (autonomy decides who *submits*). The decision
engine is unchanged in principle: rule-based, never inventing a yield. With no approved strategy it
truthfully returns HOLD.

## 9. Rounding & precision table

| Operation | Rule |
|---|---|
| shares minted | floor |
| redemption payout | floor |
| ownership bps (display) | floor |
| agent idle reserve | **ceiling** (so the contract's floor-division never rejects the proposal) |
| decimal amounts (frontend) | exact bigint parsing; more decimals than the asset has is rejected, never rounded |

## 10. Security review

| Concern | Status |
|---|---|
| Unauthorized mint/burn | Vault-only; tested with user, AI, admin senders |
| Receipt inflation / share-price manipulation | Internal accounting + formula tests + donation tests |
| First-depositor / donation | Defended (§5) and tested |
| Rounding | Floors everywhere; boundary + round-trip tests |
| Cross-vault contamination | Keys include vault-id; multi-vault tests |
| Unauthorized withdrawal | Only own-shares redemption; owner has no privileged path (tested) |
| AI compromise | Executor cannot mint, withdraw, or execute on Testnet; revocable |
| Replay / nonce / stale intents | Strict nonce, deadline, cooldown (tested on mainnet-path harness) |
| Malicious strategy | Registry-verified principal; admin-registered; unreachable on Testnet |
| Admin abuse | Cannot mint, withdraw, or enable Testnet execution; can pause deposits only |
| Pause trapping funds | Redemption never gated |
| Post-condition safety (frontend) | Every asset move declared, `deny` mode |

**Known limitations / residual risk (be honest):**
* Not independently audited.
* Vault owners of *open-deposit* vaults control risk parameters and autonomy for depositors' funds
  (never custody). Depositors should treat the owner as a trusted risk manager.
* No on-chain unwind path from a strategy exists; it must be added and audited before mainnet arming.
* NAV is at cost (no live strategy valuation).
* The mainnet execution branch is unreachable in simnet; it is tested via a harness that patches only the
  chain-id predicate (`tests/mainnet-path.test.ts`). That proves the logic, not the gate itself.
* Activity is read from contract-wide event logs and filtered client-side (bounded pages).
* Recommendations are off-chain records (`record-recommendation` is intentionally not on-chain).
* `set-mainnet-execution-armed` is a single-admin action; use a multisig/timelock before mainnet.
