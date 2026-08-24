import { SOCIAL_PLATFORM_LIMITS } from "./config";
import { formatCompact, formatPercent } from "./formatters";
import type { SocialContentArchetype } from "./social-archetypes";
import { sanitizePostTextLinks } from "./social-link-policy";
import type { SocialContentVariant } from "./social-variety";

export const INSTAGRAM_MOVER_POLICY = Object.freeze({
  minimumPriceChange24h: 2,
  maximumPriceChange24h: 100,
  minimumMarketCap: 50_000_000,
  minimumVolume24h: 5_000_000,
  minimumVolumeToMarketCap: 0.005,
  maximumVolumeToMarketCap: 1.5,
  requiredMoverCount: 5,
  maximumHashtags: 5,
});

export interface InstagramMoverCandidate {
  id: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  market: {
    price: number;
    priceChange24h: number;
    marketCap: number;
    marketCapRank: number;
    volume24h: number;
  };
}

export interface InstagramMover {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  rank: number;
  imageUrl?: string;
}

export type InstagramMoverRejectionReason =
  | "invalid-market-data"
  | "unsafe-display-text"
  | "below-move-floor"
  | "extreme-price-move"
  | "below-market-cap-floor"
  | "below-volume-floor"
  | "below-turnover-floor"
  | "extreme-turnover";

const DISPLAY_SAFE_TEXT_RE = /^[\x20-\x7E]+$/;

export function volumeToMarketCap(mover: Pick<InstagramMover, "marketCap" | "volume24h">): number {
  if (!Number.isFinite(mover.marketCap) || !Number.isFinite(mover.volume24h) || mover.marketCap <= 0) {
    return 0;
  }

  return mover.volume24h / mover.marketCap;
}

export function getInstagramMoverRejectionReasons(
  candidate: InstagramMoverCandidate,
): InstagramMoverRejectionReason[] {
  const { market } = candidate;
  const numericValues = [
    market.price,
    market.priceChange24h,
    market.marketCap,
    market.marketCapRank,
    market.volume24h,
  ];
  if (!numericValues.every(Number.isFinite) || market.price <= 0 || market.marketCapRank <= 0) {
    return ["invalid-market-data"];
  }

  const reasons: InstagramMoverRejectionReason[] = [];
  if (
    !candidate.symbol ||
    !candidate.name ||
    !DISPLAY_SAFE_TEXT_RE.test(candidate.symbol) ||
    !DISPLAY_SAFE_TEXT_RE.test(candidate.name)
  ) {
    reasons.push("unsafe-display-text");
  }
  if (market.priceChange24h < INSTAGRAM_MOVER_POLICY.minimumPriceChange24h) {
    reasons.push("below-move-floor");
  }
  if (market.priceChange24h > INSTAGRAM_MOVER_POLICY.maximumPriceChange24h) {
    reasons.push("extreme-price-move");
  }
  if (market.marketCap < INSTAGRAM_MOVER_POLICY.minimumMarketCap) {
    reasons.push("below-market-cap-floor");
  }
  if (market.volume24h < INSTAGRAM_MOVER_POLICY.minimumVolume24h) {
    reasons.push("below-volume-floor");
  }

  const turnover = market.volume24h / market.marketCap;
  if (turnover < INSTAGRAM_MOVER_POLICY.minimumVolumeToMarketCap) {
    reasons.push("below-turnover-floor");
  }
  if (turnover > INSTAGRAM_MOVER_POLICY.maximumVolumeToMarketCap) {
    reasons.push("extreme-turnover");
  }

  return reasons;
}

export function selectInstagramMovers(
  candidates: InstagramMoverCandidate[],
  recentlyPosted: ReadonlySet<string> = new Set(),
): InstagramMover[] {
  return candidates
    .filter((candidate) => !recentlyPosted.has(candidate.id))
    .filter((candidate) => getInstagramMoverRejectionReasons(candidate).length === 0)
    .sort((a, b) =>
      b.market.priceChange24h - a.market.priceChange24h ||
      b.market.volume24h - a.market.volume24h ||
      a.market.marketCapRank - b.market.marketCapRank
    )
    .slice(0, INSTAGRAM_MOVER_POLICY.requiredMoverCount)
    .map((candidate) => ({
      id: candidate.id,
      symbol: candidate.symbol,
      name: candidate.name,
      imageUrl: candidate.imageUrl,
      price: candidate.market.price,
      change24h: candidate.market.priceChange24h,
      marketCap: candidate.market.marketCap,
      volume24h: candidate.market.volume24h,
      rank: candidate.market.marketCapRank,
    }));
}

const CTA_BY_FAMILY: Record<string, (leaderSymbol: string) => string> = {
  "choose-the-filter": () => "Comment the filter you want compared next: turnover, market cap, or catalyst.",
  "watch-the-rotation": () => "Save this rotation map, then comment the sector you want checked next.",
  "pick-next-review": () => "Comment one ticker for the next evidence-first breakdown.",
  "name-invalidation": (leaderSymbol) =>
    `What would invalidate the ${leaderSymbol} move first? Comment the signal you watch.`,
  "apply-the-framework": () => "Save this filter and apply it before trusting the next mover list.",
  "check-the-source": () => "Save the source check, then comment the noisiest signal you usually reject.",
};

