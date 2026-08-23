/**
 * TokenRadar Threads text signal.
 *
 * Publishes a text-native Threads post on non-video days so Threads gets a
 * conversation prompt instead of only recycled short-form captions.
 *
 * Usage:
 *   npx tsx scripts/post-threads-daily.ts
 *   npx tsx scripts/post-threads-daily.ts --dry-run
 *   npx tsx scripts/post-threads-daily.ts --force
 *   npx tsx scripts/post-threads-daily.ts --format weekly-recap
 */

import * as fs from "fs";
import * as path from "path";

import { buildSocialContentFacts, generateUnifiedCaptions } from "../src/lib/gemini";
import { validateSocialContent } from "../src/lib/social-content-validator";
import { SOCIAL_PLATFORM_LIMITS, SOCIAL_VARIANT_COOLDOWN_DAYS } from "../src/lib/config";
import {
  getSocialArchetypeByKey,
  selectSocialArchetype,
  type SocialArchetypeKey,
} from "../src/lib/social-archetypes";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { selectSocialContentVariant } from "../src/lib/social-variety";
import {
  hasMetaCredentials,
  isMetaPublishOutcomeUnknownError,
  publishThreadsText,
  type TextEntity,
} from "../src/lib/meta-client";
import {
  hasSocialPost,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
} from "../src/lib/ops-ledger";
import { logError } from "../src/lib/reporter";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import { getRecentSocialArchetypeKeys, getRecentSocialVariantKeys } from "./lib/social-history";
import { buildWeeklyThreadsRecap, selectWeeklyRecapTokens, type WeeklyThreadsRecap } from "./lib/threads-recap";
import {
  type MetricData,
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  getTodayPostedTokens,
  isMetricDataFreshForMarket,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TEXT_TRACKER_FILE_NAME = "daily-threads-text.json";
const WEEKLY_RECAP_TRACKER_FILE_NAME = "weekly-threads-recap.json";
const THREADS_RESEARCH_NOTE_MAX_CHARS = 360;
const THREADS_TEXT_ARCHETYPES = [
  "single_token_snapshot",
  "risk_lab",
  "myth_vs_data",
  "data_quality_warning",
  "behind_the_radar",
] satisfies readonly SocialArchetypeKey[];
type ThreadsPostMode = "text" | "weekly-recap";

interface ThreadsTextTracker {
  postedAt: string;
  postId: string;
  tokenId: string;
  tokenName: string;
  reason: string;
  threadsText: string;
  topicTag: string;
  variantKey?: string;
  variantLabel?: string;
  variantSurface?: string;
  archetypeKey?: string;
  archetypeLabel?: string;
  hookFamily?: string;
  ctaFamily?: string;
}

function getThreadsPostMode(args: string[] = process.argv): ThreadsPostMode {
  const formatIndex = args.indexOf("--format");
  const format = formatIndex >= 0 ? args[formatIndex + 1]?.trim().toLowerCase() : "";
  if (args.includes("--weekly-recap") || format === "weekly-recap" || format === "recap") {
    return "weekly-recap";
  }
  return "text";
}

function weeklyTrackerToken(token: WeeklyThreadsRecap["leaders"][number]) {
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    priceChange7d: typeof token.market.priceChange7d === "number" && Number.isFinite(token.market.priceChange7d)
      ? token.market.priceChange7d
      : null,
  };
}

function weeklyTrackerVolumeToken(token: NonNullable<WeeklyThreadsRecap["volumeLeader"]>) {
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    volume24h: typeof token.market.volume24h === "number" && Number.isFinite(token.market.volume24h)
      ? token.market.volume24h
      : null,
  };
}

function sanitizeThreadsTopicTag(topicTag: string | undefined): string {
  let sanitized = (topicTag || "Crypto")
    .replace(/[#.&]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!sanitized) sanitized = "Crypto";
  if (sanitized.length > SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH) {
    sanitized = sanitized.substring(0, SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH);
  }

  return sanitized;
}

function truncateThreadsAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars).trim();
  const minBoundary = Math.floor(maxChars * 0.55);
  const sentenceBoundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf(".\n"),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? "),
  );
  if (sentenceBoundary >= minBoundary) return candidate.slice(0, sentenceBoundary + 1).trim();
  const wordBoundary = candidate.lastIndexOf(" ");
  return wordBoundary >= minBoundary ? candidate.slice(0, wordBoundary).trim() : candidate;
}

