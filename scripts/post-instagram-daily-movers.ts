/**
 * TokenRadar Instagram Daily Movers carousel.
 *
 * Renders a 1080x1350 carousel from live mover data, stages JPEG slides
 * under an R2 prefix, publishes the Instagram carousel, then deletes only the
 * keys uploaded by this run.
 *
 * Usage:
 *   npx tsx scripts/post-instagram-daily-movers.ts
 *   npx tsx scripts/post-instagram-daily-movers.ts --dry-run
 *   npx tsx scripts/post-instagram-daily-movers.ts --force
 */

import * as fs from "fs";
import * as path from "path";

import {
  generateDailyMoversCarousel,
  type DailyMoverCarouselToken,
} from "../src/lib/daily-movers-carousel-generator";
import { formatCompact, formatPercent, formatPrice } from "../src/lib/formatters";
import { prepareInstagramCarouselImage } from "../src/lib/instagram-carousel-media";
import { isMetaPublishOutcomeUnknownError, publishInstagramCarousel } from "../src/lib/meta-client";
import { deleteObjects, cleanPrefix, hasR2Credentials, uploadBuffer } from "../src/lib/r2-client";
import {
  hasSocialPost,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
} from "../src/lib/ops-ledger";
import { logError } from "../src/lib/reporter";
import { SOCIAL_PLATFORM_LIMITS, SOCIAL_VARIANT_COOLDOWN_DAYS } from "../src/lib/config";
import { sanitizePostTextLinks } from "../src/lib/social-link-policy";
import { selectSocialArchetype, type SocialContentArchetype } from "../src/lib/social-archetypes";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { selectSocialContentVariant, type SocialContentVariant } from "../src/lib/social-variety";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { getRecentSocialArchetypeKeys, getRecentSocialVariantKeys } from "./lib/social-history";
import {
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  hasSocialImageSafeText,
  loadCandidateTokens,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");
const MAX_CHANGE_THRESHOLD = 500;
const TRACKER_FILE_NAME = "daily-instagram-movers.json";

interface InstagramMoversTracker {
  postedAt: string;
  postId: string;
  movers: string[];
  slideCount: number;
  variant: string;
  variantKey?: string;
  variantLabel?: string;
  variantSurface?: string;
  archetypeKey?: string;
  archetypeLabel?: string;
  hookFamily?: string;
  ctaFamily?: string;
  caption?: string;
}

function selectMovers(
  candidates: Awaited<ReturnType<typeof loadCandidateTokens>>["candidates"],
  recentlyPosted: Set<string> = new Set(),
): DailyMoverCarouselToken[] {
  const eligibleMovers = candidates
    .filter((token) =>
      token.market.priceChange24h > 0 &&
      token.market.priceChange24h <= MAX_CHANGE_THRESHOLD &&
      token.market.price > 0 &&
      token.market.marketCap > 0 &&
      token.market.volume24h > 0 &&
      hasSocialImageSafeText(token)
    )
    .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);
  const freshMovers = eligibleMovers.filter((token) => !recentlyPosted.has(token.id));
  const cooldownFillers = eligibleMovers.filter((token) => recentlyPosted.has(token.id));

  return [
    ...freshMovers.slice(0, 5),
    ...cooldownFillers.slice(0, Math.max(0, 5 - freshMovers.length)),
  ]
    .slice(0, 5)
    .map((token) => ({
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
      price: token.market.price,
      change24h: token.market.priceChange24h,
      marketCap: token.market.marketCap,
      volume24h: token.market.volume24h,
      rank: token.market.marketCapRank,
    }));
}

