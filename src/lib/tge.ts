export type LegacyTgeStatus = "upcoming" | "released";

export type TgeLifecycleStatus =
  | "candidate"
  | "watchlist"
  | "confirmed_tge"
  | "trading_on_dex"
  | "listed_on_aggregator"
  | "graduated"
  | "rejected"
  | "stale";

export type TgeSignalType =
  | "tge"
  | "token_sale"
  | "airdrop"
  | "exchange_listing"
  | "dex_pool"
  | "aggregator_listing"
  | "mainnet"
  | "testnet"
  | "migration"
  | "funding"
  | "product"
  | "news"
  | "other";

export type TgeSourceType =
  | "official"
  | "news"
  | "funding_db"
  | "exchange"
  | "dex"
  | "aggregator"
  | "community"
  | "other";

export interface TgeSignal {
  type: TgeSignalType;
  sourceType: TgeSourceType;
  url: string;
  title?: string;
  observedAt: string;
  confidence?: number;
}

export interface TgeContract {
  chain: string;
  address: string;
}

export interface TgeOfficialLinks {
  website?: string;
  docs?: string;
  blog?: string;
  x?: string;
  telegram?: string;
  discord?: string;
  explorer?: string;
}

export interface TgeTokenomics {
  totalSupply?: string;
  initialSupply?: string;
  allocation?: string;
  vesting?: string;
  unlockSchedule?: string;
  utility?: string;
}

export interface TgeMarketEvidence {
  coingeckoId?: string;
  coingeckoRank?: number;
  rank?: number;
  priceUsd?: number;
  volume24h?: number;
  liquidityUsd?: number;
  fdvUsd?: number;
  dexId?: string;
  poolId?: string;
  poolCreatedAt?: string | null;
  matchedBy?: "id" | "contract" | "manual";
  verifiedAt?: string;
}

export interface UpcomingTge {
  id: string;
  name: string;
  symbol: string;
  category: string;
  expectedTge: string;
  narrativeStrength: number;
  dataSource: string;
  discoveredAt: string;
  status?: LegacyTgeStatus;
  lifecycleStatus?: TgeLifecycleStatus;
  confidence?: number;
  signals?: TgeSignal[];
  officialLinks?: TgeOfficialLinks;
  chains?: string[];
  contracts?: TgeContract[];
  tokenomics?: TgeTokenomics;
  lastVerifiedAt?: string;
  rejectedReason?: string;
  graduatedAt?: string;
  coingeckoRank?: number;
  graduationEvidence?: TgeMarketEvidence;
}

export const GENERIC_TGE_SYMBOLS = new Set(["", "TBD", "TBA", "N/A", "NA", "UNKNOWN"]);

export const TGE_STATUS_LABELS: Record<TgeLifecycleStatus, string> = {
  candidate: "Research Candidate",
  watchlist: "Watchlist",
  confirmed_tge: "Confirmed TGE",
  trading_on_dex: "Trading on DEX",
  listed_on_aggregator: "Aggregator Listed",
  graduated: "Graduated",
  rejected: "Rejected",
  stale: "Needs Recheck",
};

const STATUS_SORT_WEIGHT: Record<TgeLifecycleStatus, number> = {
  confirmed_tge: 0,
  trading_on_dex: 1,
  listed_on_aggregator: 2,
  watchlist: 3,
  candidate: 4,
  stale: 5,
  graduated: 6,
  rejected: 7,
};

const PUBLISHABLE_STATUSES = new Set<TgeLifecycleStatus>([
  "watchlist",
  "confirmed_tge",
  "trading_on_dex",
  "listed_on_aggregator",
  "graduated",
]);

const NEWS_HOSTS = [
  "airdropalert.com",
  "cointelegraph.com",
  "decrypt.co",
  "theblock.co",
  "blockworks.co",
  "coindesk.com",
  "icowatchlist.com",
];

const EXCHANGE_HOSTS = [
  "binance.com",
  "coinbase.com",
  "kraken.com",
  "okx.com",
  "bybit.com",
  "bitget.com",
  "kucoin.com",
];

const AGGREGATOR_HOSTS = [
  "coingecko.com",
  "coinmarketcap.com",
];

