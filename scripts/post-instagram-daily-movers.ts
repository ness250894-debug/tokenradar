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
  DAILY_MOVERS_CAROUSEL_SLIDE_COUNT,
  generateDailyMoversCarousel,
} from "../src/lib/daily-movers-carousel-generator";
import { formatPercent, formatPrice } from "../src/lib/formatters";
import {
  buildInstagramCarouselAltTexts,
  buildInstagramCarouselCta,
  buildInstagramMoversCaption,
  getInstagramMoverRejectionReasons,
  INSTAGRAM_MOVER_POLICY,
  selectInstagramMovers,
} from "../src/lib/instagram-daily-movers";
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
import { selectSocialArchetype } from "../src/lib/social-archetypes";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { selectSocialContentVariant } from "../src/lib/social-variety";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { getRecentSocialArchetypeKeys, getRecentSocialVariantKeys } from "./lib/social-history";
import {
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  loadCandidateTokens,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");
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

  if (!dryRun) {
    cleanupExpiredCooldownFolders(DATA_DIR);
  }

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
    const rejectionCounts = candidates.reduce<Record<string, number>>((counts, candidate) => {
      for (const reason of getInstagramMoverRejectionReasons(candidate)) {
        counts[reason] = (counts[reason] || 0) + 1;
      }
      return counts;
    }, {});
    const movers = selectInstagramMovers(candidates, recentlyPosted);

    if (Object.keys(rejectionCounts).length > 0) {
      console.log(
        `  Instagram quality filter rejections: ${Object.entries(rejectionCounts)
          .map(([reason, count]) => `${reason}=${count}`)
          .join(", ")}.`,
      );
    }
    if (movers.length < INSTAGRAM_MOVER_POLICY.requiredMoverCount) {
      throw new Error(
        `Need ${INSTAGRAM_MOVER_POLICY.requiredMoverCount} fresh, qualified movers; found ${movers.length}. ` +
        `Policy: market cap >= ${INSTAGRAM_MOVER_POLICY.minimumMarketCap}, ` +
        `24h volume >= ${INSTAGRAM_MOVER_POLICY.minimumVolume24h}, ` +
        `24h move ${INSTAGRAM_MOVER_POLICY.minimumPriceChange24h}-${INSTAGRAM_MOVER_POLICY.maximumPriceChange24h}%, ` +
        `turnover ${INSTAGRAM_MOVER_POLICY.minimumVolumeToMarketCap}-${INSTAGRAM_MOVER_POLICY.maximumVolumeToMarketCap}.`,
      );
    }

    const snapshotTimes = movers
      .map((mover) => candidates.find((candidate) => candidate.id === mover.id))
      .map((candidate) => Date.parse(candidate?.lastMarketUpdate || candidate?.fetchedAt || ""))
      .filter(Number.isFinite);
    if (snapshotTimes.length !== movers.length) {
      throw new Error("Every Instagram mover must have a valid CoinGecko snapshot timestamp.");
    }
    const marketDataAsOf = new Date(Math.min(...snapshotTimes));

    console.log("Top 5 qualified Instagram Movers:");
    movers.forEach((mover, index) => {
      console.log(
        `  ${index + 1}. ${mover.symbol.toUpperCase()} (${mover.name}): ${formatPrice(mover.price)} ${formatPercent(mover.change24h)}`,
      );
    });

    console.log(`Rendering Instagram carousel slides (${variant.label}, ${archetype.label})...`);
    const cta = buildInstagramCarouselCta(archetype, movers[0].symbol);
    const renderedSlides = await generateDailyMoversCarousel(movers, {
      variant,
      generatedAt: marketDataAsOf,
      cta,
      ctaLabel: archetype.label,
    });
    if (renderedSlides.length !== DAILY_MOVERS_CAROUSEL_SLIDE_COUNT) {
      throw new Error(
        `Instagram carousel contract requires ${DAILY_MOVERS_CAROUSEL_SLIDE_COUNT} slides; rendered ${renderedSlides.length}.`,
      );
    }
    const slides = await Promise.all(
      renderedSlides.map((slide, index) => prepareInstagramCarouselImage(slide, index + 1)),
    );
    const caption = buildInstagramMoversCaption(movers, variant, archetype, marketDataAsOf);
    const altTexts = buildInstagramCarouselAltTexts(movers);
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
        return { imageUrl, altText: altTexts[index] };
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
        cta,
        eligibilityPolicy: INSTAGRAM_MOVER_POLICY,
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
