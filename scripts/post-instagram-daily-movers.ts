/**
 * TokenRadar Instagram Daily Movers carousel.
 *
 * Renders a 1080x1350 carousel from live mover data, stages the PNG slides
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
import { publishInstagramCarousel } from "../src/lib/meta-client";
import { deleteObjects, cleanPrefix, hasR2Credentials, uploadBuffer } from "../src/lib/r2-client";
import { logError } from "../src/lib/reporter";
import { SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";
import { sanitizePostTextLinks } from "../src/lib/social-link-policy";
import { getSocialContentVariant, type SocialContentVariant } from "../src/lib/social-variety";
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
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

function buildCaption(movers: DailyMoverCarouselToken[], variant: SocialContentVariant): string {
  const leader = movers[0];
  const variantNotes: Record<string, { opener: string; qualityLine: string }> = {
    momentum_watchlist: {
      opener: "Ranked by daily momentum, then filtered for basic market data quality.",
      qualityLine: "Use this as a momentum scan, not a buy signal.",
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
      qualityLine: "Use the scan to separate cleaner momentum from noisy pumps.",
    },
  };
  const variantNote = variantNotes[variant.key] || variantNotes.momentum_watchlist;
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
    `${variant.captionIntro || "Daily Movers"}: ${leader.symbol.toUpperCase()} leads today's TokenRadar scan with a ${formatPercent(leader.change24h)} 24h move.`,
    variantNote.opener,
    lines.join("\n"),
    `Highest market cap in this set: ${formatCompact(Math.max(...movers.map((mover) => mover.marketCap)))}. ${variantNote.qualityLine}`,
    "Data snapshot only. Not financial advice. Always verify liquidity, volatility, and catalyst quality.",
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
  const variant = getSocialContentVariant("instagram-carousel", [today], new Date(`${today}T00:00:00.000Z`));

  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!dryRun && (!process.env.IG_ACCESS_TOKEN || !process.env.IG_ACCOUNT_ID)) {
    console.error("Missing Instagram credentials. Required: IG_ACCESS_TOKEN, IG_ACCOUNT_ID.");
    process.exit(1);
  }

  if (!dryRun && !hasR2Credentials()) {
    console.error("Missing R2 credentials for Instagram carousel media staging.");
    process.exit(1);
  }

  if (fs.existsSync(trackerFile) && !dryRun && !force) {
    const existing = safeReadJson<InstagramMoversTracker | null>(trackerFile, null);
    console.log(`Instagram movers carousel already posted today (${existing?.postedAt || "unknown time"}). Exiting.`);
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

    console.log("Top 5 Instagram Movers:");
    movers.forEach((mover, index) => {
      console.log(
        `  ${index + 1}. ${mover.symbol.toUpperCase()} (${mover.name}): ${formatPrice(mover.price)} ${formatPercent(mover.change24h)}`,
      );
    });

    console.log(`Rendering Instagram carousel slides (${variant.label})...`);
    const slides = await generateDailyMoversCarousel(movers, { variant });
    const caption = buildCaption(movers, variant);
    console.log(`  Rendered ${slides.length} PNG slides.`);
    console.log(`  Caption length: ${caption.length}/${SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT}`);

    if (dryRun) {
      console.log();
      console.log("=== DRY RUN MODE ===");
      slides.forEach((slide, index) => {
        console.log(`  Slide ${index + 1}: ${(slide.length / 1024).toFixed(1)} KB`);
      });
      console.log();
      console.log("--- INSTAGRAM CAPTION ---");
      console.log(caption);
      return;
    }

    const prefix = `ig-carousel/${today}/`;
    const uploadedKeys: string[] = [];
    const imageUrls: string[] = [];

    console.log(`Cleaning stale carousel objects under R2 prefix ${prefix}...`);
    await cleanPrefix(prefix);

    for (const [index, slide] of slides.entries()) {
      const key = `${prefix}slide-${String(index + 1).padStart(2, "0")}.png`;
      const url = await uploadBuffer(slide, key, "image/png");
      uploadedKeys.push(key);
      imageUrls.push(url);
    }

    const result = await publishInstagramCarousel(
      imageUrls.map((imageUrl) => ({ imageUrl })),
      caption,
    );

    fs.writeFileSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt: new Date().toISOString(),
          postId: result.id,
          movers: movers.map((mover) => mover.id),
          slideCount: slides.length,
          variant: variant.key,
          caption,
        } satisfies InstagramMoversTracker,
        null,
        2,
      ),
    );

    try {
      await deleteObjects(uploadedKeys);
    } catch (cleanupError) {
      console.warn(`R2 carousel cleanup failed after publish: ${formatErrorForLog(cleanupError)}`);
    }

    console.log(`Instagram movers carousel posted successfully (Post ID: ${result.id})`);
  } catch (error) {
    if (!dryRun) {
      await logError("post-instagram-daily-movers", error);
    }
    console.error(`Instagram movers carousel failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
