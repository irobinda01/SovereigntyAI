# Testnet Deployment

## Current live deployment

Verified live on Stacks Testnet against `https://api.testnet.hiro.so` (v7 contracts canonical at block 516037).

**Deployer / initial admin:** `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE`

| Contract | Principal | Deploy tx |
|---|---|---|
| `sip-010-trait-v4` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.sip-010-trait-v4` | [`0x8d11434e...`](https://explorer.hiro.so/txid/0x8d11434e096f633ae5d5ab87c91f794d57a4e81328dddc9ab7d3817ada884b05?chain=testnet) |
| `strategy-trait-v4` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.strategy-trait-v4` | [`0x4cbb38bd...`](https://explorer.hiro.so/txid/0x4cbb38bd1144dc787455642b43c9ca62f2d3ff2efcd2b99e75b89a5d695381d1?chain=testnet) |
| `sovereignty-protocol-admin-v4` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.sovereignty-protocol-admin-v4` | [`0xa7c3af37...`](https://explorer.hiro.so/txid/0xa7c3af3787aafa2ff7bd7651539d740c6f74c18a96fc7dbd89471d323ac5202d?chain=testnet) |
| `agent-registry-v4` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.agent-registry-v4` | [`0x9b9c6ab4...`](https://explorer.hiro.so/txid/0x9b9c6ab410029e540783f941427f033c9c2dc6bf53d5412d5883db5af7fcd7a5?chain=testnet) |
| `strategy-registry-v6` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.strategy-registry-v6` | [`0x450c223c...`](https://explorer.hiro.so/txid/0x450c223c027ef5fe9e78bb9bd99f4ac9a4698b2621f48e3772b0127079b90cd7?chain=testnet) |
| `receipt-token-v7` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.receipt-token-v7` | [`0x50c6fdc3...`](https://explorer.hiro.so/txid/0x50c6fdc30f329db401e806ac8253c0dc2dbb685c980d831d1c3c6988e2d05071?chain=testnet) |
| `risk-guard-v7` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.risk-guard-v7` | [`0x32ea467d...`](https://explorer.hiro.so/txid/0x32ea467d725229cf96e9eef45568c30c744729e94bf497109cfb064f0bdb627e?chain=testnet) |
| `sovereignty-vault-v7` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.sovereignty-vault-v7` | [`0x183734ec...`](https://explorer.hiro.so/txid/0x183734ec3e0f6db4b27acc4e7a537cb994adb0e7d818a4ac77b9e96a5806992c?chain=testnet) |
| `execution-engine-v7` | `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.execution-engine-v7` | [`0x389b9c42...`](https://explorer.hiro.so/txid/0x389b9c4279c0ad0c673f3f5a046518ece0dce6a336705106b1b3ff10d1b6dd57?chain=testnet) |

**Superseded (immutable, unused):** `risk-guard-v5/v6`, `sovereignty-vault-v5/v6`, `execution-engine-v5/v6`, `strategy-registry-v4`.
The old `sovereignty-vault-v6` vault #1 still holds ~2 real testnet STX owned by the deployer; withdraw it with `withdraw-stx` there (owner-only).

**Bootstrap (v7):** `risk-guard-v7.set-approved-sbtc-asset` -> the real sBTC token, tx
[`0x6eb50983...`](https://explorer.hiro.so/txid/0x6eb509830873b1d088e91dcdf40419d378225ad17560fa20fc94fac7765f98be?chain=testnet)
(`npm run bootstrap:testnet`). Executor registration and pause state carry over from `agent-registry-v4` / `protocol-admin-v4`.

## Live acceptance run (real transactions)

`npm run acceptance:testnet` writes [`testnet-acceptance.json`](./testnet-acceptance.json). Vaults: #2 Conservative, #3 Business (STX+sBTC),
#4 DAO (open deposits); vault #1 was created by an aborted first attempt (the script's tx poll died on the API's 404-before-indexed).

39 of 40 checks passed. The 1 reported failure was a script assertion: it expected `abort_by_response`, but the chain labelled the
(correctly rejected, `(err u113)`) non-owner deposit `abort_by_post_condition`. The script now accepts either.

| Step | Result | tx |
|---|---|---|
| create vaults #2 / #3 / #4 | success | [`0x6a0f577d...`](https://explorer.hiro.so/txid/0x6a0f577dac9ff8afdd13a35d665b7942b701237987a77bbb12fc8a84743eaae3?chain=testnet), [`0x4a26e688...`](https://explorer.hiro.so/txid/0x4a26e688a487c7834b97ef5e521d26b091b6c757789af893cb420941dd9a9bc3?chain=testnet), [`0x35536f85...`](https://explorer.hiro.so/txid/0x35536f8542c09648542f05de6c322ce21fe11fdb0f0f78b9ffba584295c3d6f9?chain=testnet) |
| deposit 2 STX -> 2,000,000 shares, 100% ownership | success | [`0xc94113de...`](https://explorer.hiro.so/txid/0xc94113de5083ad463ff30bb44837716fc55f6e86deb9afda4e69d62707a976e1?chain=testnet) |
| multi-user vault #4: 3 STX + 1 STX -> 75% / 25% | success | [`0xa2cda3e1...`](https://explorer.hiro.so/txid/0xa2cda3e1d52d9ec2efe55c6818290f2fcfe2ae14ceee2755090ef98bf90bc121?chain=testnet), [`0x121eee23...`](https://explorer.hiro.so/txid/0x121eee23a22d432237d2246d421bc1f42b5e37fe8a53a00d4bf2251e533d0456?chain=testnet) |
| non-owner deposit into owner-only vault | rejected `(err u113)`, no funds moved | [`0xfb8bae6c...`](https://explorer.hiro.so/txid/0xfb8bae6c097232da323f6cf7a9c4813d6afdcbf1f1e3d18f88fd753b3e4c1990?chain=testnet) |
| deposit 0.001 REAL sBTC -> 100,000 shares | success | [`0x03618d47...`](https://explorer.hiro.so/txid/0x03618d47e706558519f2e29d01d636071f039eadc63388519facfc2b5f279de6?chain=testnet) |
| redeem 1 STX of shares | success | [`0x8a26a998...`](https://explorer.hiro.so/txid/0x8a26a9984f3d4003812aaae93cf4475b94d4b5c78adc4bbe1c7650698b790238?chain=testnet) |
| redeem the sBTC shares (wallet sBTC restored exactly) | success | [`0x39cd32e0...`](https://explorer.hiro.so/txid/0x39cd32e039bdd845d8fa522ce02a40b2667bb56a1ec7df2854b4945d78b48c78?chain=testnet) |

**Not exercised live:** strategy allocation, intent validation against a real strategy, and the gate acting on a validated intent. No strategy
is (or should be) registered on Testnet. Those paths are covered by simnet tests; the live read-only evaluation correctly returns
`(err u202)` (no active strategy). Live agent runs produced real HOLD recommendations.

## Version history

1. **Initial deploy** (`-v4` throughout): all 8 contracts deployed fresh.
   Mid-deploy, `execution-engine-v4` was found to already exist at this
   address from a completely separate, incompatible prior build (string
   strategy ids, dual STX/sBTC design already, but a different interface
   throughout). `risk-guard`, `sovereignty-vault`, `execution-engine` —
   the three contracts that reference each other by name — were
   redeployed as `-v5`; `sip-010-trait-v4`, `strategy-trait-v4`,
   `sovereignty-protocol-admin-v4`, `agent-registry-v4`,
   `strategy-registry-v4` kept their original `-v4` deploys.
2. **STX support added** (this round): sBTC-only balance accounting
   couldn't be extended to a second asset without changing map keys and
   several function signatures, so `strategy-registry` (asset field:
   `principal` → `(string-ascii 8)`), `risk-guard` (per-vault config:
   one `max-tx-amount` → separate `max-stx-tx-amount`/`max-sbtc-tx-amount`),
   `sovereignty-vault` (balances keyed by `{vault-id, asset}`, `deposit`/`withdraw`
   split into `-stx`/`-sbtc` variants, native `stx-transfer?` for STX),
   and `execution-engine` (intents now carry an explicit `asset` field,
   cross-checked against the destination strategy's own registered
   asset) all needed new interfaces. Deployed as `-v6`.
   `sip-010-trait-v4`, `strategy-trait-v4`, `sovereignty-protocol-admin-v4`,
   `agent-registry-v4` were unaffected and were not redeployed.

3. **Multi-vault + receipt shares** (`-v7`): `receipt-token-v7` added; `risk-guard`, `sovereignty-vault`, `execution-engine` redeployed
   with per-vault metadata, share accounting, min-idle floor, on-chain indexes and the chain-id execution gate. See
   [vault-architecture.md](./vault-architecture.md). `strategy-registry-v6`, `agent-registry-v4`, `sovereignty-protocol-admin-v4` and the traits were reused unchanged.

## Still open

- **No strategy is registered for either asset**, by design (none verified as a real, current Testnet integration). `/strategies` correctly shows none.
- Mainnet strategy execution is unreachable by construction; see the limitations in vault-architecture.md before ever arming it.
- To deploy a subset (e.g. only new contracts), hand-trim `deployments/default.testnet-plan.yaml` (as done for v7) and run
  `clarinet deployments apply --testnet --use-on-disk-deployment-plan`; `scripts/deploy-testnet.ts` regenerates a full plan and would
  fail with `ContractAlreadyExists` for contracts that are already live.

## Redeploying from scratch (for reference)

If you're setting this up under a different deployer address:

### 1. Create a dedicated Testnet deployer wallet

Any Stacks wallet (Leather, Xverse) or `@stacks/wallet-sdk` can generate
one. Fund it from the faucet:

```
POST https://api.testnet.hiro.so/extended/v1/faucets/stx?address=<your-address>
```

or https://explorer.hiro.so/sandbox/faucet?chain=testnet

### 2. Configure `settings/Testnet.toml`

Gitignored, never committed:

```toml
[accounts.deployer]
mnemonic = "<your 24-word testnet-only seed phrase>"
```

### 3. Deploy

```bash
npm run deploy:testnet:dry-run   # generates + validates the plan, broadcasts nothing
npm run deploy:testnet           # broadcasts real transactions
```

Wraps `clarinet deployments generate --testnet` /
`clarinet deployments apply --testnet` with pre-flight checks (real
mnemonic configured, sufficient real STX balance queried live). See
`scripts/deploy-testnet.ts`. **If any contract name is already taken on
your deployer address** (as happened twice above), Clarinet's plan will
still include it as a fresh publish and the apply step will fail with
`ContractAlreadyExists` on that one — rename just the affected
contract(s) (in-file cross-references, `Clarinet.toml` entry, and the
`DEPLOYED_CONTRACT_NAMES` map in `agent/`/`apps/web/`) and retry. Always
check `https://api.testnet.hiro.so/extended/v1/contract/<deployer>.<name>`
for a 404 before picking a new suffix.

### 4. Verify

```bash
DEPLOYER_ADDRESS=<your-deployer-address> npm run verify:testnet
```

### 5. Required bootstrap calls

Not automated into the deploy script on purpose — granting AI executor
authority and setting the approved asset are governance actions, not
deploy steps:

1. `risk-guard.set-approved-sbtc-asset` with the real sBTC contract
   principal (`SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`).
   STX needs no equivalent call — it's native and always accepted.
2. Fund a **dedicated, separate** executor wallet with a little Testnet
   STX, then `agent-registry.register-executor` with its address.

### 6. Configure the frontend and agent

```bash
cp apps/web/.env.example apps/web/.env.local
cp agent/.env.example agent/.env
```

Fill in `DEPLOYER_ADDRESS` in both, and `EXECUTOR_PRIVATE_KEY` /
`ANTHROPIC_API_KEY` (optional, enables LLM-assisted recommendation
narration — see `docs/ai-agent.md`) in `agent/.env`.

### 7. Real testnet acceptance walkthrough

1. Connect a Testnet wallet — real STX/sBTC balances load from the live API.
2. Create a vault (`/vault/create`) — one real transaction.
3. Deposit real testnet STX directly (no peg-in needed), or sBTC (requires a real BTC peg-in — see `docs/testnet.md`).
4. Configure risk parameters and enable autonomous mode.
5. Click "Run AI Analysis" for either asset — real on-chain read + (if configured) real Claude narration.
6. Once a strategy is registered and active for that asset, submit a `REBALANCE` — validated on-chain, confirmed, visible on `/activity` with a real explorer link.
7. Security demonstration: an intent exceeding configured exposure is rejected with `ERR-EXPOSURE-EXCEEDED` — see `tests/integration.test.ts` for the passing simnet equivalent of this exact scenario, including the STX/sBTC asset-mismatch rejection.
