// Vault purposes and their DEFAULT risk configuration.
//
// These are starting points for the creation flow, nothing more:
//   - the user always reviews and can change every number before signing;
//   - the contract stores whatever the owner signed (there is no on-chain
//     notion of "preset limits"), so a default is never a hard limit;
//   - the numbers express a risk *posture* (more/less idle liquidity, tighter/
//     looser per-strategy caps). They are not forecasts, and no yield, APY or
//     performance is implied anywhere.
// Every value must stay inside the protocol ceilings enforced by
// risk-guard-v7 (read live from the chain by the creation form, which
// validates against them before a transaction is ever signed).

export interface RiskDefaults {
  maxExposureBps: number; // per-strategy concentration cap
  minIdleBps: number; // aggregate idle-liquidity floor
  maxSlippageBps: number;
  maxStxTx: bigint; // microSTX
  maxSbtcTx: bigint; // sats
  cooldownBlocks: number;
  autonomous: boolean;
  openDeposits: boolean;
}

export interface VaultPurpose {
  id: number; // stored on-chain in `purpose`
  key: "conservative" | "aggressive" | "business" | "dao" | "institutional" | "custom";
  label: string;
  tagline: string;
  description: string;
  traits: string[];
  suggestedName: string;
  defaults: RiskDefaults;
}

const STX = 1_000_000n;
const SBTC = 100_000_000n;

export const PURPOSES: VaultPurpose[] = [
  {
    id: 0,
    key: "conservative",
    label: "Conservative",
    tagline: "Preserve liquidity first",
    description:
      "A treasury that keeps most capital idle and immediately redeemable, with small, tightly bounded allocations.",
    traits: ["Lower strategy exposure", "Higher idle-liquidity requirement", "Lower maximum transaction size", "Lower maximum slippage"],
    suggestedName: "Conservative Treasury",
    defaults: {
      maxExposureBps: 1500,
      minIdleBps: 5000,
      maxSlippageBps: 25,
      maxStxTx: 100n * STX,
      maxSbtcTx: SBTC / 100n,
      cooldownBlocks: 720,
      autonomous: false,
      openDeposits: false,
    },
  },
  {
    id: 1,
    key: "aggressive",
    label: "Aggressive",
    tagline: "Accept more deployment risk",
    description:
      "A treasury that permits larger allocations and a lower idle floor. More capital can be deployed at once, so more can be affected by a strategy problem.",
    traits: ["Higher permitted strategy exposure", "Lower idle-liquidity floor", "Higher transaction limits", "Higher risk tolerance"],
    suggestedName: "Aggressive Treasury",
    defaults: {
      maxExposureBps: 5000,
      minIdleBps: 1000,
      maxSlippageBps: 100,
      maxStxTx: 1000n * STX,
      maxSbtcTx: SBTC / 10n,
      cooldownBlocks: 60,
      autonomous: false,
      openDeposits: false,
    },
  },
  {
    id: 2,
    key: "business",
    label: "Business",
    tagline: "Balanced, liquidity-aware",
    description:
      "Operating capital with a healthy liquid reserve: moderate strategy exposure, and enough idle balance to keep paying obligations.",
    traits: ["Balanced liquidity", "Moderate strategy exposure", "Higher liquidity preservation"],
    suggestedName: "Business Treasury",
    defaults: {
      maxExposureBps: 3000,
      minIdleBps: 3500,
      maxSlippageBps: 50,
      maxStxTx: 500n * STX,
      maxSbtcTx: SBTC / 20n,
      cooldownBlocks: 288,
      autonomous: false,
      openDeposits: false,
    },
  },
  {
    id: 3,
    key: "dao",
    label: "DAO",
    tagline: "Governance-oriented, transparent",
    description:
      "A community treasury with conservative execution boundaries and long cooldowns, so every change is slow, visible and reviewable.",
    traits: ["Strong governance-oriented controls", "Higher transparency", "Conservative execution boundaries"],
    suggestedName: "DAO Treasury",
    defaults: {
      maxExposureBps: 2500,
      minIdleBps: 4000,
      maxSlippageBps: 30,
      maxStxTx: 250n * STX,
      maxSbtcTx: SBTC / 40n,
      cooldownBlocks: 1008,
      autonomous: false,
      openDeposits: false,
    },
  },
  {
    id: 4,
    key: "institutional",
    label: "Institutional",
    tagline: "Strict controls, explicit approval",
    description:
      "The tightest posture: small per-strategy caps, a high idle floor, strict slippage, long cooldowns and owner approval for every intent.",
    traits: ["Strict risk controls", "Strong execution limits", "High auditability", "Explicit approval required"],
    suggestedName: "Institutional Treasury",
    defaults: {
      maxExposureBps: 1000,
      minIdleBps: 6000,
      maxSlippageBps: 10,
      maxStxTx: 50n * STX,
      maxSbtcTx: SBTC / 200n,
      cooldownBlocks: 1440,
      autonomous: false,
      openDeposits: false,
    },
  },
  {
    id: 5,
    key: "custom",
    label: "Custom",
    tagline: "Configure everything yourself",
    description: "Start from neutral defaults and set every parameter to exactly what you want.",
    traits: ["Neutral starting values", "Every parameter is yours to set"],
    suggestedName: "My Treasury",
    defaults: {
      maxExposureBps: 2000,
      minIdleBps: 3000,
      maxSlippageBps: 50,
      maxStxTx: 100n * STX,
      maxSbtcTx: SBTC / 100n,
      cooldownBlocks: 144,
      autonomous: false,
      openDeposits: false,
    },
  },
];

export function purposeById(id: number): VaultPurpose {
  return PURPOSES.find((p) => p.id === id) ?? PURPOSES[PURPOSES.length - 1];
}

// Asset modes, as stored on-chain in `assets`.
export const ASSET_MODES = [
  {
    id: 1,
    label: "STX",
    detail: "One pool: native Testnet STX.",
  },
  {
    id: 2,
    label: "sBTC",
    detail: "One pool: real Testnet sBTC (SIP-010).",
  },
  {
    id: 3,
    label: "STX + sBTC",
    detail:
      "Two SEPARATE pools with separate receipt shares. STX and sBTC are never converted, summed or valued against each other - no verified on-chain price source exists on Testnet.",
  },
] as const;

export function assetsForMode(mode: number): Array<"STX" | "SBTC"> {
  if (mode === 1) return ["STX"];
  if (mode === 2) return ["SBTC"];
  return ["STX", "SBTC"];
}

export function modeLabel(mode: number): string {
  return ASSET_MODES.find((m) => m.id === mode)?.label ?? "Unknown";
}
