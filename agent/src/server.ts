import express, { Request, Response } from "express";
import cors from "cors";
import { runRecommendation, executeValidatedIntent } from "./pipeline";
import { listDecisions } from "./store";
import { config } from "./config";
import { getProtocolContext, getVaultSnapshot } from "./data/protocolState";
import { Asset } from "./types";
import { ECOSYSTEM_PROTOCOLS, getProtocol, verifyProtocolContract } from "./data/ecosystemProtocols";
import { analyzeProtocol } from "./analysis/strategyAnalysis";
import { getStxPrice, getProtocolTvl } from "./data/marketData";
import { streamChat, ChatMessage } from "./chat/chatHandler";

const app = express();
app.use(cors());
app.use(express.json());

function parseAsset(req: Request, res: Response): Asset | null {
  const raw = String(req.query.asset || "").toUpperCase();
  if (raw !== "STX" && raw !== "SBTC") {
    res.status(400).json({ error: 'Query param "asset" must be "STX" or "SBTC".' });
    return null;
  }
  return raw;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    network: config.network,
    hasExecutorKey: Boolean(config.executorPrivateKey),
    // Service-layer view of the testnet execution gate (the chain reports its own via /api/protocol-context).
    strategyExecution: config.network === "mainnet" ? "GATED_BY_CHAIN" : "DISABLED_ON_TESTNET",
  });
});

app.get("/api/protocol-context", async (_req, res) => {
  try {
    res.json(await getProtocolContext());
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ?asset=STX|SBTC required — the two are tracked as fully independent
// balances/configs on-chain (see risk-guard-v6.clar).
app.get("/api/vaults/:vaultId", async (req, res) => {
  const asset = parseAsset(req, res);
  if (!asset) return;
  try {
    const vault = await getVaultSnapshot(Number(req.params.vaultId), asset);
    if (!vault) return res.status(404).json({ error: "Vault not found on-chain" });
    res.json(serializeBigints(vault));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Recommendation + intent + on-chain (read-only) risk validation + environment
// gate. NEVER signs or broadcasts anything - safe to call as often as the
// dashboard wants ("Run AI Analysis" button). Returns the full lifecycle record.
app.post("/api/vaults/:vaultId/recommendation", async (req, res) => {
  const asset = parseAsset(req, res);
  if (!asset) return;
  try {
    const { recommendation, record } = await runRecommendation(Number(req.params.vaultId), asset);
    res.json(serializeBigints({ recommendation, recordId: record.id, record }));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Attempts execution. On Testnet this ALWAYS stops at the gate and returns a
// TESTNET_BLOCKED record - no key is read, no transaction is built or sent.
app.post("/api/vaults/:vaultId/execute", async (req, res) => {
  const asset = parseAsset(req, res);
  if (!asset) return;
  try {
    const record = await executeValidatedIntent(Number(req.params.vaultId), asset);
    res.json(serializeBigints(record));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Decisions are enriched at read time with `expired`: whether the intent's
// block-height deadline has passed. Purely informational - it never rewrites a
// terminal status such as TESTNET_BLOCKED.
async function withExpiry(records: ReturnType<typeof listDecisions>) {
  let tip: number | null = null;
  try {
    tip = (await getProtocolContext()).blockHeight;
  } catch {
    tip = null;
  }
  return records.map((r) => ({
    ...r,
    expired: tip !== null && r.intent ? r.intent.deadline < tip : null,
  }));
}

app.get("/api/vaults/:vaultId/decisions", async (req, res) => {
  res.json(serializeBigints(await withExpiry(listDecisions(Number(req.params.vaultId)))));
});

app.get("/api/decisions", async (_req, res) => {
  res.json(serializeBigints(await withExpiry(listDecisions())));
});

// Real Stacks Mainnet DeFi protocols shown for exploration/education —
// entirely separate from strategy-registry.clar. Each entry's contract
// liveness is re-checked live, not trusted from the static list.
app.get("/api/ecosystem/strategies", async (_req, res) => {
  try {
    const results = await Promise.all(
      ECOSYSTEM_PROTOCOLS.map(async (p) => {
        const [verification, tvlUsd] = await Promise.all([
          verifyProtocolContract(p.mainnetContract),
          p.defiLlamaSlug ? getProtocolTvl(p.defiLlamaSlug) : Promise.resolve(null),
        ]);
        return { ...p, verification, tvlUsd };
      })
    );
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.get("/api/ecosystem/stx-price", async (_req, res) => {
  try {
    res.json(await getStxPrice());
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// AI analysis of one real ecosystem protocol, grounded in live-verified
// facts only (see analysis/strategyAnalysis.ts) — never a fabricated
// TVL/APY. Read-only; never signs or broadcasts anything.
app.post("/api/ecosystem/strategies/:id/analyze", async (req, res) => {
  const protocol = getProtocol(req.params.id);
  if (!protocol) return res.status(404).json({ error: "Unknown protocol id" });
  try {
    res.json(await analyzeProtocol(protocol));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Real-time chat, streamed over Server-Sent Events. Read-only — never
// signs or broadcasts anything (see chat/chatHandler.ts). Optionally
// grounded in one real vault's live state when vaultId + asset are given.
app.post("/api/chat", async (req, res) => {
  const { messages, vaultId, asset } = req.body ?? {};
  if (!Array.isArray(messages) || messages.some((m) => typeof m?.content !== "string")) {
    return res.status(400).json({ error: "Body must include a `messages` array of {role, content}." });
  }
  const parsedAsset = asset === "STX" || asset === "SBTC" ? asset : null;
  const parsedVaultId = Number.isInteger(vaultId) ? Number(vaultId) : null;
  await streamChat(res, messages as ChatMessage[], parsedVaultId, parsedAsset);
});

function serializeBigints(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

app.listen(config.port, () => {
  console.log(`SovereigntyAI agent listening on :${config.port} (network=${config.network})`);
  if (!config.executorPrivateKey) {
    console.warn(
      "EXECUTOR_PRIVATE_KEY not set — this agent instance can only produce recommendations, never execute."
    );
  }
  if (!config.deployerAddress) {
    console.warn("DEPLOYER_ADDRESS not set — protocol contract calls will fail until it is configured.");
  }
});
