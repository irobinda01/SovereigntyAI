import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DecisionRecord } from "./types";
import { contractId } from "./config";

// Off-chain observability log only: every field
// here is a record of something the agent did or observed on-chain, with
// a txId that anyone can independently verify on the Stacks Explorer.
// This store is NEVER the source of truth for balances, ownership, or
// execution outcomes — the blockchain is. If this file is lost, nothing
// about protocol state is lost, only the agent's own activity log.

const __dirname = dirname(fileURLToPath(import.meta.url));
// AGENT_DATA_DIR lets another host process (the web app's server routes) point at the
// same log file; import.meta.url is not a reliable file path once bundled.
const DATA_DIR = process.env.AGENT_DATA_DIR || join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "decisions.json");

function load(): DecisionRecord[] {
  if (!existsSync(/*turbopackIgnore: true*/ DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function persist(records: DecisionRecord[]) {
  if (!existsSync(/*turbopackIgnore: true*/ DATA_DIR)) mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ DATA_FILE, JSON.stringify(records, null, 2));
}

export function recordDecision(record: Omit<DecisionRecord, "id" | "timestamp">): DecisionRecord {
  const full: DecisionRecord = { ...record, id: randomUUID(), timestamp: new Date().toISOString() };
  const records = load();
  records.unshift(full);
  persist(records.slice(0, 500)); // bounded log
  return full;
}

export function updateDecision(id: string, patch: Partial<DecisionRecord>): DecisionRecord | undefined {
  const records = load();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  records[idx] = { ...records[idx], ...patch };
  persist(records);
  return records[idx];
}

// Vault ids restart from 1 on every contract deployment, so a record is only
// ever shown for the vault contract it was produced against. Records written
// by an earlier deployment (or before this field existed) are ignored rather
// than mis-attributed to an unrelated vault that happens to share an id.
export function listDecisions(vaultId?: number): DecisionRecord[] {
  const current = contractId("sovereignty-vault");
  const records = load().filter((r) => r.vaultContract === current);
  return vaultId === undefined ? records : records.filter((r) => r.vaultId === vaultId);
}
