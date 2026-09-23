// Maps the Clarity error codes documented in docs/contracts.md to
// human-readable explanations. Every code here corresponds to a real
// `(err uNNN)` constant in the contracts - nothing here is invented, and
// unrecognized codes fall through to a generic-but-honest message rather
// than a fabricated explanation.

const MESSAGES: Record<number, string> = {
  // sovereignty-vault-v7 (100-199)
  100: "You are not the owner of this vault.",
  101: "That vault does not exist.",
  102: "The protocol is currently paused - new deposits and new vaults are not accepted right now. Redemptions are never affected.",
  103: "That token is not the protocol's approved sBTC contract.",
  104: "Amount must be greater than zero.",
  105: "Not enough idle liquidity in this vault to pay that redemption right now (part of the pool is allocated to strategies). Redeem fewer shares.",
  106: "The token transfer failed.",
  107: "Only the execution engine can trigger a rebalance.",
  108: "The strategy contract supplied does not match the one registered for this strategy id - execution refused.",
  109: "No approved sBTC contract has been configured for the protocol yet.",
  110: "Unsupported asset.",
  111: "This vault was not created to hold that asset.",
  112: "This vault is paused by its owner - deposits are disabled (redemptions still work).",
  113: "Only the vault owner can deposit into this vault (it is not open to other depositors).",
  114: "The first deposit into an empty pool must meet the minimum (1 STX or 0.0001 sBTC).",
  115: "That deposit is too small to mint even one receipt share at the current share price.",
  116: "This pool is in an inconsistent state (shares without assets, or assets without shares) - deposits are refused for safety.",
  117: "You do not hold that many receipt shares in this vault.",
  118: "That redemption is too small to pay out even one base unit.",
  119: "A vault needs a name.",
  120: "Unknown vault purpose.",
  121: "Invalid asset selection.",
  122: "This vault is already paused.",
  123: "This vault is not paused.",
  124: "Strategy execution is disabled on Stacks Testnet.",

  // execution-engine-v7 (200-299)
  200: "Vault not found.",
  201: "This executor is not authorized to submit intents for this vault.",
  202: "The destination strategy is not registered and active.",
  203: "IDLE is not a valid rebalance destination.",
  204: "Invalid asset for this intent.",
  205: "The intent's asset does not match the destination strategy's registered asset.",
  206: "This vault is paused.",
  207: "This vault does not hold the asset named in the intent.",
  208: "Strategy execution is disabled on Stacks Testnet.",

  // risk-guard-v7 (300-399)
  300: "Not the protocol admin.",
  301: "Only the vault contract may call this.",
  302: "Only the execution engine may call this.",
  303: "The protocol is currently paused.",
  304: "This vault has no risk configuration yet.",
  305: "This vault's risk configuration already exists.",
  306: "Autonomous execution is not enabled for this vault - only the owner can submit intents.",
  307: "This intent's deadline has passed.",
  308: "Invalid or already-used nonce - this intent may have been replayed.",
  309: "The cooldown period between executions has not elapsed yet.",
  310: "Amount must be greater than zero.",
  311: "Amount exceeds this vault's configured maximum transaction size.",
  312: "The per-strategy exposure cap would be exceeded.",
  313: "The protocol-wide exposure cap for this strategy would be exceeded.",
  314: "Requested slippage exceeds this vault's configured maximum.",
  315: "Insufficient idle balance to fund this allocation.",
  316: "This would leave the vault below its minimum idle-liquidity floor.",
  317: "One or more risk parameters are outside the protocol's allowed bounds.",
  318: "Internal calculation error.",
  319: "Invalid asset.",
  320: "Strategy execution is disabled on Stacks Testnet.",
  321: "This can only be done on Stacks mainnet.",

  // strategy-registry (400-499)
  400: "Not the protocol admin.",
  401: "This strategy is already registered.",
  402: "That strategy id does not exist.",
  403: "Invalid strategy parameters.",
  404: "Invalid strategy asset.",

  // agent-registry (500-599)
  500: "Not the protocol admin.",
  501: "This executor is already registered.",
  502: "This executor is not registered.",
  503: "This executor is already in that active/inactive state.",

  // protocol-admin (600-699)
  600: "Not the protocol admin.",
  601: "No pending admin transfer.",
  602: "The protocol is already paused.",
  603: "The protocol is not paused.",
  604: "That principal is already the admin.",

  // receipt-token-v7 (700-799)
  700: "Only the vault contract can mint or burn receipt shares.",
  701: "Invalid receipt asset.",
  702: "Receipt amount must be greater than zero.",
  703: "Insufficient receipt balance.",
  704: "Receipt shares are non-transferable.",
};

export function explainClarityError(code: number): string {
  return MESSAGES[code] ?? `Transaction rejected by the contract (error code ${code}).`;
}

/** Turns a failed TxResult (or thrown wallet error) into one user-facing sentence. */
export function describeFailure(result: { errorCode?: number; errorText?: string }): string {
  if (result.errorCode !== undefined) return explainClarityError(result.errorCode);
  if (result.errorText?.includes("post_condition")) {
    return "The transaction was rejected because it would have moved assets other than those you approved.";
  }
  return result.errorText || "Transaction failed on-chain.";
}
