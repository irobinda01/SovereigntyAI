import { ECOSYSTEM_PROTOCOLS, EcosystemProtocol } from "../data/ecosystemProtocols";
import { getProtocolTvl, getStxPrice } from "../data/marketData";
import { Asset, ProtocolContext, VaultSnapshot } from "../types";

/**
 * Analyses ONE asset pool of ONE vault against the real Stacks Mainnet DeFi
 * protocols in ecosystemProtocols.ts, using only facts that can be checked:
 *
 *   - is the protocol's Mainnet contract actually deployed right now (Hiro API)
 *   - its live total value locked (DefiLlama)
 *   - the live STX price (for sizing an STX position against a protocol's TVL)
 *   - the vault's OWN on-chain limits (exposure cap, idle floor, max tx size)
 *
 * It is analysis only. It builds no intent, reads no key, signs and submits
 * nothing, and writes nothing to the decision log. SovereigntyAI runs on
 * Testnet: there is no way to move these funds into a Mainnet protocol, and
 * nothing here pretends otherwise (see the `executed: false` field).
 *
 * HONESTY CONSTRAINT: no APY/yield figure is verified for any protocol, so none
 * is produced and no protocol is ranked by "expected return". Ranking is by the
 * category-level risk shape of a single-asset deposit, then by live TVL (how
 * much other capital already trusts it). That is a risk/depth comparison, not a
 * yield forecast, and the result says so.
 */

export type RiskTier = 1 | 2 | 3;

export interface StrategyEvaluation {
  protocolId: string;
  name: string;
  category: EcosystemProtocol["category"];
  website: string;
  plainSummary: string;
  /** true = deployed, false = definitively not found, null = could not be checked right now. */
  contractLive: boolean | null;
  contractId: string;
  tvlUsd: number | null;
  /** Does this protocol take this pool's asset? Based on the protocol's own published description. */
  assetSupported: boolean;
  riskTier: RiskTier;
  riskLabel: "Lower" | "Moderate" | "Higher";
  /** Category-level (not protocol-specific) risk note. */
  riskNote: string;
  /** 1 = best fit. Null when the protocol is not a candidate for this pool. */
  rank: number | null;
  verdict: "CANDIDATE" | "EXCLUDED";
  reasons: string[];
  /** What the vault's own limits would allow into this protocol. Hypothetical - never executed. */
  hypotheticalAllocation: {
    amount: string;
    bpsOfPool: number;
    /** Only for STX (a live STX/USD price exists). Share of the protocol's TVL this would be. */
    shareOfProtocolTvlPct: number | null;
  } | null;
}

export interface PoolEcosystemAnalysis {
  vaultId: number;
  asset: Asset;
  network: "testnet" | "mainnet";
  generatedAt: string;
  pool: {
    totalBalance: string;
    idleBalance: string;
    idleBps: number;
    maxExposureBps: number;
    minIdleBps: number;
    maxTxAmount: string;
    /** Largest amount the vault's own rules would let anyone put into ONE external strategy right now. */
    maxDeployable: string;
  };
  /** Reasons no allocation could happen right now regardless of strategy (paused, empty, ...). */
  blockers: string[];
  stxPriceUsd: number | null;
  strategies: StrategyEvaluation[];
  topPickId: string | null;
  summary: string;
  limitations: string[];
  /** Always false. This analysis never executes anything. */
  executed: false;
  executionNote: string;
}

const BPS = 10_000n;
const CHECK_TIMEOUT_MS = 6_000;

// Which pool assets each protocol accepts, taken ONLY from what the protocol's
// own description in ecosystemProtocols.ts explicitly states. Where the
// description does not establish it (Bitflow, Velar, LISA) or the protocol
// takes neither (Hermetica's USDh), the protocol is listed as excluded rather
// than guessed at.
const ASSET_SUPPORT: Record<string, Asset[]> = {
  alex: ["STX", "SBTC"], // "swap pools and liquidity provisioning for STX, sBTC, and other ..."
  zest: ["SBTC", "STX"], // "users supply assets like sBTC and STX to earn yield"
  arkadiko: ["STX"], // "lock STX or other approved collateral" to mint USDA
  stackingdao: ["STX"], // "liquid staking for STX"
  granite: ["SBTC"], // "borrowers take stablecoin loans against sBTC collateral"
};