function buildThreadsContent(
  caption: string | undefined,
  topicTag: string | undefined,
  spoilerText: string | undefined,
  tokenName: string,
): { caption: string; topicTag: string; spoilerEntities: TextEntity[] } {
  const maxChars = THREADS_RESEARCH_NOTE_MAX_CHARS;
  let safeSpoilerText = (spoilerText || "").trim();
  if (safeSpoilerText.length > Math.floor(maxChars / 2)) {
    safeSpoilerText = truncateThreadsAtBoundary(safeSpoilerText, Math.floor(maxChars / 2));
  }

  let safeCaption = (caption || `${tokenName} needs confirmation from participation, not just price.`).trim();
  safeCaption = truncateThreadsAtBoundary(safeCaption, maxChars);

  if (safeSpoilerText && !safeCaption.includes(safeSpoilerText)) {
    const suffix = `\n\n${safeSpoilerText}`;
    const bodyBudget = maxChars - suffix.length;
    safeCaption = bodyBudget > 0
      ? `${truncateThreadsAtBoundary(safeCaption, bodyBudget)}${suffix}`.trim()
      : safeSpoilerText.slice(0, maxChars);
  }

  const spoilerIndex = safeCaption.indexOf(safeSpoilerText);
  const textEncoder = new TextEncoder();
  const spoilerEntities = safeSpoilerText && spoilerIndex >= 0
    ? [{
        entity_type: "SPOILER" as const,
        offset: textEncoder.encode(safeCaption.substring(0, spoilerIndex)).length,
        length: textEncoder.encode(safeSpoilerText).length,
      }]
    : [];

  return {
    caption: safeCaption,
    topicTag: sanitizeThreadsTopicTag(topicTag),
    spoilerEntities,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const mode = getThreadsPostMode();
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFileName = mode === "weekly-recap" ? WEEKLY_RECAP_TRACKER_FILE_NAME : TEXT_TRACKER_FILE_NAME;
  const trackerFile = path.join(postedDir, trackerFileName);
  const socialPostKey = `${today}:${mode === "weekly-recap" ? "threads-weekly-recap" : "threads-text"}`;
  const postLabel = mode === "weekly-recap" ? "Threads weekly recap" : "Threads text signal";
  let deliveryReserved = false;
  let publishedExternalId: string | undefined;

  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!dryRun && !hasMetaCredentials("threads")) {
    console.error("Missing Threads credentials. Required: THREADS_ACCESS_TOKEN, THREADS_ACCOUNT_ID.");
    process.exit(1);
  }

  if (!dryRun && !force && (fs.existsSync(trackerFile) || await hasSocialPost("threads", socialPostKey))) {
    const existing = safeReadJson<ThreadsTextTracker | null>(trackerFile, null);
    console.log(`${postLabel} already posted today (${existing?.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    console.log(`Loading token candidates for ${postLabel.toLowerCase()}...`);
    const metricsDir = path.join(DATA_DIR, "metrics");
    const {
      candidates,
      allRegistry,
      onWebsiteIds,
    } = await loadCandidateTokens(DATA_DIR, 1, 250);

    if (mode === "weekly-recap") {
      const recap = buildWeeklyThreadsRecap(selectWeeklyRecapTokens(candidates));
      const recapArchetype = getSocialArchetypeByKey("weekly_scoreboard");
      if (!recapArchetype) throw new Error("Missing weekly_scoreboard social archetype.");
      const recapSnapshotTimes = recap.tokenIds
        .map((tokenId) => candidates.find((candidate) => candidate.id === tokenId))
        .map((candidate) => Date.parse(candidate?.lastMarketUpdate || candidate?.fetchedAt || ""))
        .filter(Number.isFinite);
      if (recapSnapshotTimes.length !== recap.tokenIds.length) {
        throw new Error("Every Threads recap token must have a valid CoinGecko snapshot timestamp.");
      }
      const marketDataAsOf = new Date(Math.min(...recapSnapshotTimes));
      const recapCaption = truncateThreadsAtBoundary(
        `${recap.caption}\n\nCoinGecko snapshot, ${marketDataAsOf.toISOString().slice(11, 16)} UTC.`,
        SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT,
      );

      console.log();
      console.log("Threads weekly recap preview:");
      console.log(recapCaption);
      console.log(`Topic: ${recap.topicTag}`);
      console.log(`Tokens: ${recap.tokenIds.join(", ")}`);
      console.log(`Archetype: ${recapArchetype.label} (${recapArchetype.key})`);

      if (dryRun) {
        console.log("Dry run - Threads weekly recap not posted.");
        return;
      }

      const reservation = await reserveSocialDelivery({
        platform: "threads",
        contentKey: socialPostKey,
        details: {
          surface: "threads-weekly-recap",
          tokenIds: recap.tokenIds,
          marketDataSource: "coingecko-live",
          marketDataAsOf: marketDataAsOf.toISOString(),
        },
      });
      if (!reservation.acquired) {
        if (reservation.state === "published") {
          console.log("Threads weekly recap delivery is already published; treating this run as an idempotent no-op.");
          return;
        }
        throw new Error(`Threads weekly recap delivery is ${reservation.state}; reconcile it before retrying.`);
      }
      deliveryReserved = true;

      const result = await publishThreadsText(recapCaption, {
        topicTag: recap.topicTag,
      });
      publishedExternalId = result.id;
      const postedAt = new Date().toISOString();
      const trackerPayload = buildSocialTrackerPayload({
        postedAt,
        platform: "threads",
        surface: "threads-weekly-recap",
        reason: "weekly-recap",
        variantKey: "weekly-recap",
        variantLabel: "Weekly Recap",
        archetypeKey: recapArchetype.key,
        archetypeLabel: recapArchetype.label,
        hookFamily: recapArchetype.hookFamily,
        ctaFamily: recapArchetype.ctaFamily,
        text: recapCaption,
        externalId: result.id,
        topicTag: recap.topicTag,
        details: {
          tokenIds: recap.tokenIds,
          leaders: recap.leaders.map(weeklyTrackerToken),
          pullback: recap.pullback ? weeklyTrackerToken(recap.pullback) : undefined,
          volumeLeader: recap.volumeLeader ? weeklyTrackerVolumeToken(recap.volumeLeader) : undefined,
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
        platform: "threads",
        contentKey: socialPostKey,
        externalId: result.id,
        postedAt,
        details: buildSocialPostDetails(trackerPayload),
      });

      console.log(`Threads weekly recap posted successfully (Post ID: ${result.id})`);
      return;
    }

    const todayPosted = force ? new Set<string>() : getTodayPostedTokens(DATA_DIR, today, "all");
    const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR, "all");
    const selection = await selectToken(
      candidates,
      todayPosted,
      recentlyPosted,
      metricsDir,
      allRegistry,
      onWebsiteIds,
      "all",
      force,
    );

    if (!selection) {
      throw new Error("Could not select a token for Threads text signal.");
    }

    const { token, reason, trendingContext } = selection;
    let metric: MetricData | undefined;
    const metricsFile = path.join(metricsDir, `${token.id}.json`);
    if (fs.existsSync(metricsFile)) {
      metric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
    }
    const tokenMarketAsOf = token.lastMarketUpdate || token.fetchedAt;
    if (metric && !isMetricDataFreshForMarket(metric, tokenMarketAsOf)) {
      console.warn("Derived Risk/Growth metrics do not match the fresh Threads market snapshot; omitting them.");
      metric = undefined;
    }

    const contentVariant = selectSocialContentVariant({
      platform: "threads",
      usedVariantKeys: force
        ? []
        : getRecentSocialVariantKeys(
            DATA_DIR,
            "threads",
            SOCIAL_VARIANT_COOLDOWN_DAYS,
            new Date(`${today}T00:00:00.000Z`),
            "threads-text",
          ),
      seedParts: [today, "threads", token.id, reason, "threads-text"],
      date: new Date(`${today}T00:00:00.000Z`),
    });
    console.log(`Threads variant: ${contentVariant.label} (${contentVariant.key})`);
    const contentArchetype = selectSocialArchetype({
      platform: "threads",
      allowedArchetypeKeys: THREADS_TEXT_ARCHETYPES,
      usedArchetypeKeys: force
        ? []
        : getRecentSocialArchetypeKeys(
            DATA_DIR,
            "threads",
            SOCIAL_VARIANT_COOLDOWN_DAYS,
            new Date(`${today}T00:00:00.000Z`),
            "threads-text",
          ),
      seedParts: [today, "threads", token.id, reason, "threads-text", process.env.SOCIAL_SLOT],
      date: new Date(`${today}T00:00:00.000Z`),
    });
    console.log(`Threads archetype: ${contentArchetype.label} (${contentArchetype.key})`);

    const publishingContext = {
      ...metric,
      price: token.market.price,
      priceChange24h: token.market.priceChange24h,
      marketCap: token.market.marketCap,
      marketCapRank: token.market.marketCapRank,
      volume24h: token.market.volume24h,
      twitterFollowers: undefined,
      redditSubscribers: undefined,
      githubCommits4Weeks: undefined,
      marketDataSource: token.marketDataSource,
      marketDataAsOf: token.lastMarketUpdate || token.fetchedAt,
      trendingContext,
      timeOfDay: getTimeOfDay(),
      tone: getRandomTone(),
      selectionReason: reason,
    };
    const captions = await generateUnifiedCaptions(
      token.name,
      token.symbol,
      token.description || "",
      publishingContext,
      ["threads"],
      {
        threadsMaxChars: THREADS_RESEARCH_NOTE_MAX_CHARS,
        contentVariants: { threads: contentVariant },
        contentArchetypes: { threads: contentArchetype },
      },
    );

    const threadsContent = buildThreadsContent(
      captions.threadsCaption,
      captions.threadsTopicTag,
      captions.threadsSpoilerText,
      token.name,
    );
    const finalValidation = validateSocialContent(
      threadsContent.caption,
      buildSocialContentFacts(token.name, token.symbol, publishingContext),
    );
    if (!finalValidation.ok) {
      throw new Error(
        `Final assembled Threads copy failed the publishing gate: ${finalValidation.issues.map((issue) => issue.code).join(", ")}`,
      );
    }

    console.log();
    console.log("Threads text preview:");
    console.log(threadsContent.caption);
    console.log(`Topic: ${threadsContent.topicTag}`);
    console.log(`Spoiler entities: ${threadsContent.spoilerEntities.length}`);

    if (dryRun) {
      console.log("Dry run - Threads text signal not posted.");
      return;
    }

    const reservation = await reserveSocialDelivery({
      platform: "threads",
      contentKey: socialPostKey,
      details: {
        surface: "threads-text",
        tokenId: token.id,
        marketDataSource: token.marketDataSource,
        marketDataAsOf: token.lastMarketUpdate || token.fetchedAt,
      },
    });
    if (!reservation.acquired) {
      if (reservation.state === "published") {
        console.log("Threads text delivery is already published; treating this run as an idempotent no-op.");
        return;
      }
      throw new Error(`Threads text delivery is ${reservation.state}; reconcile it before retrying.`);
    }
    deliveryReserved = true;

    const result = await publishThreadsText(threadsContent.caption, {
      topicTag: threadsContent.topicTag,
      spoilerEntities: threadsContent.spoilerEntities,
    });
    publishedExternalId = result.id;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform: "threads",
      surface: "threads-text",
      tokenId: token.id,
      tokenName: token.name,
      tokenSymbol: token.symbol.toUpperCase(),
      reason,
      variantKey: contentVariant.key,
      variantLabel: contentVariant.label,
      archetypeKey: contentArchetype.key,
      archetypeLabel: contentArchetype.label,
      hookFamily: contentArchetype.hookFamily,
      ctaFamily: contentArchetype.ctaFamily,
      text: threadsContent.caption,
      externalId: result.id,
      topicTag: threadsContent.topicTag,
      details: {
        marketDataSource: token.marketDataSource,
        marketDataAsOf: token.lastMarketUpdate || token.fetchedAt,
        metricsAsOf: metric?.inputDataAsOf,
        socialSlot: process.env.SOCIAL_SLOT,
      },
    });

    writeFileAtomicSync(
      trackerFile,
      JSON.stringify(trackerPayload, null, 2),
    );
    await recordSocialPost({
      platform: "threads",
      contentKey: socialPostKey,
      externalId: result.id,
      postedAt,
      details: buildSocialPostDetails(trackerPayload),
    });

    console.log(`Threads text signal posted successfully (Post ID: ${result.id})`);
  } catch (error) {
    if (deliveryReserved) {
      const errorText = formatErrorForLog(error);
      await markSocialDeliveryStatus({
        platform: "threads",
        contentKey: socialPostKey,
        status: publishedExternalId
          ? "published"
          : isMetaPublishOutcomeUnknownError(error)
            ? "outcome_unknown"
            : "failed",
        externalId: publishedExternalId,
        error: errorText,
        details: { surface: mode === "weekly-recap" ? "threads-weekly-recap" : "threads-text" },
      });
    }
    if (!dryRun) {
      await logError("post-threads-daily", error);
    }
    console.error(`${postLabel} failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
