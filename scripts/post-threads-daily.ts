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

import { generateUnifiedCaptions } from "../src/lib/gemini";
import { SOCIAL_PLATFORM_LIMITS, SOCIAL_VARIANT_COOLDOWN_DAYS } from "../src/lib/config";
import { selectSocialContentVariant } from "../src/lib/social-variety";
import { hasMetaCredentials, publishThreadsText, type TextEntity } from "../src/lib/meta-client";
import { hasSocialPost, recordSocialPost } from "../src/lib/ops-ledger";
import { logError } from "../src/lib/reporter";
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import { getRecentSocialVariantKeys } from "./lib/social-history";
import { buildWeeklyThreadsRecap, selectWeeklyRecapTokens, type WeeklyThreadsRecap } from "./lib/threads-recap";
import {
  type MetricData,
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  getTodayPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TEXT_TRACKER_FILE_NAME = "daily-threads-text.json";
const WEEKLY_RECAP_TRACKER_FILE_NAME = "weekly-threads-recap.json";

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
}

interface ThreadsWeeklyRecapTracker {
  platform: "threads";
  postedAt: string;
  postId: string;
  tokenIds: string[];
  threadsText: string;
  topicTag: string;
  leaders: Array<{ id: string; symbol: string; name: string; priceChange7d: number | null }>;
  pullback?: { id: string; symbol: string; name: string; priceChange7d: number | null };
  volumeLeader?: { id: string; symbol: string; name: string; volume24h: number | null };
  variantSurface: "threads-weekly-recap";
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

function buildThreadsContent(
  caption: string | undefined,
  topicTag: string | undefined,
  spoilerText: string | undefined,
  tokenName: string,
): { caption: string; topicTag: string; spoilerEntities: TextEntity[] } {
  const maxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
  let safeSpoilerText = (spoilerText || tokenName).trim();
  if (!safeSpoilerText) safeSpoilerText = tokenName;

  let safeCaption = (caption || `What would invalidate this ${tokenName} setup first?`).trim();
  if (!safeCaption.includes(safeSpoilerText)) {
    const suffix = ` ${safeSpoilerText}`;
    const bodyBudget = maxChars - suffix.length;
    safeCaption = bodyBudget > 0
      ? `${safeCaption.substring(0, bodyBudget).trim()}${suffix}`.trim()
      : safeSpoilerText.substring(0, maxChars);
  }

  if (safeCaption.length > maxChars) {
    safeCaption = `${safeCaption.substring(0, maxChars - 3).trim()}...`;
  }

  if (!safeCaption.includes(safeSpoilerText)) {
    safeCaption = safeSpoilerText.length <= maxChars
      ? safeSpoilerText
      : safeSpoilerText.substring(0, maxChars);
  }

  const spoilerIndex = safeCaption.indexOf(safeSpoilerText);
  const textEncoder = new TextEncoder();
  const spoilerEntities = spoilerIndex >= 0
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

      console.log();
      console.log("Threads weekly recap preview:");
      console.log(recap.caption);
      console.log(`Topic: ${recap.topicTag}`);
      console.log(`Tokens: ${recap.tokenIds.join(", ")}`);

      if (dryRun) {
        console.log("Dry run - Threads weekly recap not posted.");
        return;
      }

      const result = await publishThreadsText(recap.caption, {
        topicTag: recap.topicTag,
      });
      const postedAt = new Date().toISOString();

      fs.writeFileSync(
        trackerFile,
        JSON.stringify(
          {
            platform: "threads",
            postedAt,
            postId: result.id,
            tokenIds: recap.tokenIds,
            threadsText: recap.caption,
            topicTag: recap.topicTag,
            leaders: recap.leaders.map(weeklyTrackerToken),
            pullback: recap.pullback ? weeklyTrackerToken(recap.pullback) : undefined,
            volumeLeader: recap.volumeLeader ? weeklyTrackerVolumeToken(recap.volumeLeader) : undefined,
            variantSurface: "threads-weekly-recap",
          } satisfies ThreadsWeeklyRecapTracker,
          null,
          2,
        ),
      );
      await recordSocialPost({
        platform: "threads",
        contentKey: socialPostKey,
        externalId: result.id,
        postedAt,
        details: {
          tokenIds: recap.tokenIds,
          topicTag: recap.topicTag,
          variantSurface: "threads-weekly-recap",
        },
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

    const captions = await generateUnifiedCaptions(
      token.name,
      token.symbol,
      token.description || "",
      {
        ...metric,
        price: token.market.price,
        priceChange24h: token.market.priceChange24h,
        marketCap: token.market.marketCap,
        marketCapRank: token.market.marketCapRank,
        twitterFollowers: token.community?.twitterFollowers || 0,
        redditSubscribers: token.community?.redditSubscribers || 0,
        githubCommits4Weeks: token.developer?.commits4Weeks || 0,
        trendingContext,
        timeOfDay: getTimeOfDay(),
        tone: getRandomTone(),
        selectionReason: reason,
      },
      ["threads"],
      {
        threadsMaxChars: SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT,
        contentVariants: { threads: contentVariant },
      },
    );

    const threadsContent = buildThreadsContent(
      captions.threadsCaption,
      captions.threadsTopicTag,
      captions.threadsSpoilerText,
      token.name,
    );

    console.log();
    console.log("Threads text preview:");
    console.log(threadsContent.caption);
    console.log(`Topic: ${threadsContent.topicTag}`);
    console.log(`Spoiler entities: ${threadsContent.spoilerEntities.length}`);

    if (dryRun) {
      console.log("Dry run - Threads text signal not posted.");
      return;
    }

    const result = await publishThreadsText(threadsContent.caption, {
      topicTag: threadsContent.topicTag,
      spoilerEntities: threadsContent.spoilerEntities,
    });
    const postedAt = new Date().toISOString();

    fs.writeFileSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt,
          postId: result.id,
          tokenId: token.id,
          tokenName: token.name,
          reason,
          threadsText: threadsContent.caption,
          topicTag: threadsContent.topicTag,
          variantKey: contentVariant.key,
          variantLabel: contentVariant.label,
          variantSurface: "threads-text",
        } satisfies ThreadsTextTracker,
        null,
        2,
      ),
    );
    await recordSocialPost({
      platform: "threads",
      contentKey: socialPostKey,
      externalId: result.id,
      postedAt,
      details: {
        tokenId: token.id,
        tokenName: token.name,
        reason,
        topicTag: threadsContent.topicTag,
        variantKey: contentVariant.key,
        variantLabel: contentVariant.label,
        variantSurface: "threads-text",
      },
    });

    console.log(`Threads text signal posted successfully (Post ID: ${result.id})`);
  } catch (error) {
    if (!dryRun) {
      await logError("post-threads-daily", error);
    }
    console.error(`${postLabel} failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
