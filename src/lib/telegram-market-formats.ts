import { formatCompact, formatPercent, formatPrice, getRiskTier } from "./formatters";

export const TELEGRAM_MARKET_FORMATS = [
  "market-brief",
  "market-pulse",
  "watchlist-check",
] as const;

export type TelegramMarketFormat = (typeof TELEGRAM_MARKET_FORMATS)[number];

export interface TelegramMarketToken {
  id: string;
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  marketCapRank: number;
  riskScore?: number;
  selectionReason?: string;
}

export interface TelegramMarketContext {
  globalStats?: string;
  sectorPerformance?: string;
  generatedAt?: Date;
}

export interface TelegramMarketPulseImageData {
  title: string;
  subtitle: string;
  generatedAtLabel: string;
  globalStats: string;
  sectorLines: string[];
  featuredToken: {
    symbol: string;
    name: string;
    priceChange24h: number;
    marketCapRank: number;
    riskScore: number;
  };
}

export type TelegramMarketPostImage =
  | { kind: "market-pulse"; data: TelegramMarketPulseImageData }
  | {
      kind: "token-card";
      data: {
        symbol: string;
        name: string;
        marketCap: number;
        volume24h: number;
        rank: number;
        risk: number;
      };
    };

export interface TelegramMarketPostDraft {
  format: TelegramMarketFormat;
  captionBody: string;
  image: TelegramMarketPostImage;
  variantKey: string;
  variantLabel: string;
  variantSurface: string;
}

const DEFAULT_GLOBAL_STATS = "Global market feed unavailable; using token-level context.";
const DEFAULT_SECTORS = "Sector feed unavailable; focus on liquidity and follow-through.";

export function parseTelegramMarketFormat(value: string | undefined): TelegramMarketFormat {
  if (!value) return "market-brief";
  const normalized = value.trim().toLowerCase();
  if (TELEGRAM_MARKET_FORMATS.includes(normalized as TelegramMarketFormat)) {
    return normalized as TelegramMarketFormat;
  }

  throw new Error(
    `Invalid --format value. Expected one of: ${TELEGRAM_MARKET_FORMATS.join(", ")}.`,
  );
}

export function getTelegramMarketVariantSurface(format: TelegramMarketFormat): string {
  return format === "market-brief" ? "market-update" : `market-update:${format}`;
}

