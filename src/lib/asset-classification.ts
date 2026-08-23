import { STABLECOIN_IDS } from "./config";

export interface PeggedAssetCandidate {
  id?: string;
  symbol?: string;
  name?: string;
  categories?: string[];
  description?: string;
  price?: number | null;
  change24h?: number | null;
  change7d?: number | null;
  change30d?: number | null;
}

const PEGGED_CATEGORY_RE = /(?:stablecoin|fiat[- ]backed|asset[- ]backed|tokenized (?:treasur|money market)|gold[- ]backed|pegged asset)/i;
const PEGGED_DESCRIPTION_RE = /(?:\bstablecoin\b|\bpegged? to\b|\b1\s*[:\-]\s*1\b.{0,45}\b(?:dollar|usd|euro|eur|gold)\b|\bfully backed\b.{0,55}\b(?:dollar|fiat|treasur|gold)\b)/i;
const FIAT_IDENTITY_RE = /(?:^|[-_\s])(?:usd|eur|gbp|chf|jpy)(?:$|[-_\s])/i;
const FIAT_SYMBOL_RE = /^(?:USD[A-Z0-9]{0,5}|[A-Z0-9]{0,5}USD|EUR[A-Z0-9]{0,5}|[A-Z0-9]{0,5}EUR)$/i;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasStableOneUnitPriceProfile(candidate: PeggedAssetCandidate): boolean {
  if (!finite(candidate.price) || candidate.price < 0.97 || candidate.price > 1.03) return false;

  const observedChanges = [candidate.change24h, candidate.change7d, candidate.change30d].filter(finite);
  return observedChanges.length > 0 && observedChanges.every((change) => Math.abs(change) <= 2);
}

/**
 * Classifies assets that should not be treated as directional crypto movers.
 *
 * The static ID registry remains a fast, reviewed signal, while categories,
 * descriptions, fiat-like identity, and stable price behaviour catch newly
 * listed pegged assets before the registry is updated.
 */
export function getPeggedAssetReason(candidate: PeggedAssetCandidate): string | null {
  const id = (candidate.id || "").trim().toLowerCase();
  if (id && STABLECOIN_IDS.has(id)) return "reviewed-id";

  if ((candidate.categories || []).some((category) => PEGGED_CATEGORY_RE.test(category))) {
    return "category";
  }

  if (candidate.description && PEGGED_DESCRIPTION_RE.test(candidate.description)) {
    return "description";
  }

  const identity = `${candidate.id || ""} ${candidate.name || ""}`;
  const symbol = (candidate.symbol || "").replace(/[^A-Z0-9]/gi, "");
  if (
    hasStableOneUnitPriceProfile(candidate) &&
    (FIAT_IDENTITY_RE.test(identity) || FIAT_SYMBOL_RE.test(symbol))
  ) {
    return "fiat-identity-and-price-profile";
  }

  return null;
}

export function isPeggedAsset(candidate: PeggedAssetCandidate): boolean {
  return getPeggedAssetReason(candidate) !== null;
}
