const SATS_PER_SBTC = 100_000_000n;

export function satsToSbtc(sats: bigint | number | string): string {
  const v = BigInt(sats);
  const whole = v / SATS_PER_SBTC;
  const frac = v % SATS_PER_SBTC;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr}`;
}

export function formatSbtc(sats: bigint | number | string): string {
  return `${satsToSbtc(sats)} sBTC`;
}

export function formatStx(microStx: bigint | number | string): string {
  const v = BigInt(microStx);
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr} STX`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function shortAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

/** Compact USD figure for real, live TVL data, e.g. $71.5M / $464K / $3,112. */
export function formatUsdCompact(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd).toLocaleString()}`;
}
