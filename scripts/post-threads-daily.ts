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
 */

import * as fs from "fs";
import * as path from "path";

import { generateUnifiedCaptions } from "../src/lib/gemini";
import { SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";
import { hasMetaCredentials, publishThreadsText, type TextEntity } from "../src/lib/meta-client";
import { logError } from "../src/lib/reporter";
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
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
const TRACKER_FILE_NAME = "daily-threads-text.json";

interface ThreadsTextTracker {
  postedAt: string;
  postId: string;
  tokenId: string;
  tokenName: string;
  reason: string;
  threadsText: string;
  topicTag: string;
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
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, TRACKER_FILE_NAME);

  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!dryRun && !hasMetaCredentials("threads")) {
    console.error("Missing Threads credentials. Required: THREADS_ACCESS_TOKEN, THREADS_ACCOUNT_ID.");
    process.exit(1);
  }

  if (fs.existsSync(trackerFile) && !dryRun && !force) {
    const existing = safeReadJson<ThreadsTextTracker | null>(trackerFile, null);
    console.log(`Threads text signal already posted today (${existing?.postedAt || "unknown time"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    console.log("Loading token candidates for Threads text signal...");
    const metricsDir = path.join(DATA_DIR, "metrics");
    const {
      candidates,
      allRegistry,
      onWebsiteIds,
    } = await loadCandidateTokens(DATA_DIR, 1, 250);

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
      { threadsMaxChars: SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT },
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

    fs.writeFileSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt: new Date().toISOString(),
          postId: result.id,
          tokenId: token.id,
          tokenName: token.name,
          reason,
          threadsText: threadsContent.caption,
          topicTag: threadsContent.topicTag,
        } satisfies ThreadsTextTracker,
        null,
        2,
      ),
    );

    console.log(`Threads text signal posted successfully (Post ID: ${result.id})`);
  } catch (error) {
    if (!dryRun) {
      await logError("post-threads-daily", error);
    }
    console.error(`Threads text signal failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