const CATEGORY_RISK: Record<EcosystemProtocol["category"], { tier: RiskTier; label: StrategyEvaluation["riskLabel"]; note: string }> = {
  Lending: {
    tier: 1,
    label: "Lower",
    note: "Supplying to a lending market earns interest from borrowers. Main risks: borrower shortfalls if collateral falls faster than it is liquidated, and contract bugs. No impermanent loss.",
  },
  "Liquid Staking": {
    tier: 1,
    label: "Lower",
    note: "Staking earns protocol rewards while the receipt token stays usable. Main risks: the receipt token trading below its underlying value, unlock delays, and contract bugs.",
  },
  "DEX / AMM": {
    tier: 2,
    label: "Moderate",
    note: "Providing liquidity to a trading pool earns trading fees but carries impermanent loss when prices move, plus contract bugs.",
  },
  "CDP / Stablecoin": {
    tier: 3,
    label: "Higher",
    note: "Locking collateral to mint a stablecoin is borrowing, not passive yield: if collateral value drops far enough it can be liquidated. It does not fit idle-capital deployment well.",
  },
  "Synthetic Dollar": {
    tier: 3,
    label: "Higher",
    note: "Synthetic dollars rely on a hedging strategy and its counterparties rather than direct collateral.",
  },
};

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
  ]);
}

