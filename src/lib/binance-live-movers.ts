export interface BinanceMiniTicker {
  e?: string;
  E?: number;
  s: string;
  c: string;
  o: string;
  h?: string;
  l?: string;
  v?: string;
  q?: string;
}

export interface BinanceTokenReference {
  id: string;
  name: string;
  symbol: string;
  image?: string;
  imageUrl?: string;
  marketCap?: number;
  rank?: number;
}

export interface BinanceLiveMover {
  pairSymbol: string;
  baseSymbol: string;
  price: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
  eventTime?: number;
  tokenId?: string;
  tokenName?: string;
  tokenImageUrl?: string;
}

export interface BinanceLiveMoversResult {
  gainers: BinanceLiveMover[];
  losers: BinanceLiveMover[];
  totalTracked: number;
  updatedAt?: string;
}

export interface BinanceLiveMoversOptions {
  limit?: number;
  minQuoteVolume?: number;
  quoteAsset?: string;
}

const DEFAULT_LIMIT = 3;
const DEFAULT_MIN_QUOTE_VOLUME = 100_000;
const DEFAULT_QUOTE_ASSET = "USDT";

const STABLE_BASE_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "FDUSD",
  "TUSD",
  "BUSD",
  "DAI",
  "USDP",
  "PYUSD",
  "USDS",
  "USD1",
  "UST",
  "USTC",
  "EUR",
  "EURI",
  "AEUR",
]);

function parsePositiveNumber(value: string | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function getBaseSymbol(pairSymbol: string, quoteAsset: string): string | null {
  const normalizedPair = pairSymbol.trim().toUpperCase();
  const normalizedQuote = quoteAsset.trim().toUpperCase();
  if (!normalizedPair.endsWith(normalizedQuote)) return null;
  const baseSymbol = normalizedPair.slice(0, -normalizedQuote.length);
  return baseSymbol.length > 0 ? baseSymbol : null;
}

function buildTokenReferenceMap(tokens: readonly BinanceTokenReference[]): Map<string, BinanceTokenReference> {
  const map = new Map<string, BinanceTokenReference>();

  for (const token of tokens) {
    const symbol = token.symbol.trim().toUpperCase();
    if (!symbol) continue;

    const current = map.get(symbol);
    if (!current) {
      map.set(symbol, token);
      continue;
    }

    const tokenMarketCap = token.marketCap ?? 0;
    const currentMarketCap = current.marketCap ?? 0;
    const tokenRank = token.rank ?? Number.POSITIVE_INFINITY;
    const currentRank = current.rank ?? Number.POSITIVE_INFINITY;

    if (tokenMarketCap > currentMarketCap || (tokenMarketCap === currentMarketCap && tokenRank < currentRank)) {
      map.set(symbol, token);
    }
  }

  return map;
}

function toLiveMover(
  ticker: BinanceMiniTicker,
  quoteAsset: string,
  minQuoteVolume: number,
  tokenMap: ReadonlyMap<string, BinanceTokenReference>,
): BinanceLiveMover | null {
  const pairSymbol = ticker.s.trim().toUpperCase();
  const baseSymbol = getBaseSymbol(pairSymbol, quoteAsset);
  if (!baseSymbol || STABLE_BASE_SYMBOLS.has(baseSymbol)) return null;

  const openPrice = parsePositiveNumber(ticker.o);
  const price = parsePositiveNumber(ticker.c);
  const quoteVolume = parsePositiveNumber(ticker.q);
  if (!openPrice || !price || !quoteVolume || quoteVolume < minQuoteVolume) return null;

  const token = tokenMap.get(baseSymbol);
  const change24h = roundPercent(((price - openPrice) / openPrice) * 100);

  return {
    pairSymbol,
    baseSymbol,
    price,
    openPrice,
    change24h,
    quoteVolume,
    eventTime: typeof ticker.E === "number" ? ticker.E : undefined,
    tokenId: token?.id,
    tokenName: token?.name,
    tokenImageUrl: token?.imageUrl || token?.image,
  };
}

export function selectBinanceLiveMovers(
  tickers: readonly BinanceMiniTicker[],
  tokens: readonly BinanceTokenReference[],
  options: BinanceLiveMoversOptions = {},
): BinanceLiveMoversResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minQuoteVolume = options.minQuoteVolume ?? DEFAULT_MIN_QUOTE_VOLUME;
  const quoteAsset = options.quoteAsset ?? DEFAULT_QUOTE_ASSET;
  const tokenMap = buildTokenReferenceMap(tokens);
  const deduped = new Map<string, BinanceLiveMover>();

  for (const ticker of tickers) {
    const mover = toLiveMover(ticker, quoteAsset, minQuoteVolume, tokenMap);
    if (mover) deduped.set(mover.pairSymbol, mover);
  }

  const movers = Array.from(deduped.values());
  const updatedAtMs = movers.reduce<number | undefined>((latest, mover) => {
    if (typeof mover.eventTime !== "number") return latest;
    return latest === undefined || mover.eventTime > latest ? mover.eventTime : latest;
  }, undefined);

  return {
    gainers: movers
      .filter((mover) => mover.change24h > 0)
      .sort((a, b) => b.change24h - a.change24h || b.quoteVolume - a.quoteVolume)
      .slice(0, limit),
    losers: movers
      .filter((mover) => mover.change24h < 0)
      .sort((a, b) => a.change24h - b.change24h || b.quoteVolume - a.quoteVolume)
      .slice(0, limit),
    totalTracked: movers.length,
    updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : undefined,
  };
}
