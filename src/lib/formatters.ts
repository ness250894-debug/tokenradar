/**
 * Pure utility formatters for currency and numbers.
 * Safe for use in both Server and Client Components.
 */

/** Format price for display. */
export function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || price < 0) return "$0.00";
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/** Format large numbers compactly. */
export function formatCompact(value: number | undefined | null): string {
  if (value === undefined || value === null) return "$0.00";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/** Format supply numbers. */
export function formatSupply(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}
