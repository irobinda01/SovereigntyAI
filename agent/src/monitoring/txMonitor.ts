import { getTxStatus } from "../data/stacksClient";

export interface MonitorResult {
  status: "confirmed" | "failed" | "timeout";
  blockHeight?: number;
}

/**
 * Polls the real Testnet API for a transaction's status until it
 * confirms, fails, or the timeout elapses. Never guesses a result — an
 * unresolved poll after the timeout is reported as "timeout", not
 * silently treated as success or failure.
 */
export async function waitForConfirmation(
  txId: string,
  { timeoutMs = 5 * 60_000, pollIntervalMs = 15_000 } = {}
): Promise<MonitorResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { status, blockHeight } = await getTxStatus(txId);
    if (status === "success") return { status: "confirmed", blockHeight };
    if (status === "abort_by_response" || status === "abort_by_post_condition") {
      return { status: "failed", blockHeight };
    }
    // "pending" — keep polling
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return { status: "timeout" };
}