function cleanText(value: string | undefined, fallback: string): string {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function splitSectorLines(sectorPerformance: string | undefined): string[] {
  const raw = cleanText(sectorPerformance, DEFAULT_SECTORS);
  const sectors = raw
    .split(",")
    .map((sector) => sector.trim())
    .filter(Boolean);
  return sectors.length > 0 ? sectors.slice(0, 3) : [DEFAULT_SECTORS];
}

function formatUtcDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function reasonLabel(reason: string | undefined): string {
  switch (reason) {
    case "trending-coingecko":
      return "CoinGecko search momentum";
    case "trending-x":
      return "social momentum";
    case "newly-published":
      return "fresh TokenRadar coverage";
    case "top-gainer":
      return "24h relative strength";
    case "safe-play":
      return "lower risk profile";
    default:
      return "rotation watch";
  }
}

function volumeToCapLabel(volume24h: number, marketCap: number): string {
  if (!Number.isFinite(volume24h) || !Number.isFinite(marketCap) || marketCap <= 0) {
    return "volume/market-cap ratio unavailable";
  }

  return `${(volume24h / marketCap * 100).toFixed(1)}% volume/market-cap`;
}

function riskLabel(score: number): string {
  return `${getRiskTier(score)} (${score}/10)`;
}

function tokenImageData(token: TelegramMarketToken): Extract<TelegramMarketPostImage, { kind: "token-card" }> {
  return {
    kind: "token-card",
    data: {
      symbol: token.symbol.toUpperCase(),
      name: token.name,
      marketCap: token.marketCap || 0,
      volume24h: token.volume24h || 0,
      rank: token.marketCapRank || 0,
      risk: token.riskScore ?? 5,
    },
  };
}

function marketPulseImageData(
  token: TelegramMarketToken,
  context: TelegramMarketContext,
): TelegramMarketPulseImageData {
  return {
    title: "Market Pulse",
    subtitle: "Macro, sector, and watchlist context",
    generatedAtLabel: formatUtcDate(context.generatedAt ?? new Date()),
    globalStats: cleanText(context.globalStats, DEFAULT_GLOBAL_STATS),
    sectorLines: splitSectorLines(context.sectorPerformance),
    featuredToken: {
      symbol: token.symbol.toUpperCase(),
      name: token.name,
      priceChange24h: token.priceChange24h || 0,
      marketCapRank: token.marketCapRank || 0,
      riskScore: token.riskScore ?? 5,
    },
  };
}

function buildMarketPulseCaption(token: TelegramMarketToken, context: TelegramMarketContext): string {
  const globalStats = cleanText(context.globalStats, DEFAULT_GLOBAL_STATS);
  const sectorPerformance = splitSectorLines(context.sectorPerformance).join(", ");
  const symbol = token.symbol.toUpperCase();

  return [
    "<b>Market Pulse</b>",
    `Market: ${globalStats}`,
    `Sectors: ${sectorPerformance}`,
    `Watch item: <b>$${symbol}</b> is ${formatPercent(token.priceChange24h)} over 24h, rank #${token.marketCapRank || "N/A"}.`,
    `Use it: compare the sector move with volume and risk before assuming follow-through.`,
  ].join("\n");
}

function buildWatchlistCheckCaption(token: TelegramMarketToken): string {
  const symbol = token.symbol.toUpperCase();
  const riskScore = token.riskScore ?? 5;

  return [
    "<b>Watchlist Check</b>",
    `<b>$${symbol} ${token.name}</b>`,
    `Why now: ${reasonLabel(token.selectionReason)}.`,
    `Move: ${formatPercent(token.priceChange24h)} in 24h | Price: ${formatPrice(token.price)} | Rank #${token.marketCapRank || "N/A"}.`,
    `Risk: ${riskLabel(riskScore)} | Liquidity: ${volumeToCapLabel(token.volume24h, token.marketCap)}.`,
    `Invalidation: interest weakens if volume contracts while the move stops making progress.`,
  ].join("\n");
}

function buildMarketBriefCaption(token: TelegramMarketToken, context: TelegramMarketContext): string {
  const symbol = token.symbol.toUpperCase();
  const globalStats = cleanText(context.globalStats, DEFAULT_GLOBAL_STATS);

  return [
    `<b>Radar Read: $${symbol}</b>`,
    `${token.name} is on radar for ${reasonLabel(token.selectionReason)}.`,
    `Market context: ${globalStats}`,
    `Snapshot: ${formatPercent(token.priceChange24h)} 24h, ${formatCompact(token.marketCap)} market cap, ${formatCompact(token.volume24h)} volume.`,
  ].join("\n");
}

export function buildTelegramMarketPost(options: {
  format: TelegramMarketFormat;
  token: TelegramMarketToken;
  context: TelegramMarketContext;
}): TelegramMarketPostDraft {
  const { format, token, context } = options;

  if (format === "market-pulse") {
    return {
      format,
      captionBody: buildMarketPulseCaption(token, context),
      image: { kind: "market-pulse", data: marketPulseImageData(token, context) },
      variantKey: "market_pulse",
      variantLabel: "Market Pulse",
      variantSurface: getTelegramMarketVariantSurface(format),
    };
  }

  if (format === "watchlist-check") {
    return {
      format,
      captionBody: buildWatchlistCheckCaption(token),
      image: tokenImageData(token),
      variantKey: "watchlist_check",
      variantLabel: "Watchlist Check",
      variantSurface: getTelegramMarketVariantSurface(format),
    };
  }

  return {
    format,
    captionBody: buildMarketBriefCaption(token, context),
    image: tokenImageData(token),
    variantKey: "market_brief",
    variantLabel: "Market Brief",
    variantSurface: getTelegramMarketVariantSurface(format),
  };
}
