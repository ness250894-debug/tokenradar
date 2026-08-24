export const MAX_MARKET_DATA_AGE_DAYS = 7;
export const MAX_TRUSTED_24H_CHANGE_PERCENT = 1000;
export const CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const CATEGORY_INPUT_BUILD_HEADROOM_MS = 60 * 60 * 1000;
export const CATEGORY_INPUT_SELECTION_MAX_AGE_MS =
  CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS - CATEGORY_INPUT_BUILD_HEADROOM_MS;

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

/** Preserve provider observation provenance without inventing a fetch-time timestamp. */
export function resolveProviderMarketTimestamp(
  providerTimestamp: unknown,
  previousProviderTimestamp?: unknown,
): string | undefined {
  for (const value of [providerTimestamp, previousProviderTimestamp]) {
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return undefined;
}

type TimestampedMarketRecord = Record<string, unknown> & {
  market?: unknown;
  lastMarketUpdate?: unknown;
};

/** Merge refreshed metadata without replacing a newer provider-observed market snapshot. */
export function mergeTokenRecordWithNewestMarketSnapshot<
  TExisting extends TimestampedMarketRecord,
  TIncoming extends TimestampedMarketRecord,
>(existing: TExisting, incoming: TIncoming): TExisting & TIncoming {
  const existingTimestamp = resolveProviderMarketTimestamp(existing.lastMarketUpdate);
  const incomingTimestamp = resolveProviderMarketTimestamp(incoming.lastMarketUpdate);
  const existingHasMarket = existing.market !== undefined && existing.market !== null;
  const incomingHasMarket = incoming.market !== undefined && incoming.market !== null;
  const keepExistingMarket = existingHasMarket && (
    !incomingHasMarket
    || !incomingTimestamp
    || Boolean(existingTimestamp && Date.parse(existingTimestamp) >= Date.parse(incomingTimestamp))
  );
  const merged: TimestampedMarketRecord = { ...existing, ...incoming };

  if (keepExistingMarket) {
    merged.market = existing.market;
    merged.lastMarketUpdate = existingTimestamp;
  } else if (incomingTimestamp) {
    merged.lastMarketUpdate = incomingTimestamp;
  } else {
    delete merged.lastMarketUpdate;
  }

  return merged as TExisting & TIncoming;
}

/** Return the newest valid observation timestamp without substituting ingestion time. */
export function newestValidObservationTimestamp(values: unknown[]): string | undefined {
  let newest = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const parsed = typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;
    const timestamp = Number.isFinite(parsed) ? new Date(parsed).getTime() : NaN;
    if (Number.isFinite(timestamp) && timestamp > newest) newest = timestamp;
  }
  return Number.isFinite(newest) ? new Date(newest).toISOString() : undefined;
}

export type PriceHistoryObservationInput = {
  priceHistoryAsOf?: unknown;
  chart30d?: unknown;
};

/**
 * Resolve the provider observation time for the 30-day history used by derived
 * metrics. Ingestion time and filesystem metadata are deliberately excluded:
 * a checkout or cache restore must never make old observations look fresh.
 */
export function resolvePriceHistoryObservationTimestamp(
  priceData: PriceHistoryObservationInput,
): string | undefined {
  const chart30d = Array.isArray(priceData.chart30d) ? priceData.chart30d : [];
  const chartTimestamp = newestValidObservationTimestamp(
    chart30d.map((point) =>
      point && typeof point === "object"
        ? (point as { date?: unknown }).date
        : undefined
    ),
  );
  return chartTimestamp || resolveProviderMarketTimestamp(priceData.priceHistoryAsOf);
}

export function getPriceHistoryObservationAgeMs(
  priceData: PriceHistoryObservationInput,
  now: Date = new Date(),
): number {
  const timestamp = resolvePriceHistoryObservationTimestamp(priceData);
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const ageMs = now.getTime() - Date.parse(timestamp);
  // Small provider/runner clock differences are harmless. A materially future
  // observation is invalid and should be repaired rather than trusted forever.
  if (ageMs < -2 * 60 * 1000) return Number.POSITIVE_INFINITY;
  return Math.max(0, ageMs);
}

export function normalizeObservedPricePoints(value: unknown): Array<{ date: string; price: number }> {
  if (!Array.isArray(value)) return [];
  const normalized: Array<{ date: string; price: number }> = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const date = newestValidObservationTimestamp([point[0]]);
    const price = point[1];
    if (!date || typeof price !== "number" || !Number.isFinite(price)) continue;
    normalized.push({ date, price });
  }
  return normalized;
}

export function getMarketDataTimestamp(token: TokenMarketDataInput): string | null {
  for (const value of [token.lastMarketUpdate, token.fetchedAt]) {
    if (typeof value !== "string") continue;
    const candidate = value.trim();
    if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
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
