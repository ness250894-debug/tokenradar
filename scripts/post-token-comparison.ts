/**
 * TokenRadar two-token comparison publisher.
 *
 * Publishes one shared data-led comparison card to Telegram, X, Instagram,
 * Threads, the two Meta platforms together, or every supported platform.
 *
 * Usage:
 *   npx tsx scripts/post-token-comparison.ts --platform telegram
 *   npx tsx scripts/post-token-comparison.ts --platform x
 *   npx tsx scripts/post-token-comparison.ts --platform meta
 *   npx tsx scripts/post-token-comparison.ts --platform all --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

import { SOCIAL_PLATFORM_LIMITS, TELEGRAM_ECOSYSTEM_LINK_HTML, TELEGRAM_SIGNAL_NOTE } from "../src/lib/config";
import { publishImage, hasMetaCredentials } from "../src/lib/meta-client";
import { hasSocialPost, recordSocialPost } from "../src/lib/ops-ledger";
import { deleteObjects, hasR2Credentials, uploadBuffer } from "../src/lib/r2-client";
import { logError } from "../src/lib/reporter";
import { sanitizePostTextLinks } from "../src/lib/social-link-policy";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { buildTelegramMediaCaption, sendTelegramPhoto } from "../src/lib/telegram";
import {
  buildComparisonCaptions,
  generateTokenComparisonImage,
  selectTokenComparisonPair,
  type TokenComparisonMetrics,
  type TokenComparisonPair,
  type TokenComparisonToken,
} from "../src/lib/token-comparison";
import { getMissingXCredentialNames, postTweetWithMedia } from "../src/lib/x-client";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import {
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  type TokenData,
} from "./lib/token-selection";

loadEnv();

export type ComparisonPlatform = "telegram" | "x" | "instagram" | "threads";
export type ComparisonPlatformRoute = ComparisonPlatform | "meta" | "all";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PLATFORM_ORDER: ComparisonPlatform[] = ["telegram", "x", "instagram", "threads"];
const VALID_ROUTES = new Set<ComparisonPlatformRoute>([
  ...PLATFORM_ORDER,
  "meta",
  "all",
]);

interface PairTracker {
  tokenIds?: string[];
  context?: string;
}

export function resolveComparisonPlatforms(route: string | undefined): ComparisonPlatform[] {
  const normalized = (route || "all").trim().toLowerCase() as ComparisonPlatformRoute;
  if (!VALID_ROUTES.has(normalized)) {
    throw new Error(
      "Invalid --platform value. Expected telegram, x, instagram, threads, meta, or all.",
    );
  }
  if (normalized === "all") return [...PLATFORM_ORDER];
  if (normalized === "meta") return ["instagram", "threads"];
  return [normalized];
}

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadMetrics(tokenId: string): TokenComparisonMetrics | null {
  const metricsFile = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
  const metrics = safeReadJson<Partial<TokenComparisonMetrics> | null>(metricsFile, null);
  if (
    !metrics ||
    !Number.isFinite(metrics.riskScore) ||
    !Number.isFinite(metrics.growthPotentialIndex)
  ) {
    return null;
  }

  return {
    riskScore: Number(metrics.riskScore),
    growthPotentialIndex: Number(metrics.growthPotentialIndex),
    narrativeStrength: Number.isFinite(metrics.narrativeStrength)
      ? Number(metrics.narrativeStrength)
      : undefined,
    volatilityIndex: Number.isFinite(metrics.volatilityIndex)
      ? Number(metrics.volatilityIndex)
      : undefined,
  };
}

export function toComparisonToken(token: TokenData, metrics: TokenComparisonMetrics): TokenComparisonToken {
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    imageUrl: token.imageUrl,
    categories: token.categories,
    price: token.market.price,
    change24h: token.market.priceChange24h,
    change7d: token.market.priceChange7d,
    marketCap: token.market.marketCap,
    volume24h: token.market.volume24h,
    rank: token.market.marketCapRank || token.rank,
    metrics,
  };
}

function resolveStoredPair(
  trackerFile: string,
  candidates: TokenComparisonToken[],
): TokenComparisonPair | null {
  const tracker = safeReadJson<PairTracker | null>(trackerFile, null);
  if (!tracker?.tokenIds || tracker.tokenIds.length !== 2) return null;

  const [left, right] = tracker.tokenIds.map((id) => candidates.find((token) => token.id === id));
  if (!left || !right) return null;

  return {
    left,
    right,
    context: tracker.context || "Market matchup",
  };
}

function truncatePlainText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, Math.max(0, maxLength - 3));
  const boundary = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  return `${(boundary > maxLength * 0.7 ? slice.slice(0, boundary) : slice).trimEnd()}...`;
}

function trackerPath(postedDir: string, platform: ComparisonPlatform): string {
  return path.join(postedDir, `token-comparison-${platform}.json`);
}

async function alreadyPosted(
  postedDir: string,
  platform: ComparisonPlatform,
  today: string,
  force: boolean,
): Promise<boolean> {
  if (force) return false;
  return fs.existsSync(trackerPath(postedDir, platform)) ||
    await hasSocialPost(platform, `${today}:token-comparison`);
}

async function recordComparisonPost(options: {
  postedDir: string;
  today: string;
  platform: ComparisonPlatform;
  pair: TokenComparisonPair;
  text: string;
  externalId: string | number;
}): Promise<void> {
  const { postedDir, today, platform, pair, text, externalId } = options;
  const postedAt = new Date().toISOString();
  const trackerPayload = buildSocialTrackerPayload({
    postedAt,
    platform,
    surface: "token-comparison",
    tokenId: pair.left.id,
    tokenName: `${pair.left.name} vs ${pair.right.name}`,
    tokenSymbol: `${pair.left.symbol.toUpperCase()}-${pair.right.symbol.toUpperCase()}`,
    reason: "token-comparison",
    text,
    externalId,
    formatKey: "two-token-comparison",
    visualRecipeKey: "comparison-card",
    topicTag: platform === "threads" ? "CryptoResearch" : undefined,
    details: {
      tokenIds: [pair.left.id, pair.right.id],
      comparisonContext: pair.context,
      socialSlot: process.env.SOCIAL_SLOT,
    },
  });

  writeFileAtomicSync(
    trackerPath(postedDir, platform),
    JSON.stringify(trackerPayload, null, 2),
  );
  await recordSocialPost({
    platform,
    contentKey: `${today}:token-comparison`,
    externalId,
    postedAt,
    details: buildSocialPostDetails(trackerPayload),
  });
}

export async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const route = getArgValue("--platform");
  const targets = resolveComparisonPlatforms(route);
  const today = new Date().toISOString().slice(0, 10);
  const postedDir = path.join(DATA_DIR, "posted", today);
  const pairTrackerFile = path.join(postedDir, "token-comparison-pair.json");
  const outputDir = getArgValue("--output-dir");

  if (!dryRun) {
    cleanupExpiredCooldownFolders(DATA_DIR);
    fs.mkdirSync(postedDir, { recursive: true });
  }

  const pendingTargets: ComparisonPlatform[] = [];
  for (const platform of targets) {
    if (await alreadyPosted(postedDir, platform, today, force)) {
      console.log(`${platform} token comparison already posted today. Skipping.`);
    } else {
      pendingTargets.push(platform);
    }
  }
  if (pendingTargets.length === 0) return;

  console.log("Loading live comparison candidates...");
  const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 250);
  const comparisonCandidates = candidates.flatMap((token) => {
    const metrics = loadMetrics(token.id);
    return metrics ? [toComparisonToken(token, metrics)] : [];
  });

  let pair = !force ? resolveStoredPair(pairTrackerFile, comparisonCandidates) : null;
  if (!pair) {
    pair = selectTokenComparisonPair(comparisonCandidates, {
      recentlyPosted: force ? [] : getRecentlyPostedTokens(DATA_DIR),
      dateKey: today,
    });
    if (!dryRun) {
      writeFileAtomicSync(
        pairTrackerFile,
        JSON.stringify({
          selectedAt: new Date().toISOString(),
          tokenIds: [pair.left.id, pair.right.id],
          context: pair.context,
        }, null, 2),
      );
    }
  }

  console.log(
    `Selected comparison: ${pair.left.symbol.toUpperCase()} vs ${pair.right.symbol.toUpperCase()} (${pair.context}).`,
  );
  const imagePng = await generateTokenComparisonImage(pair);
  const captions = buildComparisonCaptions(pair);
  const telegramFooter = `${TELEGRAM_ECOSYSTEM_LINK_HTML}\n\n${TELEGRAM_SIGNAL_NOTE}\n#TokenComparison #Crypto #TokenRadar`;
  const platformText: Record<ComparisonPlatform, string> = {
    telegram: buildTelegramMediaCaption(captions.telegram, telegramFooter, {
      maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
    }),
    x: truncatePlainText(sanitizePostTextLinks(captions.x), SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT),
    instagram: truncatePlainText(
      sanitizePostTextLinks(captions.instagram),
      SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT,
    ),
    threads: truncatePlainText(
      sanitizePostTextLinks(captions.threads),
      SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT,
    ),
  };

  if (outputDir) {
    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
    const previewPath = path.join(resolvedOutputDir, `token-comparison-${today}.png`);
    fs.writeFileSync(previewPath, imagePng);
    console.log(`Saved comparison preview: ${previewPath}`);
  }

  if (dryRun) {
    console.log(`Rendered ${(imagePng.length / 1024).toFixed(1)} KB comparison PNG.`);
    for (const platform of pendingTargets) {
      console.log(`\n--- ${platform.toUpperCase()} (${platformText[platform].length} chars) ---`);
      console.log(platformText[platform]);
    }
    return;
  }

  const failures: Array<{ platform: ComparisonPlatform; error: unknown }> = [];

  if (pendingTargets.includes("telegram")) {
    try {
      const channelId = process.env.TELEGRAM_CHANNEL_ID;
      if (!channelId || !process.env.TELEGRAM_BOT_TOKEN) {
        throw new Error("Missing Telegram credentials. Required: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID.");
      }
      const messageId = await sendTelegramPhoto(imagePng, platformText.telegram, channelId);
      await recordComparisonPost({ postedDir, today, platform: "telegram", pair, text: platformText.telegram, externalId: messageId });
      console.log(`Telegram comparison posted (message ${messageId}).`);
    } catch (error) {
      failures.push({ platform: "telegram", error });
      await logError("post-token-comparison-telegram", error, false);
    }
  }

  if (pendingTargets.includes("x")) {
    try {
      const missing = getMissingXCredentialNames();
      if (missing.length > 0) throw new Error(`Missing X credentials: ${missing.join(", ")}.`);
      const tweetId = await postTweetWithMedia(platformText.x, imagePng);
      await recordComparisonPost({ postedDir, today, platform: "x", pair, text: platformText.x, externalId: tweetId });
      console.log(`X comparison posted (tweet ${tweetId}).`);
    } catch (error) {
      failures.push({ platform: "x", error });
      await logError("post-token-comparison-x", error, false);
    }
  }

  const metaTargets = pendingTargets.filter(
    (platform): platform is "instagram" | "threads" => platform === "instagram" || platform === "threads",
  );
  let uploadedKey = "";
  if (metaTargets.length > 0) {
    try {
      if (!hasR2Credentials()) throw new Error("Missing R2 credentials for Meta comparison image staging.");
      const imageJpeg = await sharp(imagePng)
        .flatten({ background: "#07080B" })
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
      uploadedKey = `comparison/${today}/token-comparison.jpg`;
      const imageUrl = await uploadBuffer(imageJpeg, uploadedKey, "image/jpeg");

      for (const platform of metaTargets) {
        try {
          if (!hasMetaCredentials(platform)) {
            throw new Error(`Missing ${platform} credentials.`);
          }
          const result = await publishImage(platform, imageUrl, platformText[platform], {
            topicTag: platform === "threads" ? "CryptoResearch" : undefined,
            altText: `TokenRadar comparison of ${pair.left.name} and ${pair.right.name}, covering price, 24-hour and 7-day performance, market cap, volume participation, risk, and growth metrics.`,
          });
          await recordComparisonPost({
            postedDir,
            today,
            platform,
            pair,
            text: platformText[platform],
            externalId: result.id,
          });
          console.log(`${platform} comparison posted (${result.id}).`);
        } catch (error) {
          failures.push({ platform, error });
          await logError(`post-token-comparison-${platform}`, error, false);
        }
      }
    } catch (error) {
      for (const platform of metaTargets) failures.push({ platform, error });
      await logError("post-token-comparison-meta-staging", error, false);
    }
  }

  if (uploadedKey && failures.every((failure) => !metaTargets.includes(failure.platform as "instagram" | "threads"))) {
    try {
      await deleteObjects([uploadedKey]);
    } catch (error) {
      console.warn(`Comparison image cleanup failed: ${formatErrorForLog(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      failures
        .map(({ platform, error }) => `${platform}: ${formatErrorForLog(error)}`)
        .join(" | "),
    );
  }
}

const isEntryPoint = process.argv[1]?.endsWith("post-token-comparison.ts");
if (isEntryPoint) {
  main().catch(async (error) => {
    console.error(`Token comparison publishing failed: ${formatErrorForLog(error)}`);
    process.exitCode = 1;
  });
}
