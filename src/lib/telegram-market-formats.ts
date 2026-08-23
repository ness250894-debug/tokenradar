import { formatCompact, formatPercent, formatPrice } from "./formatters";

export const TELEGRAM_MARKET_FORMATS = [
  "market-brief",
  "market-pulse",
  "radar-divergence",
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
  sourceLabel?: string;
}

export interface TelegramMarketPulseImageData {
  title: string;
  subtitle: string;
  generatedAtLabel: string;
  sourceLabel: string;
  globalStats: string;
  sectorLines: string[];
  featuredToken: {
    symbol: string;
    name: string;
    priceChange24h: number;
    marketCapRank: number;
    riskScore?: number;
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
        risk?: number;
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

export interface RadarDivergenceRead {
  label: string;
  implication: string;
  invalidation: string;
  volumeToMarketCapPercent: number | null;
}

const DEFAULT_GLOBAL_STATS = "Global market feed unavailable.";
const DEFAULT_SECTORS = "Sector feed unavailable.";

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
      return "the CoinGecko trending list";
    case "trending-x":
      return "the supplied X discovery list";
    case "newly-published":
      return "fresh TokenRadar coverage";
    case "top-gainer":
      return "the highest eligible supplied 24h change";
    case "safe-play":
      return "the configured selection filter";
    default:
      return "the configured daily selection";
  }
}

function volumeToCapPercent(volume24h: number, marketCap: number): number | null {
  if (!Number.isFinite(volume24h) || !Number.isFinite(marketCap) || marketCap <= 0) {
    return null;
  }

  return volume24h / marketCap * 100;
}

export function getRadarDivergenceRead(token: TelegramMarketToken): RadarDivergenceRead {
  const participation = volumeToCapPercent(token.volume24h, token.marketCap);
  return {
    label: "Point-in-time field comparison",
    implication: "This view compares the supplied 24h change, reported 24h volume, market cap, and risk score.",
    invalidation: "Refresh the market snapshot before making a later comparison.",
    volumeToMarketCapPercent: participation,
  };
}

function riskLabel(score: number | undefined): string {
  return score === undefined ? "N/A" : `${score}/10`;
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
      risk: token.riskScore,
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
    sourceLabel: cleanText(context.sourceLabel, "Market snapshot"),
    globalStats: cleanText(context.globalStats, DEFAULT_GLOBAL_STATS),
    sectorLines: splitSectorLines(context.sectorPerformance),
    featuredToken: {
      symbol: token.symbol.toUpperCase(),
      name: token.name,
      priceChange24h: token.priceChange24h || 0,
      marketCapRank: token.marketCapRank || 0,
      riskScore: token.riskScore,
    },
  };
}

function radarDivergenceImageData(
  token: TelegramMarketToken,
  context: TelegramMarketContext,
  read: RadarDivergenceRead,
): TelegramMarketPulseImageData {
  const participation = read.volumeToMarketCapPercent === null
    ? "Turnover: unavailable"
    : `Volume / market cap: ${read.volumeToMarketCapPercent.toFixed(1)}%`;

  return {
    title: "Radar Divergence",
    subtitle: "Momentum vs participation vs risk",
    generatedAtLabel: formatUtcDate(context.generatedAt ?? new Date()),
    sourceLabel: cleanText(context.sourceLabel, "Market snapshot"),
    globalStats: `Read: ${read.label}`,
    sectorLines: [
      `24h move: ${formatPercent(token.priceChange24h)}`,
      participation,
      `Risk score: ${riskLabel(token.riskScore)}`,
    ],
    featuredToken: {
      symbol: token.symbol.toUpperCase(),
      name: token.name,
      priceChange24h: token.priceChange24h || 0,
      marketCapRank: token.marketCapRank || 0,
      riskScore: token.riskScore,
    },
  };
}

function buildRadarDivergenceCaption(token: TelegramMarketToken): string {
  const symbol = token.symbol.toUpperCase();
  const read = getRadarDivergenceRead(token);
  return [
    `<b>Radar Divergence: $${symbol}</b>`,
    `24h change: ${formatPercent(token.priceChange24h)} | Rank #${token.marketCapRank || "N/A"}.`,
    `Reported 24h volume: ${formatCompact(token.volume24h)} | Market cap: ${formatCompact(token.marketCap)}.`,
    `Risk score: ${riskLabel(token.riskScore)}.`,
    `<b>${read.label}</b>. ${read.implication}`,
  ].join("\n");
}

function buildMarketPulseCaption(token: TelegramMarketToken, context: TelegramMarketContext): string {
  void context;
  const symbol = token.symbol.toUpperCase();

  return [
    "<b>Market Pulse</b>",
    `Watch item: <b>$${symbol}</b> | 24h change: ${formatPercent(token.priceChange24h)} | Rank #${token.marketCapRank || "N/A"}.`,
    `Reported 24h volume: ${formatCompact(token.volume24h)} | Market cap: ${formatCompact(token.marketCap)}.`,
    `Risk score: ${riskLabel(token.riskScore)}.`,
  ].join("\n");
}

function buildWatchlistCheckCaption(token: TelegramMarketToken): string {
  const symbol = token.symbol.toUpperCase();
  return [
    "<b>Watchlist Check</b>",
    `<b>$${symbol} ${token.name}</b>`,
    `Why now: ${reasonLabel(token.selectionReason)}.`,
    `Move: ${formatPercent(token.priceChange24h)} in 24h | Price: ${formatPrice(token.price)} | Rank #${token.marketCapRank || "N/A"}.`,
    `Risk score: ${riskLabel(token.riskScore)} | Reported 24h volume: ${formatCompact(token.volume24h)}.`,
    `Market cap: ${formatCompact(token.marketCap)}.`,
  ].join("\n");
}

function buildMarketBriefCaption(token: TelegramMarketToken, context: TelegramMarketContext): string {
  const symbol = token.symbol.toUpperCase();
  void context;

  return [
    `<b>Radar Read: $${symbol}</b>`,
    `${token.name} is on radar for ${reasonLabel(token.selectionReason)}.`,
    `Snapshot: ${formatPercent(token.priceChange24h)} 24h change, ${formatCompact(token.marketCap)} market cap, ${formatCompact(token.volume24h)} reported 24h volume.`,
    `Risk score: ${riskLabel(token.riskScore)} | Rank #${token.marketCapRank || "N/A"}.`,
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

  if (format === "radar-divergence") {
    const read = getRadarDivergenceRead(token);
    return {
      format,
      captionBody: buildRadarDivergenceCaption(token),
      image: { kind: "market-pulse", data: radarDivergenceImageData(token, context, read) },
      variantKey: "radar_divergence",
      variantLabel: "Radar Divergence",
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