const DEX_HOSTS = [
  "geckoterminal.com",
  "dexscreener.com",
  "dextools.io",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isGenericTgeSymbol(symbol: string | null | undefined): boolean {
  return GENERIC_TGE_SYMBOLS.has((symbol || "").trim().toUpperCase());
}

export function getTgeSourceHost(url: string | null | undefined): string {
  if (!url) return "Source pending";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function inferTgeSourceType(url: string | null | undefined): TgeSourceType {
  const host = getTgeSourceHost(url).toLowerCase();
  if (!url || host === "Source pending") return "other";
  if (DEX_HOSTS.some((sourceHost) => host.endsWith(sourceHost))) return "dex";
  if (AGGREGATOR_HOSTS.some((sourceHost) => host.endsWith(sourceHost))) return "aggregator";
  if (EXCHANGE_HOSTS.some((sourceHost) => host.endsWith(sourceHost))) return "exchange";
  if (NEWS_HOSTS.some((sourceHost) => host.endsWith(sourceHost))) return host.includes("airdrop") ? "community" : "news";
  return "official";
}

export function inferTgeSignalType(input: {
  title?: string | null;
  expectedTge?: string | null;
  category?: string | null;
  url?: string | null;
}): TgeSignalType {
  const text = [input.title, input.expectedTge, input.category, input.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(tge|token generation|ico|ido|ieo)\b/.test(text)) return "tge";
  if (/\b(token sale|public sale|launchpad|sale round)\b/.test(text)) return "token_sale";
  if (/\b(airdrop|points|farming|incentive)\b/.test(text)) return "airdrop";
  if (/\b(exchange listing|listed on|cex listing|trading pair)\b/.test(text)) return "exchange_listing";
  if (/\b(dex|pool|liquidity|amm)\b/.test(text)) return "dex_pool";
  if (/\b(coingecko|coinmarketcap|aggregator)\b/.test(text)) return "aggregator_listing";
  if (/\bmainnet\b/.test(text)) return "mainnet";
  if (/\btestnet\b/.test(text)) return "testnet";
  if (/\b(migration|rebrand|swap)\b/.test(text)) return "migration";
  if (/\b(funding|raises|series|seed|valuation)\b/.test(text)) return "funding";
  if (/\b(product|protocol|platform|infrastructure|development stage)\b/.test(text)) return "product";
  return "news";
}

export function normalizeTgeSignals(tge: UpcomingTge): TgeSignal[] {
  const seen = new Set<string>();
  const signals: TgeSignal[] = [];

  for (const signal of tge.signals || []) {
    if (!signal?.url) continue;
    const key = signal.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push({
      type: signal.type || inferTgeSignalType({ title: signal.title, expectedTge: tge.expectedTge, category: tge.category, url: signal.url }),
      sourceType: signal.sourceType || inferTgeSourceType(signal.url),
      url: signal.url,
      title: signal.title,
      observedAt: signal.observedAt || tge.discoveredAt || new Date().toISOString(),
      confidence: signal.confidence,
    });
  }

  if (tge.dataSource && !seen.has(tge.dataSource.trim())) {
    signals.push({
      type: inferTgeSignalType({
        expectedTge: tge.expectedTge,
        category: tge.category,
        url: tge.dataSource,
      }),
      sourceType: inferTgeSourceType(tge.dataSource),
      url: tge.dataSource,
      observedAt: tge.discoveredAt || new Date().toISOString(),
    });
  }

  return signals;
}

export function isLikelyStaleExpectedTge(expectedTge: string | null | undefined, now = new Date()): boolean {
  const text = (expectedTge || "").toUpperCase();
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (!yearMatch) return false;

  const year = Number(yearMatch[1]);
  const currentYear = now.getUTCFullYear();
  if (year < currentYear) return true;
  if (year > currentYear) return false;

  const quarterMatch = text.match(/\bQ([1-4])\b/);
  if (!quarterMatch) return false;

  const quarter = Number(quarterMatch[1]);
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return quarter < currentQuarter;
}

export function scoreTgeConfidence(tge: UpcomingTge): number {
  if (tge.lifecycleStatus === "graduated" || tge.status === "released") return 95;
  if (tge.lifecycleStatus === "rejected") return 0;

  const signals = normalizeTgeSignals(tge);
  const signalTypes = new Set(signals.map((signal) => signal.type));
  const sourceTypes = new Set(signals.map((signal) => signal.sourceType));
  const expected = (tge.expectedTge || "").toLowerCase();
  let score = 20;

  if (signals.length > 0) score += 10;
  if (signals.length >= 2) score += 15;
  if (sourceTypes.has("official")) score += 30;
  if (sourceTypes.has("exchange")) score += 25;
  if (sourceTypes.has("aggregator")) score += 25;
  if (sourceTypes.has("dex")) score += 20;
  if (sourceTypes.has("news")) score += 8;
  if (sourceTypes.has("community")) score += 6;

  if (signalTypes.has("tge")) score += 25;
  if (signalTypes.has("token_sale")) score += 22;
  if (signalTypes.has("airdrop")) score += 18;
  if (signalTypes.has("exchange_listing")) score += 20;
  if (signalTypes.has("mainnet") || signalTypes.has("testnet")) score += 0;
  if (signalTypes.has("funding")) score += 6;
  if (signalTypes.has("product")) score -= 12;

  if (!isGenericTgeSymbol(tge.symbol)) score += 5;
  if (/\b(q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(tge.expectedTge || "")) score += 6;
  if (/\b(speculative|development stage|funding stage|infrastructure development|growth phase)\b/.test(expected)) score -= 18;
  if (isLikelyStaleExpectedTge(tge.expectedTge)) score -= 25;

  return clamp(Math.round(score), 0, 95);
}

export function deriveTgeLifecycleStatus(tge: UpcomingTge): TgeLifecycleStatus {
  if (tge.lifecycleStatus) return tge.lifecycleStatus;
  if (tge.status === "released" || tge.graduatedAt || tge.coingeckoRank) return "graduated";
  if (isLikelyStaleExpectedTge(tge.expectedTge)) return "stale";

  const confidence = tge.confidence ?? scoreTgeConfidence(tge);
  const signals = normalizeTgeSignals(tge);
  const signalTypes = new Set(signals.map((signal) => signal.type));
  const sourceTypes = new Set(signals.map((signal) => signal.sourceType));

  if (tge.graduationEvidence?.coingeckoId || sourceTypes.has("aggregator")) return "listed_on_aggregator";
  if (tge.graduationEvidence?.dexId || sourceTypes.has("dex")) return "trading_on_dex";

  const hasConfirmedLaunchSignal =
    signalTypes.has("tge") ||
    signalTypes.has("token_sale") ||
    signalTypes.has("exchange_listing") ||
    signalTypes.has("airdrop") ||
    signalTypes.has("migration") ||
    sourceTypes.has("official") ||
    sourceTypes.has("exchange");

  if (hasConfirmedLaunchSignal && confidence >= 65) return "confirmed_tge";
  if (confidence >= 45) return "watchlist";
  return "candidate";
}

export function normalizeTge(tge: UpcomingTge): UpcomingTge {
  const signals = normalizeTgeSignals(tge);
  const confidence = tge.confidence ?? scoreTgeConfidence({ ...tge, signals });
  const lifecycleStatus = deriveTgeLifecycleStatus({ ...tge, signals, confidence });
  const status: LegacyTgeStatus = lifecycleStatus === "graduated" ? "released" : "upcoming";

  return {
    ...tge,
    symbol: (tge.symbol || "TBD").toUpperCase(),
    narrativeStrength: clamp(Math.round(tge.narrativeStrength || 0), 0, 100),
    status,
    lifecycleStatus,
    confidence,
    signals,
    lastVerifiedAt: tge.lastVerifiedAt || tge.discoveredAt,
  };
}

export function getTgeSortWeight(tge: UpcomingTge): number {
  return STATUS_SORT_WEIGHT[deriveTgeLifecycleStatus(tge)];
}

export function shouldPublishTgePreview(tge: UpcomingTge): boolean {
  const normalized = normalizeTge(tge);
  if (normalized.lifecycleStatus === "rejected") return false;
  if (normalized.lifecycleStatus === "stale") return false;
  return Boolean(normalized.lifecycleStatus && PUBLISHABLE_STATUSES.has(normalized.lifecycleStatus));
}

export function isTgeGraduated(tge: UpcomingTge): boolean {
  const status = deriveTgeLifecycleStatus(tge);
  return status === "graduated" || status === "listed_on_aggregator";
}

export function hasVerifiedMarketEvidence(evidence: TgeMarketEvidence | null | undefined): boolean {
  if (!evidence) return false;
  const hasPrice = typeof evidence.priceUsd === "number" && evidence.priceUsd > 0;
  const hasAggregator = Boolean(evidence.coingeckoId);
  const hasDexDepth =
    (typeof evidence.liquidityUsd === "number" && evidence.liquidityUsd >= 10_000) ||
    (typeof evidence.volume24h === "number" && evidence.volume24h >= 10_000);
  return hasPrice && (hasAggregator || hasDexDepth) && evidence.matchedBy !== undefined && evidence.matchedBy !== "manual";
}

export function getTgeContractQueries(tge: UpcomingTge): string[] {
  return (tge.contracts || [])
    .map((contract) => contract.address?.trim())
    .filter((address): address is string => Boolean(address && /^0x[a-f0-9]{40}$/i.test(address)));
}

export function getTgeStatusLabel(tge: UpcomingTge): string {
  return TGE_STATUS_LABELS[deriveTgeLifecycleStatus(tge)];
}

export function getTgeEvidenceCount(tge: UpcomingTge): number {
  return normalizeTgeSignals(tge).length + (tge.contracts?.length || 0) + (tge.officialLinks?.website ? 1 : 0);
}
