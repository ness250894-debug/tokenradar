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
    candidate.symbol.length > 15 ||
    candidate.name.length > 80 ||
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

export interface InstagramMoverLesson {
  key: "turnover_contrast" | "turnover_alignment" | "turnover_basics";
  headline: string;
  leader: InstagramMover;
  peer: InstagramMover;
  explanation: string;
}

export function buildInstagramMoverLesson(movers: InstagramMover[]): InstagramMoverLesson {
  if (movers.length < 2) throw new Error("A carousel lesson requires at least two movers.");
  const leader = movers[0];
  const peer = [...movers.slice(1)].sort((left, right) => volumeToMarketCap(right) - volumeToMarketCap(left))[0];
  const leaderTurnover = Number((volumeToMarketCap(leader) * 100).toFixed(1));
  const peerTurnover = Number((volumeToMarketCap(peer) * 100).toFixed(1));
  const contrast = peerTurnover > leaderTurnover && leader.change24h > peer.change24h;
  const alignment = leaderTurnover > peerTurnover && leader.change24h > peer.change24h;
  return {
    key: contrast ? "turnover_contrast" : alignment ? "turnover_alignment" : "turnover_basics",
    headline: contrast
      ? `${leader.symbol.toUpperCase()} rose faster. ${peer.symbol.toUpperCase()} had higher turnover.`
      : alignment ? `${leader.symbol.toUpperCase()} led price change and turnover. What does that mean?`
        : `${leader.symbol.toUpperCase()} moved ${formatPercent(leader.change24h)}. Learn to read its turnover.`,
    leader,
    peer,
    explanation: "Turnover compares reported trading volume with market cap. Assessing liquidity also needs spreads and depth.",
  };
}

export function buildInstagramCarouselCta(
  archetype: Pick<SocialContentArchetype, "ctaFamily">,
  _leaderSymbol: string,
): string {
  return archetype.ctaFamily === "choose-the-filter" || archetype.ctaFamily === "pick-next-review"
    ? "Which check should we explain next: spread or depth?"
    : "Save the four-field research checklist.";
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

  const lesson = buildInstagramMoverLesson(movers);
  const { leader, peer } = lesson;
  const caption = [
    lesson.headline,
    `${leader.name} (${leader.symbol.toUpperCase()}): ${formatPercent(leader.change24h)} over 24h; ${(volumeToMarketCap(leader) * 100).toFixed(1)}% reported turnover. ${peer.name} (${peer.symbol.toUpperCase()}): ${formatPercent(peer.change24h)}; ${(volumeToMarketCap(peer) * 100).toFixed(1)}% reported turnover.`,
    `${formatCompact(leader.volume24h)} reported volume / ${formatCompact(leader.marketCap)} market cap = ${(volumeToMarketCap(leader) * 100).toFixed(1)}% turnover.`,
    lesson.explanation,
    buildInstagramCarouselCta(archetype, leader.symbol),
    `CoinGecko snapshot · ${marketDataAsOf.toISOString().slice(0, 16).replace("T", " ")} UTC. Educational research.`,
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

  const { leader, peer, headline } = buildInstagramMoverLesson(movers);
  return [
    `Research question: ${headline}`,
    `Price-change and turnover comparison: ${movers.map((mover) => `${mover.name} ${formatPercent(mover.change24h)} over 24 hours, ${(volumeToMarketCap(mover) * 100).toFixed(1)}% reported turnover`).join("; ")}.`,
    `Worked example: ${leader.name} reported ${formatCompact(leader.volume24h)} in 24-hour volume divided by ${formatCompact(leader.marketCap)} in market cap, or ${(volumeToMarketCap(leader) * 100).toFixed(1)}% turnover. ${peer.name} provides the comparison.`,
    "Missing evidence: spread is the gap between the best quoted prices; depth is available quoted size near the market price; venue mix shows where trading was reported. These checks are not provided in this snapshot.",
    "Reusable research checklist: price change, reported turnover, spread, and depth. One reader action is shown below the checklist.",
  ];
}
