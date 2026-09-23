# Testnet Configuration

All values below were verified live against the real Stacks Testnet API
during development (see `npm run inspect -- <contract-id> testnet`), not
copied from a tutorial or an old repository.

## Network

| Setting | Value |
|---|---|
| Network | Stacks Testnet |
| API base URL | `https://api.testnet.hiro.so` |
| Explorer | `https://explorer.hiro.so/?chain=testnet` |
| Chain ID | `2147483648` |
| Transaction version | `128` |

## STX (native — no contract dependency)

STX is Stacks' native token, moved via the built-in `stx-transfer?`
function rather than a SIP-010 contract call, and read via the built-in
`stx-get-balance` / the API's `/extended/v1/address/{address}/stx`
endpoint. There is no contract address to verify and nothing to pull in
as a Clarinet requirement — every wallet already holds real testnet STX
(fundable from the faucet below), which is why STX deposits could be
exercised with genuinely real funds during this project's Testnet
deployment without needing a Bitcoin peg-in.

## Real sBTC contract (verified)

| Field | Value |
|---|---|
| Contract | `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token` |
| Registry contract | `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-registry` |
| Fungible token name | `sbtc-token` (available balance) and `sbtc-token-locked` (locked) |
| Decimals | `8` |
| Standard | SIP-010 |

Verified via a direct query to
`https://api.testnet.hiro.so/extended/v1/contract/SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`
and `.../v2/contracts/interface/...`, both returning the real deployed
contract's transaction id and function signatures — reproduced in
`scripts/inspect-contracts.ts`.

**Getting real testnet sBTC**: sBTC is minted 1:1 against real Bitcoin
locked with the sBTC signer set (a BTC peg-in, not a faucet). See the
[sBTC Builder Quickstart](https://docs.stacks.co/build/sbtc/sbtc-builder-quickstart)
for the current deposit flow. This is a real cross-chain operation
requiring real testnet BTC — SovereigntyAI does not, and will not, mint
or simulate sBTC balances outside of the Clarinet **simnet** test suite
(where `simnet.mintFT` is used strictly to fund test wallets against the
real sbtc-token contract's logic, not to fake anything user-facing).

## Recommended Stacks.js packages (verified current at build time)

| Package | Use |
|---|---|
| `@stacks/connect` | Wallet connection (`connect()`, `request()`) — the modern SIP-030/WBIP request API, not the deprecated `showConnect`/`openContractCall` |
| `@stacks/transactions` | Building/signing/broadcasting transactions, Clarity value helpers (`Cl.*`), read-only calls (`fetchCallReadOnlyFunction`) |
| `@stacks/network` | `STACKS_TESTNET` / network name strings |
| `@stacks/clarinet-sdk` | Simnet testing (the current package — supersedes the deprecated `@hirosystems/clarinet-sdk`) |

## Testnet STX faucet

```
POST https://api.testnet.hiro.so/extended/v1/faucets/stx?address=<address>
```

or via the [sandbox faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet).
Needed for transaction fees for both the deployer wallet and the AI
executor wallet — never for sBTC itself, which STX cannot buy directly on
testnet.

## Clarinet

Development used Clarinet `3.8.1`. `clarinet check` compiles all 8
contracts; `npm test` runs the full Vitest + `@stacks/clarinet-sdk` simnet
suite (54 tests). Both are safe to run entirely offline except for the
one-time fetch of the real sbtc-token contract source
(`clarinet requirements add`, already recorded in `Clarinet.toml`).