export function buildInstagramCarouselCta(
  archetype: Pick<SocialContentArchetype, "ctaFamily">,
  leaderSymbol: string,
): string {
  const cleanSymbol = leaderSymbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "LEADER";
  const buildCta = CTA_BY_FAMILY[archetype.ctaFamily];
  return buildCta
    ? buildCta(cleanSymbol)
    : `Save this scan and comment which ${cleanSymbol} metric should be checked next.`;
}

function buildCaptionHook(
  archetype: Pick<SocialContentArchetype, "hookFamily">,
  leader: InstagramMover,
): string {
  const symbol = leader.symbol.toUpperCase();
  const hooks: Record<string, string> = {
    "risk-first": `${symbol} leads the qualified movers, but the biggest candle is not automatically the safest setup.`,
    "map-the-market": `Today's filtered board shows where 24-hour momentum is concentrating, with ${symbol} in front.`,
    "explain-the-metric": `${symbol} leads on price change; turnover shows whether the move also has reported participation.`,
    "curated-list": `Five movers cleared the size, volume, and noise filters; ${symbol} leads the shortlist.`,
    "warning-label": `The raw gainer table was noisier than the five names that survived the filter.`,
    contrast: `${symbol} leads the price move, while volume-to-market-cap gives the more useful comparison.`,
  };

  return hooks[archetype.hookFamily] ||
    `${symbol} has the strongest 24-hour move among today's five qualified candidates.`;
}

function sanitizeHashtagSymbol(symbol: string): string | undefined {
  const clean = symbol.replace(/[^a-zA-Z0-9_]/g, "");
  return clean ? `#${clean.toUpperCase()}` : undefined;
}

export function buildInstagramMoverHashtags(
  movers: InstagramMover[],
  variant: Pick<SocialContentVariant, "key">,
): string[] {
  const variantTag: Record<string, string> = {
    momentum_watchlist: "#CryptoMomentum",
    volatility_filter: "#RiskManagement",
    rotation_radar: "#CryptoMarkets",
    quality_movers: "#CryptoData",
  };
  const symbolTags = movers.slice(0, 2).map((mover) => sanitizeHashtagSymbol(mover.symbol));
  const hashtags = [
    "#CryptoResearch",
    variantTag[variant.key] || "#MarketMovers",
    "#TokenRadar",
    ...symbolTags,
  ].filter((tag): tag is string => Boolean(tag));

  return [...new Set(hashtags)].slice(0, INSTAGRAM_MOVER_POLICY.maximumHashtags);
}

export function buildInstagramMoversCaption(
  movers: InstagramMover[],
  variant: Pick<SocialContentVariant, "key">,
  archetype: Pick<SocialContentArchetype, "hookFamily" | "ctaFamily">,
  marketDataAsOf: Date,
): string {
  if (movers.length < 2) {
    throw new Error("Instagram movers caption requires at least two qualified movers.");
  }

  const leader = movers[0];
  const runnerUp = movers[1];
  const cta = buildInstagramCarouselCta(archetype, leader.symbol);
  const turnoverPercent = volumeToMarketCap(leader) * 100;
  const caption = [
    buildCaptionHook(archetype, leader),
    `${leader.symbol.toUpperCase()} is ${formatPercent(leader.change24h)} over 24h on ${formatCompact(leader.volume24h)} reported volume versus a ${formatCompact(leader.marketCap)} market cap (${turnoverPercent.toFixed(1)}% turnover). ${runnerUp.symbol.toUpperCase()} ranks second at ${formatPercent(runnerUp.change24h)}.`,
    "Verdict: this is a filtered momentum lead, not a forecast or entry signal.",
    cta,
    `CoinGecko snapshot · ${marketDataAsOf.toISOString().slice(11, 16)} UTC. Research only; verify liquidity and catalyst quality.`,
    buildInstagramMoverHashtags(movers, variant).join(" "),
  ].join("\n\n");

  const sanitized = sanitizePostTextLinks(caption);
  return sanitized.length > SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT
    ? `${sanitized.slice(0, SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT - 3).trimEnd()}...`
    : sanitized;
}

export function buildInstagramCarouselAltTexts(movers: InstagramMover[]): string[] {
  if (movers.length < INSTAGRAM_MOVER_POLICY.requiredMoverCount) {
    throw new Error(`Instagram carousel alt text requires ${INSTAGRAM_MOVER_POLICY.requiredMoverCount} movers.`);
  }

  const leader = movers[0];
  const runnerUp = movers[1];
  return [
    `Verdict slide: ${leader.name} (${leader.symbol.toUpperCase()}) leads the five qualified movers at ${formatPercent(leader.change24h)} over 24 hours.`,
    `Evidence board ranking ${movers.map((mover, index) => `${index + 1}. ${mover.name} ${formatPercent(mover.change24h)}`).join("; ")}.`,
    `Evidence comparison: ${leader.symbol.toUpperCase()} leads ${runnerUp.symbol.toUpperCase()} on 24-hour price change, with reported volume and market-cap turnover shown for context.`,
    "Risk slide explaining that reported turnover, catalysts, liquidity, and follow-through must be verified before interpreting a large daily move.",
    "Call-to-action slide inviting readers to save the research filter and choose the next evidence check.",
  ];
}
