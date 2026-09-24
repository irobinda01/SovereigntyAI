import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddressFromPrivateKey } from "@stacks/transactions";

// Runs the SovereigntyAI agent's REAL pipeline (agent/src) inside the web
// server, so "Run AI analysis" works without a separate agent process. It is
// the same code the standalone agent runs - analysis, intent construction,
// on-chain (read-only) validation, the testnet execution gate, the decision
// log - not a re-implementation.
//
// Configuration is bridged from what the web app already has (its public
// NEXT_PUBLIC_* settings) plus, optionally, agent/.env:
//   - ANTHROPIC_API_KEY  -> lets Claude phrase the explanation text (optional)
//   - EXECUTOR_ADDRESS   -> or derived from EXECUTOR_PRIVATE_KEY in agent/.env
// The executor PRIVATE KEY is used only to derive its public address here. It
// is never placed in this process's environment, so nothing served by the web
// app can sign anything - which is also moot on Testnet, where execution is
// disabled by the contracts themselves.

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

type Core = {
  pipeline: typeof import("../../../../../agent/src/pipeline");
  store: typeof import("../../../../../agent/src/store");
  state: typeof import("../../../../../agent/src/data/protocolState");
};

let core: Promise<Core> | null = null;

async function init(): Promise<Core> {
  const agentDir = join(process.cwd(), "..", "..", "agent");
  const agentEnv = readEnvFile(join(agentDir, ".env"));
  const fill = (key: string, value: string | undefined) => {
    if (value && !process.env[key]) process.env[key] = value;
  };

  fill("NETWORK", process.env.NEXT_PUBLIC_NETWORK);
  fill("STACKS_API_URL", process.env.NEXT_PUBLIC_STACKS_API_URL);
  fill("DEPLOYER_ADDRESS", process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS);
  fill("SBTC_CONTRACT_ADDRESS", process.env.NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS);
  fill("SBTC_CONTRACT_NAME", process.env.NEXT_PUBLIC_SBTC_CONTRACT_NAME);
  fill("ANTHROPIC_API_KEY", agentEnv.ANTHROPIC_API_KEY);
  fill("INTENT_DEADLINE_WINDOW_BLOCKS", agentEnv.INTENT_DEADLINE_WINDOW_BLOCKS);
  // Serverless (Vercel/Lambda) deploys are read-only except the OS temp dir, so the decision log
  // goes there: it lives only as long as the function instance. That is acceptable because the
  // log is observability only (see agent/src/store.ts); the chain is the source of truth.
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  fill("AGENT_DATA_DIR", serverless ? join(tmpdir(), "sovereignty-agent") : join(agentDir, "data"));

  if (!process.env.EXECUTOR_ADDRESS) {
    const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
    if (agentEnv.EXECUTOR_ADDRESS) process.env.EXECUTOR_ADDRESS = agentEnv.EXECUTOR_ADDRESS;
    else if (agentEnv.EXECUTOR_PRIVATE_KEY) {
      try {
        process.env.EXECUTOR_ADDRESS = getAddressFromPrivateKey(agentEnv.EXECUTOR_PRIVATE_KEY, network);
      } catch {
        // malformed key: evaluation simply falls back to the vault owner as sender
      }
    }
  }

  const [pipeline, store, state] = await Promise.all([
    import("../../../../../agent/src/pipeline"),
    import("../../../../../agent/src/store"),
    import("../../../../../agent/src/data/protocolState"),
  ]);
  return { pipeline, store, state };
}

/** Lazily loads the agent core once per server process. A failed init is not cached, so the next request retries. */
export function agentCore(): Promise<Core> {
  core ??= init().catch((e) => {
    core = null;
    throw e;
  });
  return core;
}

export function serializeBigints<T>(obj: T): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** Adds `expired` (has the intent's block-height deadline passed?) to each record. Informational only. */
export async function withExpiry<T extends { intent: { deadline: number } | null }>(records: T[]) {
  let tip: number | null = null;
  try {
    tip = (await (await agentCore()).state.getProtocolContext()).blockHeight;
  } catch {
    tip = null;
  }
  return records.map((r) => ({ ...r, expired: tip !== null && r.intent ? r.intent.deadline < tip : null }));
}
