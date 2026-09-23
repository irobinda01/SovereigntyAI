import { cvToJSON, deserializeCV } from "@stacks/transactions";
import { contractId, STACKS_API_URL } from "./config";

// Per-vault on-chain activity, decoded from the events (Clarity `print`s) that
// the vault contract itself emitted. Nothing here comes from a database: every
// row is a real contract log tied to a real transaction id.

export interface VaultEvent {
  txId: string;
  eventIndex: number;
  kind: string; // e.g. "vault-created", "deposit", "redeem", "risk-config-updated"
  vaultId: number;
  data: Record<string, string | boolean>;
  time?: string; // ISO time of the block that included the tx, when available
  blockHeight?: number;
}

interface RawEvent {
  event_index: number;
  event_type: string;
  tx_id: string;
  contract_log?: { value: { hex: string } };
}

function flatten(json: any): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const fields = json?.value ?? {};
  for (const [k, v] of Object.entries<any>(fields)) {
    const inner = v?.value;
    if (typeof inner === "boolean") out[k] = inner;
    else if (inner !== null && typeof inner === "object") out[k] = String(inner.value ?? "");
    else if (inner !== undefined) out[k] = String(inner);
  }
  return out;
}

const PAGE = 50;

/**
 * Reads the vault contract's event log (newest pages first, bounded) and keeps
 * the events belonging to `vaultId`. The endpoint is contract-wide, so this
 * filters client-side; an MVP limitation documented in docs/architecture.md.
 */
export async function getVaultEvents(vaultId: number, { maxPages = 8 } = {}): Promise<VaultEvent[]> {
  const vaultContract = contractId("sovereignty-vault");
  const events: VaultEvent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(
      `${STACKS_API_URL}/extended/v1/contract/${vaultContract}/events?limit=${PAGE}&offset=${page * PAGE}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Stacks API contract events returned HTTP ${res.status}`);
    const body = (await res.json()) as { results: RawEvent[] };
    for (const ev of body.results) {
      if (ev.event_type !== "smart_contract_log" || !ev.contract_log) continue;
      let data: Record<string, string | boolean>;
      try {
        data = flatten(cvToJSON(deserializeCV(ev.contract_log.value.hex)));
      } catch {
        continue;
      }
      if (data["vault-id"] !== String(vaultId) || typeof data.event !== "string") continue;
      const { event, ...rest } = data;
      events.push({ txId: ev.tx_id, eventIndex: ev.event_index, kind: event as string, vaultId, data: rest });
    }
    if (body.results.length < PAGE) break;
  }

  // Attach real block time / height per unique transaction (bounded).
  const txIds = [...new Set(events.map((e) => e.txId))].slice(0, 60);
  const meta = new Map<string, { time?: string; height?: number }>();
  await Promise.all(
    txIds.map(async (id) => {
      try {
        const r = await fetch(`${STACKS_API_URL}/extended/v1/tx/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const t = await r.json();
        meta.set(id, { time: t.burn_block_time_iso, height: t.block_height });
      } catch {
        // time is decorative; the tx id remains the source of truth
      }
    })
  );
  for (const e of events) {
    const m = meta.get(e.txId);
    e.time = m?.time;
    e.blockHeight = m?.height;
  }

  return events.sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0) || b.eventIndex - a.eventIndex);
}

/**
 * Recent activity across several vaults for the dashboard: everything that
 * happened in vaults the viewer OWNS, plus only the viewer's own deposits and
 * redemptions in vaults they merely hold shares in. Reads the newest event pages
 * of the vault contract once (not once per vault) and filters client-side.
 */
export async function getRecentActivity(
  vaultIds: number[],
  ownedIds: number[],
  viewer: string,
  { maxPages = 3, limit = 8 } = {}
): Promise<VaultEvent[]> {
  const ids = new Set(vaultIds.map(String));
  const owned = new Set(ownedIds.map(String));
  const vaultContract = contractId("sovereignty-vault");
  const events: VaultEvent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${STACKS_API_URL}/extended/v1/contract/${vaultContract}/events?limit=${PAGE}&offset=${page * PAGE}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Stacks API contract events returned HTTP ${res.status}`);
    const body = (await res.json()) as { results: RawEvent[] };
    for (const ev of body.results) {
      if (ev.event_type !== "smart_contract_log" || !ev.contract_log) continue;
      let data: Record<string, string | boolean>;
      try {
        data = flatten(cvToJSON(deserializeCV(ev.contract_log.value.hex)));
      } catch {
        continue;
      }
      const vid = data["vault-id"];
      if (typeof vid !== "string" || !ids.has(vid) || typeof data.event !== "string") continue;
      const mine = data.depositor === viewer || data.holder === viewer || data.owner === viewer;
      if (!owned.has(vid) && !mine) continue;
      const { event, ...rest } = data;
      events.push({ txId: ev.tx_id, eventIndex: ev.event_index, kind: event as string, vaultId: Number(vid), data: rest });
    }
    if (body.results.length < PAGE) break;
  }

  const top = events.slice(0, limit * 2);
  const meta = new Map<string, { time?: string; height?: number }>();
  await Promise.all(
    [...new Set(top.map((e) => e.txId))].slice(0, 20).map(async (id) => {
      try {
        const r = await fetch(`${STACKS_API_URL}/extended/v1/tx/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const t = await r.json();
        meta.set(id, { time: t.burn_block_time_iso, height: t.block_height });
      } catch {
        // decorative
      }
    })
  );
  for (const e of top) {
    const m = meta.get(e.txId);
    e.time = m?.time;
    e.blockHeight = m?.height;
  }
  return top.sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0) || b.eventIndex - a.eventIndex).slice(0, limit);
}
