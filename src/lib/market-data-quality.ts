export const MAX_MARKET_DATA_AGE_DAYS = 7;
export const MAX_TRUSTED_24H_CHANGE_PERCENT = 1000;

const MAX_MARKET_DATA_AGE_MS = MAX_MARKET_DATA_AGE_DAYS * 24 * 60 * 60 * 1000;

type MarketLike = {
  price?: unknown;
  marketCap?: unknown;
  volume24h?: unknown;
  priceChange24h?: unknown;
};

export type MarketDataQualityIssue =
  | "missing-market"
  | "empty-market"
  | "invalid-market-value"
  | "missing-market-timestamp"
  | "stale-market-data"
  | "extreme-24h-change";

export type TokenMarketDataInput = {
  id?: unknown;
  market?: MarketLike | null;
  fetchedAt?: unknown;
  lastMarketUpdate?: unknown;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function getMarketDataTimestamp(token: TokenMarketDataInput): string | null {
  if (typeof token.lastMarketUpdate === "string" && token.lastMarketUpdate.trim()) {
    return token.lastMarketUpdate;
  }

  if (typeof token.fetchedAt === "string" && token.fetchedAt.trim()) {
    return token.fetchedAt;
  }

  return null;
}

export function getMarketDataQualityIssues(
  token: TokenMarketDataInput,
  now: Date = new Date(),
): MarketDataQualityIssue[] {
  const issues: MarketDataQualityIssue[] = [];
  const market = token.market;

  if (!market || typeof market !== "object") {
    return ["missing-market"];
  }

  const price = toFiniteNumber(market.price);
  const marketCap = toFiniteNumber(market.marketCap);
  const volume24h = toFiniteNumber(market.volume24h);
  const priceChange24h = toFiniteNumber(market.priceChange24h);

  if (
    (market.price !== undefined && price === null) ||
    (market.marketCap !== undefined && marketCap === null) ||
    (market.volume24h !== undefined && volume24h === null) ||
    (market.priceChange24h !== undefined && priceChange24h === null)
  ) {
    issues.push("invalid-market-value");
  }

  const hasMarket =
    (price ?? 0) > 0 ||
    (marketCap ?? 0) > 0 ||
    (volume24h ?? 0) > 0;

  if (!hasMarket) {
    issues.push("empty-market");
  }

  const timestamp = getMarketDataTimestamp(token);
  const parsedTimestamp = timestamp ? Date.parse(timestamp) : NaN;

  if (!timestamp || Number.isNaN(parsedTimestamp)) {
    issues.push("missing-market-timestamp");
  } else if (now.getTime() - parsedTimestamp > MAX_MARKET_DATA_AGE_MS) {
    issues.push("stale-market-data");
  }

  if (priceChange24h !== null && Math.abs(priceChange24h) > MAX_TRUSTED_24H_CHANGE_PERCENT) {
    issues.push("extreme-24h-change");
  }

  return issues;
}

export function isTrustedTokenMarketData(
  token: TokenMarketDataInput,
  now: Date = new Date(),
): boolean {
  return getMarketDataQualityIssues(token, now).length === 0;
}
