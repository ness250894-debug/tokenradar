export type SocialResearchSnapshot = {
  version: 1;
  tokenId: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  marketDataSource: "coingecko-live";
  marketDataAsOf: string;
};

/** Store typed observations, never extract historical prices from generated prose. */
export function createResearchSnapshot(input: {
  id: string;
  name: string;
  symbol: string;
  marketDataSource?: string;
  lastMarketUpdate?: string;
  fetchedAt?: string;
  market: { price?: number | null; marketCap?: number | null; volume24h?: number | null; priceChange24h?: number | null };
}): SocialResearchSnapshot | undefined {
  const { market } = input;
  const asOf = input.lastMarketUpdate || input.fetchedAt;
  if (input.marketDataSource !== "coingecko-live" || !asOf || !Number.isFinite(Date.parse(asOf))) return undefined;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(input.id)
    || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,14}$/.test(input.symbol)
    || !/^[\p{L}\p{N}][\p{L}\p{N} .,'’()&+/_-]{0,79}$/u.test(input.name)) return undefined;
  if (![market.price, market.marketCap, market.volume24h, market.priceChange24h].every((value) => typeof value === "number" && Number.isFinite(value))
    || market.price! <= 0 || market.marketCap! <= 0 || market.volume24h! < 0) return undefined;
  return {
    version: 1, tokenId: input.id, name: input.name, symbol: input.symbol.toUpperCase(),
    price: market.price!, marketCap: market.marketCap!, volume24h: market.volume24h!, priceChange24h: market.priceChange24h!,
    marketDataSource: "coingecko-live", marketDataAsOf: new Date(asOf).toISOString(),
  };
}

export function parseResearchSnapshot(value: unknown): SocialResearchSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<SocialResearchSnapshot>;
  if (record.version !== 1 || typeof record.tokenId !== "string" || typeof record.name !== "string"
    || typeof record.symbol !== "string" || typeof record.marketDataAsOf !== "string") return undefined;
  return createResearchSnapshot({
    id: record.tokenId, name: record.name, symbol: record.symbol,
    marketDataSource: record.marketDataSource, lastMarketUpdate: record.marketDataAsOf,
    market: record,
  });
}
