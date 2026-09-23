/**
 * Prompt-injection / untrusted-data defense (spec section 43).
 *
 * The MVP decision engine (analysis/decisionEngine.ts) is deterministic
 * and rule-based — it does not send any on-chain or API data to an LLM,
 * so there is no prompt for injected text to hijack. This module exists
 * so that stays true by construction as the agent evolves:
 *
 *   1. Every string that originates on-chain (a strategy's `name` field,
 *      a token's `get-name`/`get-symbol`, an executor's `label`) MUST be
 *      passed through `sanitizeForDisplay` before it is interpolated into
 *      any recommendation text, log line, or (in a future LLM-assisted
 *      version) a prompt.
 *   2. On-chain/API data is DATA. It is never treated as an instruction
 *      that changes what the agent does. The agent's actual behavior is
 *      governed only by the deterministic rules in decisionEngine.ts and
 *      the hardcoded contract call sequence in execution/submitIntent.ts
 *      — never by the content of a strategy name, a memo field, or any
 *      other free-text value.
 */

const MAX_DISPLAY_LENGTH = 128;

export function sanitizeForDisplay(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, "") // strip control characters
    .slice(0, MAX_DISPLAY_LENGTH);
}