/** Definitive answers only: deployed (true), a real 404 (false), or unknown (null). Never "false" because an API had a bad moment. */
async function contractLive(contract: string): Promise<boolean | null> {
  const hosts = ["https://api.hiro.so", "https://api.mainnet.hiro.so"];
  try {
    return await Promise.any(
      hosts.map(async (host) => {
        const res = await fetch(`${host}/extended/v1/contract/${contract}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      })
    );
  } catch {
    return null;
  }
}

const bpsOf = (part: bigint, total: bigint): number => (total <= 0n ? 0 : Number((part * BPS) / total));

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The vault's own rules, applied to a single new external strategy position. Mirrors decisionEngine.analyze's sizing. */
function sizeDeployable(vault: VaultSnapshot): bigint {
  const maxExposureAmount = (vault.totalBalance * BigInt(vault.riskConfig.maxExposureBps)) / BPS;
  // CEILING division so the resulting idle share can never land a hair under the floor.
  const reserve = (vault.totalBalance * BigInt(vault.riskConfig.minIdleBps) + BPS - 1n) / BPS;
  const idleAfterReserve = vault.idleBalance > reserve ? vault.idleBalance - reserve : 0n;
  let amount = idleAfterReserve;
  if (amount > maxExposureAmount) amount = maxExposureAmount;
  if (amount > vault.riskConfig.maxTxAmount) amount = vault.riskConfig.maxTxAmount;
  return amount > 0n ? amount : 0n;
}

export async function analyzePoolAgainstEcosystem(
  vault: VaultSnapshot,
  ctx: ProtocolContext,
  network: "testnet" | "mainnet",
  protocols: EcosystemProtocol[] = ECOSYSTEM_PROTOCOLS
): Promise<PoolEcosystemAnalysis> {
  const label = vault.asset === "STX" ? "STX" : "sBTC";

  const blockers: string[] = [];
  if (ctx.protocolPaused) blockers.push("The protocol is paused by governance, so no new allocation is possible.");
  if (!vault.supportsAsset) blockers.push(`This vault was not created to hold ${label}.`);
  if (vault.paused) blockers.push("This vault is paused by its owner.");
  if (vault.totalBalance <= 0n) blockers.push(`This vault holds no ${label} yet, so there is nothing to deploy.`);

  const deployable = blockers.length === 0 ? sizeDeployable(vault) : 0n;
  if (blockers.length === 0 && deployable <= 0n) {
    blockers.push(
      `The vault is at its own limits (${vault.riskConfig.maxExposureBps / 100}% per-strategy cap, ${vault.riskConfig.minIdleBps / 100}% minimum idle) or has no idle ${label} beyond the reserve.`
    );
  }

  const [priceRes, ...checks] = await Promise.all([
    withTimeout(getStxPrice()).then((p) => p.usd, () => null as number | null),
    ...protocols.map(async (p) => {
      const [live, tvl] = await Promise.all([
        contractLive(p.mainnetContract),
        p.defiLlamaSlug ? withTimeout(getProtocolTvl(p.defiLlamaSlug)).catch(() => null) : Promise.resolve(null),
      ]);
      return { live, tvl };
    }),
  ]);
  const stxPriceUsd = priceRes;

  const evaluations: StrategyEvaluation[] = protocols.map((p, i) => {
    const { live, tvl } = checks[i];
    const risk = CATEGORY_RISK[p.category];
    const supported = (ASSET_SUPPORT[p.id] ?? []).includes(vault.asset);
    const known = p.id in ASSET_SUPPORT;

    const reasons: string[] = [];
    if (live === false) reasons.push("Its Mainnet contract was not found on-chain, so it is not a valid destination.");
    else if (live === null) reasons.push("Its Mainnet contract could not be verified just now (the public API was unreachable), so it is not ranked.");
    if (!supported) {
      reasons.push(
        known
          ? `Its published description does not include ${label} deposits.`
          : `Whether it accepts ${label} is not established by its published description, so it is not assumed.`
      );
    }

    const candidate = live === true && supported;
    let hypothetical: StrategyEvaluation["hypotheticalAllocation"] = null;
    if (candidate && deployable > 0n) {
      let share: number | null = null;
      if (vault.asset === "STX" && stxPriceUsd !== null && tvl !== null && tvl > 0) {
        share = ((Number(deployable) / 1e6) * stxPriceUsd) / tvl * 100;
      }
      hypothetical = { amount: deployable.toString(), bpsOfPool: bpsOf(deployable, vault.totalBalance), shareOfProtocolTvlPct: share };
    }

    return {
      protocolId: p.id,
      name: p.name,
      category: p.category,
      website: p.website,
      plainSummary: p.plainSummary,
      contractLive: live,
      contractId: p.mainnetContract,
      tvlUsd: tvl,
      assetSupported: supported,
      riskTier: risk.tier,
      riskLabel: risk.label,
      riskNote: risk.note,
      rank: null,
      verdict: candidate ? "CANDIDATE" : "EXCLUDED",
      reasons,
      hypotheticalAllocation: hypothetical,
    };
  });

  // Rank candidates: lower category risk first, then deeper live TVL first.
  const ranked = evaluations
    .filter((e) => e.verdict === "CANDIDATE")
    .sort((a, b) => a.riskTier - b.riskTier || (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1));
  ranked.forEach((e, i) => {
    e.rank = i + 1;
    e.reasons.push(
      `${e.riskLabel} risk shape for a single-asset deposit (${e.category}).`,
      e.tvlUsd !== null ? `About ${fmtUsd(e.tvlUsd)} of other capital is locked in it (DefiLlama).` : "No live TVL figure was available for it."
    );
    if (e.tvlUsd !== null && e.hypotheticalAllocation?.shareOfProtocolTvlPct != null) {
      const s = e.hypotheticalAllocation.shareOfProtocolTvlPct;
      e.reasons.push(`A maximum-size position would be about ${s < 0.01 ? "<0.01" : s.toFixed(2)}% of its TVL.`);
    }
  });
  const ordered = [...ranked, ...evaluations.filter((e) => e.verdict === "EXCLUDED")];
  const top = ranked[0] ?? null;

  const supportedCount = evaluations.filter((e) => e.assetSupported).length;
  let summary: string;
  if (!top) {
    summary =
      supportedCount === 0
        ? `None of the ${protocols.length} real Mainnet protocols reviewed is established to accept ${label}, so there is no candidate.`
        : `${supportedCount} reviewed protocol${supportedCount === 1 ? "" : "s"} accept${supportedCount === 1 ? "s" : ""} ${label}, but none could be verified live right now. No candidate is ranked.`;
  } else {
    summary =
      `${ranked.length} of ${protocols.length} real Mainnet protocols accept ${label} and are live. ` +
      `Best fit by risk shape and depth: ${top.name} (${top.category}${top.tvlUsd !== null ? `, ${fmtUsd(top.tvlUsd)} TVL` : ""}).`;
  }
  if (blockers.length > 0) summary += ` Right now this vault could not allocate anything: ${blockers[0]}`;

  return {
    vaultId: vault.vaultId,
    asset: vault.asset,
    network,
    generatedAt: new Date().toISOString(),
    pool: {
      totalBalance: vault.totalBalance.toString(),
      idleBalance: vault.idleBalance.toString(),
      idleBps: bpsOf(vault.idleBalance, vault.totalBalance),
      maxExposureBps: vault.riskConfig.maxExposureBps,
      minIdleBps: vault.riskConfig.minIdleBps,
      maxTxAmount: vault.riskConfig.maxTxAmount.toString(),
      maxDeployable: deployable.toString(),
    },
    blockers,
    stxPriceUsd,
    strategies: ordered,
    topPickId: top?.protocolId ?? null,
    summary,
    limitations: [
      "No APY or yield is shown or used: none is independently verified for these protocols. Check each protocol's own site for current rates.",
      "Ranking compares category-level risk shape and live TVL. It is not a yield forecast or financial advice.",
      "Which assets a protocol accepts comes from its published description; protocols where that is unclear are excluded rather than assumed.",
    ],
    executed: false,
    executionNote:
      network === "testnet"
        ? "Analysis only. SovereigntyAI is running on Stacks Testnet with test tokens: nothing was executed, no transaction was created, and your vault is unchanged. These Mainnet protocols cannot receive Testnet funds."
        : "Analysis only. Nothing was executed and no transaction was created.",
  };
}
