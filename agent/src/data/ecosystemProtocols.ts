// Curated, informational list of real Stacks MAINNET DeFi protocols,
// shown to users for exploration/education. This is entirely separate
// from strategy-registry.clar (which governs what SovereigntyAI vaults
// can actually allocate real Testnet funds into) — SovereigntyAI runs on
// Testnet and has no ability to execute funds into any Mainnet contract.
// Nothing here is presented as, or usable as, an executable destination.
//
// Every `mainnetContract` was verified to actually exist on Mainnet via
// a direct query to the real Hiro API before being added here (see
// docs/strategies.md "Ecosystem Explorer"). `verifyProtocolContract`
// re-checks liveness at request time rather than trusting this static
// list to stay accurate forever.

export interface EcosystemProtocol {
  id: string;
  name: string;
  category: "DEX / AMM" | "Lending" | "CDP / Stablecoin" | "Liquid Staking" | "Synthetic Dollar";
  website: string;
  description: string;
  mainnetContract: string; // "SP....contract-name" — verified live, see below
  /** One jargon-free sentence: what this protocol lets an ordinary person do. */
  plainSummary: string;
  /** 3-4 short, jargon-free steps describing how it actually works. */
  howItWorks: string[];
  /** 2-3 short, plain-language risks a first-time user should know about. */
  risks: string[];
  /** DefiLlama protocol slug, used to fetch a real, live TVL figure. Omit if unlisted. */
  defiLlamaSlug?: string;
}