function buildCaption(
  movers: DailyMoverCarouselToken[],
  variant: SocialContentVariant,
  archetype: SocialContentArchetype,
  marketDataAsOf: Date,
): string {
  const leader = movers[0];
  const variantNotes: Record<string, { opener: string; qualityLine: string }> = {
    momentum_watchlist: {
      opener: "Ranked by daily momentum, then filtered for basic market data quality.",
      qualityLine: "Use this as a momentum scan, not a recommendation.",
    },
    volatility_filter: {
      opener: "Big candles are only useful when confirmation and liquidity hold.",
      qualityLine: "Treat every large 24h move as a volatility event until follow-through confirms it.",
    },
    rotation_radar: {
      opener: "Use the list as a rotation map: where momentum is concentrating, not where certainty exists.",
      qualityLine: "Compare the names against sector strength before trusting the rotation.",
    },
    quality_movers: {
      opener: "Percent gain alone is not enough; market cap and volume give the move context.",
      qualityLine: "Use the scan to separate cleaner momentum from noisy price spikes.",
    },
  };
  const variantNote = variantNotes[variant.key] || variantNotes.momentum_watchlist;
  const archetypeOpeners: Record<string, string> = {
    risk_lab: "Before chasing today's green candles, check the filter first.",
    sector_rotation: "Today's useful read is where momentum is clustering.",
    how_to_read_metric: "A 24h mover list is only useful when you know what to filter.",
    watchlist_shortlist: "Here is the shortlist, not a call.",
    data_quality_warning: "Big mover lists can hide noisy data; start with the quality check.",
    two_token_comparison: "Compare the strongest moves before treating any single candle as the story.",
  };
  const opener = archetypeOpeners[archetype.key] ||
    `${variant.captionIntro || "Daily Movers"}: ${leader.symbol.toUpperCase()} leads today's TokenRadar scan with a ${formatPercent(leader.change24h)} 24h move.`;
  const lines = movers.map((mover, index) =>
    `${index + 1}. ${mover.symbol.toUpperCase()} (${mover.name}): ${formatPercent(mover.change24h)} at ${formatPrice(mover.price)}`
  );
  const symbolTags = movers
    .map((mover) => mover.symbol.replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean)
    .map((symbol) => `#${symbol.toUpperCase()}`);
  const hashtags = [
    "#Crypto",
    "#TokenRadar",
    "#MarketMovers",
    "#Altcoins",
    variant.key === "rotation_radar" ? "#CryptoNarratives" : "#CryptoResearch",
    variant.key === "volatility_filter" ? "#RiskManagement" : "#MarketScan",
    ...symbolTags,
  ].slice(0, SOCIAL_PLATFORM_LIMITS.INSTAGRAM.HASHTAG_LIMIT);

  const caption = [
    opener,
    variantNote.opener,
    lines.join("\n"),
    `Highest market cap in this set: ${formatCompact(Math.max(...movers.map((mover) => mover.marketCap)))}. ${variantNote.qualityLine}`,
    "Data snapshot only. Not financial advice. Always verify liquidity, volatility, and catalyst quality.",
    `Source: CoinGecko snapshot, ${marketDataAsOf.toISOString().slice(11, 16)} UTC.`,
    "TokenRadar.co",
    hashtags.join(" "),
  ].join("\n\n");

  const sanitized = sanitizePostTextLinks(caption);
  return sanitized.length > SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT
    ? sanitized.slice(0, SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT - 3).trimEnd() + "..."
    : sanitized;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, TRACKER_FILE_NAME);
  const socialPostKey = `${today}:instagram-carousel`;
  let deliveryReserved = false;
  let publishedExternalId: string | undefined;
  const variant = selectSocialContentVariant({
    platform: "instagram-carousel",
    usedVariantKeys: force
      ? []
      : getRecentSocialVariantKeys(
          DATA_DIR,
          "instagram-carousel",
          SOCIAL_VARIANT_COOLDOWN_DAYS,
          new Date(`${today}T00:00:00.000Z`),
          "instagram-carousel",
        ),
    seedParts: [today, "instagram-carousel"],
    date: new Date(`${today}T00:00:00.000Z`),
  });
  const archetype = selectSocialArchetype({
    platform: "instagram-carousel",
    usedArchetypeKeys: force
      ? []
      : getRecentSocialArchetypeKeys(
          DATA_DIR,
          "instagram-carousel",
          SOCIAL_VARIANT_COOLDOWN_DAYS,
          new Date(`${today}T00:00:00.000Z`),
          "instagram-carousel",
        ),
    seedParts: [today, "instagram-carousel", process.env.SOCIAL_SLOT],
    date: new Date(`${today}T00:00:00.000Z`),
    allowedArchetypeKeys: [
      "risk_lab",
      "sector_rotation",
      "how_to_read_metric",
      "watchlist_shortlist",
      "data_quality_warning",
      "two_token_comparison",
    ],
  });

  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!dryRun && (!process.env.IG_ACCESS_TOKEN || !process.env.IG_ACCOUNT_ID)) {
    console.error("Missing Instagram credentials. Required: IG_ACCESS_TOKEN, IG_ACCOUNT_ID.");
    process.exit(1);
  }

  if (!dryRun && !hasR2Credentials()) {
    console.error("Missing R2 credentials for Instagram carousel media staging.");
    process.exit(1);
  }

  if (!dryRun && !force && (fs.existsSync(trackerFile) || await hasSocialPost("instagram", socialPostKey))) {
    const existing = safeReadJson<InstagramMoversTracker | null>(trackerFile, null);
    console.log(`Instagram movers carousel already posted today (${existing?.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    console.log("Loading live token data from CoinGecko...");
    const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 500);
    const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR, "instagram");
    if (!force) {
      console.log(`  Instagram movers cooldown pool: ${recentlyPosted.size} tokens from recent Instagram movers.`);
    }
    const movers = selectMovers(candidates, recentlyPosted);

    if (movers.length < 5) {
      throw new Error(`Need 5 eligible movers for the Instagram carousel; found ${movers.length}.`);
    }
    if (!force && movers.some((mover) => recentlyPosted.has(mover.id))) {
      console.warn("  Not enough fresh Instagram movers after cooldown filtering; filled remaining slots with recent movers.");
    }

    const snapshotTimes = movers
      .map((mover) => candidates.find((candidate) => candidate.id === mover.id))
      .map((candidate) => Date.parse(candidate?.lastMarketUpdate || candidate?.fetchedAt || ""))
      .filter(Number.isFinite);
    if (snapshotTimes.length !== movers.length) {
      throw new Error("Every Instagram mover must have a valid CoinGecko snapshot timestamp.");
    }
    const marketDataAsOf = new Date(Math.min(...snapshotTimes));

    console.log("Top 5 Instagram Movers:");
    movers.forEach((mover, index) => {
      console.log(
        `  ${index + 1}. ${mover.symbol.toUpperCase()} (${mover.name}): ${formatPrice(mover.price)} ${formatPercent(mover.change24h)}`,
      );
    });

    console.log(`Rendering Instagram carousel slides (${variant.label}, ${archetype.label})...`);
    const renderedSlides = await generateDailyMoversCarousel(movers, {
      variant,
      generatedAt: marketDataAsOf,
    });
    const slides = await Promise.all(
      renderedSlides.map((slide, index) => prepareInstagramCarouselImage(slide, index + 1)),
    );
    const caption = buildCaption(movers, variant, archetype, marketDataAsOf);
    console.log(`  Rendered ${slides.length} JPEG slides.`);
    console.log(`  Caption length: ${caption.length}/${SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT}`);

    if (dryRun) {
      console.log();
      console.log("=== DRY RUN MODE ===");
      slides.forEach((slide, index) => {
        console.log(`  Slide ${index + 1}: ${(slide.body.length / 1024).toFixed(1)} KB`);
      });
      console.log();
      console.log("--- INSTAGRAM CAPTION ---");
      console.log(caption);
      return;
    }

    const reservation = await reserveSocialDelivery({
      platform: "instagram",
      contentKey: socialPostKey,
      details: {
        surface: "instagram-carousel",
        movers: movers.map((mover) => mover.id),
        marketDataSource: "coingecko-live",
        marketDataAsOf: marketDataAsOf.toISOString(),
      },
    });
    if (!reservation.acquired) {
      if (reservation.state === "published") {
        console.log("Instagram movers delivery is already published; treating this run as an idempotent no-op.");
        return;
      }
      throw new Error(`Instagram movers delivery is ${reservation.state}; reconcile it before retrying.`);
    }
    deliveryReserved = true;

    const prefix = `ig-carousel/${today}/`;
    const uploadedKeys: string[] = [];
    const imageUrls: string[] = [];

    console.log(`Cleaning stale carousel objects under R2 prefix ${prefix}...`);
    await cleanPrefix(prefix);

    for (const slide of slides) {
      const key = `${prefix}${slide.keySuffix}`;
      const url = await uploadBuffer(slide.body, key, slide.contentType);
      uploadedKeys.push(key);
      imageUrls.push(url);
    }

    const result = await publishInstagramCarousel(
      imageUrls.map((imageUrl, index) => {
        const mover = index >= 2 && index <= 6 ? movers[index - 2] : undefined;
        const altText = index === 0
          ? `TokenRadar daily movers cover showing ${movers.map((item) => item.symbol.toUpperCase()).join(", ")}.`
          : index === 1
            ? `Ranked daily movers board: ${movers.map((item, rank) => `${rank + 1}. ${item.name} ${formatPercent(item.change24h)}`).join("; ")}.`
            : mover
              ? `${mover.name} (${mover.symbol.toUpperCase()}) market snapshot: price ${formatPrice(mover.price)}, 24-hour change ${formatPercent(mover.change24h)}, market cap ${formatCompact(mover.marketCap)}, and volume ${formatCompact(mover.volume24h)}.`
              : "TokenRadar risk reminder explaining that large daily gains need liquidity and follow-through confirmation.";
        return { imageUrl, altText };
      }),
      caption,
    );
    publishedExternalId = result.id;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform: "instagram",
      surface: "instagram-carousel",
      reason: "daily-movers",
      variantKey: variant.key,
      variantLabel: variant.label,
      archetypeKey: archetype.key,
      archetypeLabel: archetype.label,
      hookFamily: archetype.hookFamily,
      ctaFamily: archetype.ctaFamily,
      text: caption,
      externalId: result.id,
      details: {
        movers: movers.map((mover) => mover.id),
        slideCount: slides.length,
        variant: variant.key,
        marketDataSource: "coingecko-live",
        marketDataAsOf: marketDataAsOf.toISOString(),
        socialSlot: process.env.SOCIAL_SLOT,
      },
    });

    writeFileAtomicSync(
      trackerFile,
      JSON.stringify(trackerPayload, null, 2),
    );
    await recordSocialPost({
      platform: "instagram",
      contentKey: socialPostKey,
      externalId: result.id,
      postedAt,
      details: buildSocialPostDetails(trackerPayload),
    });

    try {
      await deleteObjects(uploadedKeys);
    } catch (cleanupError) {
      console.warn(`R2 carousel cleanup failed after publish: ${formatErrorForLog(cleanupError)}`);
    }

    console.log(`Instagram movers carousel posted successfully (Post ID: ${result.id})`);
  } catch (error) {
    if (deliveryReserved) {
      const errorText = formatErrorForLog(error);
      await markSocialDeliveryStatus({
        platform: "instagram",
        contentKey: socialPostKey,
        status: publishedExternalId
          ? "published"
          : isMetaPublishOutcomeUnknownError(error)
            ? "outcome_unknown"
            : "failed",
        externalId: publishedExternalId,
        error: errorText,
        details: { surface: "instagram-carousel" },
      });
    }
    if (!dryRun) {
      await logError("post-instagram-daily-movers", error);
    }
    console.error(`Instagram movers carousel failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
