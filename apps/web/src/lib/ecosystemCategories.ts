export type CategoryTone = "accent" | "enforce" | "success" | "warning" | "neutral";

interface CategoryInfo {
  label: string;
  blurb: string;
  tone: CategoryTone;
}

const CATEGORY_INFO: Record<string, CategoryInfo> = {
  "DEX / AMM": {
    label: "Token Exchange",
    blurb: "Trade one crypto token for another, instantly, without a bank or broker.",
    tone: "accent",
  },
  Lending: {
    label: "Lending & Borrowing",
    blurb: "Earn interest by lending your crypto, or borrow crypto by putting up other crypto as collateral.",
    tone: "enforce",
  },
  "CDP / Stablecoin": {
    label: "Stablecoin Vault",
    blurb: "Lock up crypto to create a stablecoin — a token designed to always be worth about $1.",
    tone: "warning",
  },
  "Liquid Staking": {
    label: "Earn Staking Rewards",
    blurb: "Earn rewards on your crypto without having to lock it away or manage the process yourself.",
    tone: "success",
  },
  "Synthetic Dollar": {
    label: "Bitcoin-Backed Stablecoin",
    blurb: "A stablecoin backed by Bitcoin and a hedging strategy, instead of cash reserves.",
    tone: "neutral",
  },
};

export function categoryInfo(category: string): CategoryInfo {
  return CATEGORY_INFO[category] ?? { label: category, blurb: "", tone: "neutral" };
}

export function allCategories(): string[] {
  return Object.keys(CATEGORY_INFO);
}