// Each contract below was verified live via a direct query to
// https://api.hiro.so/extended/v1/contract/<mainnetContract> during
// development (real tx_id + block_height returned, not a 404) — not
// copied from a tutorial or assumed from search results alone.
export const ECOSYSTEM_PROTOCOLS: EcosystemProtocol[] = [
  {
    id: "alex",
    name: "ALEX",
    category: "DEX / AMM",
    website: "https://alexlab.co",
    description:
      "ALEX is an automated market maker (AMM) DEX on Stacks, providing swap pools and liquidity provisioning for STX, sBTC, and other Stacks-native assets. Liquidity providers earn trading fees in exchange for taking on impermanent loss risk.",
    plainSummary:
      "A digital currency exchange where you can trade one Stacks token for another instantly, without a bank or broker in the middle.",
    howItWorks: [
      "Other users have already deposited pairs of tokens (like STX and sBTC) into a shared pool.",
      "When you want to swap, the pool's software automatically sets a price and trades with you directly.",
      "If you deposit your own tokens into a pool instead of swapping, you earn a small fee from every trade that uses your pool.",
    ],
    risks: [
      "Prices can move against you between when you start a trade and when it confirms.",
      "If you supply tokens to a pool, the value of what you get back can be worth less than what you put in if prices shift a lot (this is called impermanent loss).",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1",
    defiLlamaSlug: "alex",
  },
  {
    id: "zest",
    name: "Zest Protocol",
    category: "Lending",
    website: "https://www.zestprotocol.com",
    description:
      "Zest Protocol is a Bitcoin-focused lending market on Stacks where users supply assets like sBTC and STX to earn yield, or borrow against their holdings. Live since March 2024, it has processed over $100M in peak TVL.",
    plainSummary:
      "A place to either lend out your crypto to earn interest, or borrow crypto by putting up other crypto as collateral — similar to a savings account or a pawn shop, run entirely by software.",
    howItWorks: [
      "Lenders deposit sBTC or STX into a shared pool and earn interest paid by borrowers.",
      "Borrowers lock up collateral worth more than what they want to borrow, then receive the loan instantly.",
      "If a borrower's collateral value falls too close to their loan amount, the software can automatically sell some of it to keep lenders protected.",
    ],
    risks: [
      "If you borrow, a sharp price drop in your collateral can trigger an automatic, forced sale (liquidation) at a loss.",
      "Interest rates change automatically based on supply and demand and are not fixed.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market",
    defiLlamaSlug: "zest-v2",
  },
  {
    id: "arkadiko",
    name: "Arkadiko",
    category: "CDP / Stablecoin",
    website: "https://arkadiko.finance",
    description:
      "Arkadiko is a collateralized-debt-position (CDP) protocol on Stacks: users lock STX or other approved collateral into a vault to mint the USDA stablecoin, similar in design to MakerDAO. \"Freddie\" is the protocol's internal name for its vault manager contract.",
    plainSummary:
      "Lets you lock up STX as collateral and, in return, create (\"mint\") USDA, a stablecoin designed to track $1 — without selling your STX.",
    howItWorks: [
      "You deposit STX into your own personal vault on the protocol.",
      "The software lets you mint USDA stablecoins worth less than your deposited STX (extra collateral is required as a safety cushion).",
      "You repay the USDA whenever you want to unlock and withdraw your original STX.",
    ],
    risks: [
      "If the value of your STX collateral falls too far, your vault can be automatically liquidated (sold off) to repay the debt.",
      "A stablecoin's peg to $1 is not guaranteed — its market price can still drift, especially during market stress.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-freddie-v1-1",
    defiLlamaSlug: "arkadiko",
  },
  {
    id: "stackingdao",
    name: "StackingDAO",
    category: "Liquid Staking",
    website: "https://www.stackingdao.com",
    description:
      "StackingDAO offers liquid staking for STX: users deposit STX and receive stSTX, a transferable token representing their staked position and accrued Stacking (PoX) rewards, usable elsewhere in Stacks DeFi while the underlying STX remains staked.",
    plainSummary:
      "Lets you earn Bitcoin rewards on your STX (through the Stacks network's built-in \"Stacking\" reward program) without locking it up or managing the process yourself.",
    howItWorks: [
      "You deposit STX and immediately receive stSTX, a token representing your deposit plus its future rewards.",
      "The protocol pools everyone's STX together and handles the Stacking process on your behalf, earning Bitcoin rewards.",
      "You can hold, trade, or use stSTX elsewhere in Stacks DeFi at any time, and later exchange it back for the underlying STX plus rewards.",
    ],
    risks: [
      "stSTX's market price can trade slightly above or below the value of the underlying STX it represents.",
      "You are trusting the protocol's software to correctly manage pooled funds and distribute rewards.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-v6",
    defiLlamaSlug: "stackingdao",
  },
  {
    id: "bitflow",
    name: "Bitflow",
    category: "DEX / AMM",
    website: "https://www.bitflow.finance",
    description:
      "Bitflow is a decentralized exchange on Stacks specializing in efficient stable-asset swaps (StableSwap pools) for Bitcoin-pegged and stablecoin pairs, alongside standard AMM pools, aiming to give Bitcoiners deep, low-slippage liquidity.",
    plainSummary:
      "An exchange focused on swapping Bitcoin-related tokens and stablecoins for each other with very little price slippage.",
    howItWorks: [
      "Liquidity providers deposit pairs of similar-value assets (like two different BTC-pegged tokens) into a shared pool.",
      "Its stableswap pricing formula is tuned specifically for assets that should trade close to 1:1, so swaps between them cost less than on a general-purpose exchange.",
      "Traders swap through these pools directly; liquidity providers earn a share of trading fees in return.",
    ],
    risks: [
      "Even \"stable\" pairs can temporarily de-peg from each other during market stress, causing losses for liquidity providers.",
      "Prices can move against you between when you start a trade and when it confirms.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M.stableswap-stx-ststx-v-1-2",
    defiLlamaSlug: "bitflow",
  },
  {
    id: "velar",
    name: "Velar",
    category: "DEX / AMM",
    website: "https://velar.com",
    description:
      "Velar is an automated market maker DEX on Stacks offering standard token-swap pools (a Uniswap-v2-style constant-product design), plus a separate perpetual futures product for leveraged trading.",
    plainSummary:
      "A digital currency exchange where you can trade Stacks tokens for each other instantly, similar to ALEX or Bitflow.",
    howItWorks: [
      "Other users have already deposited pairs of tokens into a shared pool.",
      "When you want to swap, the pool's pricing formula automatically sets a rate and trades with you directly.",
      "If you deposit your own tokens into a pool instead of swapping, you earn a small fee from every trade that uses your pool.",
    ],
    risks: [
      "Prices can move against you between when you start a trade and when it confirms.",
      "If you supply tokens to a pool, the value of what you get back can be worth less than what you put in if prices shift a lot (impermanent loss).",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core",
    defiLlamaSlug: "velar-amm",
  },
  {
    id: "granite",
    name: "Granite",
    category: "Lending",
    website: "https://granite.world",
    description:
      "Granite is a Bitcoin liquidity protocol on Stacks where borrowers take stablecoin loans against sBTC collateral, and liquidity providers earn yield supplying the stablecoins that get lent out. It is designed with isolated pools and without rehypothecating (re-lending) user collateral.",
    plainSummary:
      "Lets you put up sBTC (Bitcoin on Stacks) as collateral to borrow stablecoins, or lend out your stablecoins to earn interest from those borrowers.",
    howItWorks: [
      "Lenders deposit stablecoins into a pool and earn interest paid by borrowers.",
      "Borrowers lock up sBTC worth more than what they want to borrow, then receive the stablecoin loan instantly.",
      "Your deposited sBTC collateral is held, not re-lent elsewhere — it sits there until you repay or it needs to cover a liquidation.",
    ],
    risks: [
      "If you borrow, a sharp drop in sBTC's price can trigger an automatic, forced sale (liquidation) of your collateral at a loss.",
      "Interest rates change automatically based on supply and demand and are not fixed.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1",
    defiLlamaSlug: "granite",
  },
  {
    id: "hermetica",
    name: "Hermetica (USDh)",
    category: "Synthetic Dollar",
    website: "https://hermetica.fi",
    description:
      "Hermetica issues USDh, a synthetic dollar on Stacks backed by Bitcoin-denominated assets combined with an offsetting short position (a \"basis trade\"), rather than by holding cash or bonds directly. Depositors who stake USDh into sUSDh earn yield generated by that basis trade.",
    plainSummary:
      "A stablecoin backed by Bitcoin, using a hedging strategy behind the scenes to try to keep its price steady at about $1 — you can also stake it to earn yield.",
    howItWorks: [
      "You deposit a Bitcoin-pegged asset and receive USDh, a token designed to hold a steady $1 value.",
      "Behind the scenes, the protocol combines your Bitcoin exposure with an offsetting short position, so the combined value is meant to stay stable even if Bitcoin's price moves.",
      "If you stake your USDh as sUSDh, you earn yield generated by that hedging strategy over time.",
    ],
    risks: [
      "The hedging strategy itself carries risk — in extreme or unusual market conditions it may not perfectly offset Bitcoin's price moves, which could affect the $1 peg.",
      "Yield from staking is not guaranteed and can vary with market conditions.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1",
    defiLlamaSlug: "hermetica-usdh",
  },
  {
    id: "lisa",
    name: "LISA",
    category: "Liquid Staking",
    website: "https://www.lisalab.io",
    description:
      "LISA (\"Liquid Staking for All\") is a liquid staking protocol on Stacks, built in partnership with Ryder, Xverse, and ALEX. Its aBTC product lets users stake a Bitcoin-pegged asset and receive LiaBTC, a transferable token representing the staked position, so the underlying stays productive while remaining usable elsewhere in DeFi.",
    plainSummary:
      "Lets you earn rewards on a Bitcoin-pegged token without locking it away or managing the staking process yourself — you get a tradeable token back immediately.",
    howItWorks: [
      "You deposit a supported Bitcoin-pegged asset and immediately receive LiaBTC, a token representing your deposit plus its future rewards.",
      "The protocol pools deposits together and handles the staking process on your behalf.",
      "You can hold, trade, or use LiaBTC elsewhere in Stacks DeFi at any time, and later exchange it back for the underlying asset plus rewards.",
    ],
    risks: [
      "LiaBTC's market price can trade slightly above or below the value of the underlying asset it represents.",
      "You are trusting the protocol's software and its partners to correctly manage pooled funds and distribute rewards.",
      "Like any software, the contract could contain bugs — only use funds you can afford to risk.",
    ],
    mainnetContract: "SP673Z4BPB4R73359K9HE55F2X91V5BJTN5SXZ5T.liabtc-mint-endpoint",
    defiLlamaSlug: "lisa",
  },
];

export interface ContractVerification {
  exists: boolean;
  txId?: string;
  blockHeight?: number;
  checkedAt: string;
}

export async function verifyProtocolContract(contract: string): Promise<ContractVerification> {
  const checkedAt = new Date().toISOString();
  const res = await fetch(`https://api.hiro.so/extended/v1/contract/${contract}`, { cache: "no-store" });
  if (!res.ok) return { exists: false, checkedAt };
  const data = (await res.json()) as { tx_id: string; block_height?: number };
  return { exists: true, txId: data.tx_id, blockHeight: data.block_height, checkedAt };
}

export function getProtocol(id: string): EcosystemProtocol | undefined {
  return ECOSYSTEM_PROTOCOLS.find((p) => p.id === id);
}
