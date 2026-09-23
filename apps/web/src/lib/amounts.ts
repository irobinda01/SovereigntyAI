// Exact decimal <-> base-unit conversion. Everything money-shaped in this app
// goes through here: never `Number(x) * 10 ** n` (binary floats silently
// corrupt amounts such as 0.1 + 0.2 or 1.005 * 1000), always bigint math on
// the decimal string the user typed.

export type AssetKey = "STX" | "SBTC";

export const DECIMALS: Record<AssetKey, number> = { STX: 6, SBTC: 8 };
export const ASSET_LABEL: Record<AssetKey, string> = { STX: "STX", SBTC: "sBTC" };
export const BASE_UNIT_LABEL: Record<AssetKey, string> = { STX: "microSTX", SBTC: "sats" };

/**
 * Parses a user-typed decimal string into base units. Returns null for
 * anything that is not a plain non-negative decimal with at most `decimals`
 * fractional digits (no exponent notation, no signs, no separators) - so an
 * amount that cannot be represented exactly is rejected, never rounded.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const digits = `${whole || "0"}${frac.padEnd(decimals, "0")}`;
  return BigInt(digits);
}

/** Formats base units as an exact decimal string, trimming trailing zeros. */
export function formatUnits(value: bigint, decimals: number, opts: { minFraction?: number } = {}): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const min = opts.minFraction ?? 0;
  if (frac.length < min) frac = frac.padEnd(min, "0");
  const wholeStr = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

export function formatAsset(value: bigint, asset: AssetKey): string {
  return `${formatUnits(value, DECIMALS[asset])} ${ASSET_LABEL[asset]}`;
}

/** Receipt shares are integer base units of their share class (same scale as the underlying asset). */
export function formatShares(value: bigint): string {
  return value.toLocaleString("en-US");
}

/** value / total as a percentage string with exact bigint math (2 decimals, floored). */
export function percentOf(value: bigint, total: bigint): string {
  if (total <= 0n) return "0.00";
  const hundredths = (value * 10_000n) / total; // floor, in 1/100 %
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

/** Basis points as a percentage string, e.g. 3000 -> "30.00". */
export function bpsToPct(bps: bigint | number): string {
  const b = BigInt(bps);
  return `${b / 100n}.${(b % 100n).toString().padStart(2, "0")}`;
}

/** Percent (possibly decimal string like "12.5") to basis points; null if invalid or more than 2 decimals. */
export function pctToBps(pct: string): number | null {
  const v = parseUnits(pct, 2);
  return v === null ? null : Number(v);
}
