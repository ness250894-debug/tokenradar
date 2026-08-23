/**
 * Telegram & X Auto-Poster — Daily Market Updates
 *
 * Posts short, data-driven market updates to Telegram and/or X.
 * Designed to run frequently (e.g., every 4 hours / 5x daily).
 *
 * Selection Priority (tries each in order until an un-posted token is found):
 *   1. Trending on CoinGecko (user search momentum)
 *   2. Trending on X (matched hashtags/keywords)
 *   3. Top Gainer (24h price increase > 2%)
 *   4. Safe Play (Risk Score <= 4)
 *   5. Random Spotlight (any eligible token)
 *
 * Deduplication: Tokens posted today are skipped. If all trending tokens
 * have been posted, falls back to lower-priority strategies.
 *
 * Alert Types:
 * - 🔥 TRENDING: Token is trending on CoinGecko/X
 * - 🚀 MARKET MOVER: Top gainer (24h)
 * - 🛡️ LOW RISK ASSET: Safe play (Risk Score <= 4)
 * - 🔦 TOKEN SPOTLIGHT: Random spotlight
 *
 * Usage:
 *   npx tsx scripts/post-market-updates.ts
 *   npx tsx scripts/post-market-updates.ts --platform x --dry-run
 *
 * Requires in .env.local:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, X_OAUTH2_CLIENT_ID, etc.
 */

import { InputFile } from "grammy";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { logError, logActivity } from "../src/lib/reporter";
import {
  buildSocialContentFacts,
  generateUnifiedCaptions,
  type PlatformTarget,
  type UnifiedCaptionOptions,
} from "../src/lib/gemini";
import { buildTelegramMediaCaption, createTelegramKeyboard, getApi, isTelegramCreateOutcomeUnknownError, requireTelegramMessageId, sanitizeHtmlForTelegram } from "../src/lib/telegram";
import {
  diversifyXPostText,
  getMissingXCredentialNames,
  isXCreateOutcomeUnknownError,
  postTweet,
  postTweetWithMedia,
} from "../src/lib/x-client";
import { fetchTokenImage } from "../src/lib/og-fetcher";
import {
  SOCIAL,
  SOCIAL_PLATFORM_LIMITS,
  getTelegramFooter,
} from "../src/lib/config";
import type { SocialContentArchetype } from "../src/lib/social-archetypes";
import type { SocialContentVariant } from "../src/lib/social-variety";
import {
  attachPublishedUrlToSocialTrackerPayload,
  buildSocialPostDetails,
  buildSocialTrackerPayload,
} from "../src/lib/social-post-tracker";
import { buildSocialUtmUrl } from "../src/lib/social-utm";
import { formatMarketDataAttribution, formatMarketDataSourceLabel, validateSocialContent } from "../src/lib/social-content-validator";
import { resolveProviderMarketTimestamp } from "../src/lib/market-data-quality";
import {
  hasSocialPost,
  listSocialPostEvidence,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
  updateSocialPostDetails,
  type SocialPostEvidence,
} from "../src/lib/ops-ledger";
import { safeReadJson, loadEnv, ensureDirSync, formatErrorForLog, writeFileAtomicSync } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone, ensureHtmlTagsClosed } from "../src/lib/shared-utils";
import { getRecentPlatformTexts } from "./lib/social-history";
import { buildMarketSocialPlan, type MarketSocialPlan } from "./lib/market-social-plan";
import {
  buildTelegramMarketPost,
  getTelegramMarketVariantSurface,
  parseTelegramMarketFormat,
  type TelegramMarketFormat,
  type TelegramMarketPostDraft,
} from "../src/lib/telegram-market-formats";
import { renderTelegramMarketImage } from "../src/lib/telegram-market-image";

import {
  type MetricData,
  cleanupExpiredCooldownFolders,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  isMetricDataFreshForMarket,
  selectToken,
} from "./lib/token-selection";
// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

type MarketPostPlatform = "telegram" | "x";

type LegacyEvidenceClassification = "exact" | "other" | "unlabeled";

function stringDetail(row: SocialPostEvidence, key: string): string | undefined {
  const value = row.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function classifyLegacyMarketEvidence(
  platform: MarketPostPlatform,
  row: SocialPostEvidence,
  slot: string,
  telegramFormat: TelegramMarketFormat,
): LegacyEvidenceClassification {
  const socialSlot = stringDetail(row, "socialSlot");
  if (socialSlot) return socialSlot === slot ? "exact" : "other";

  if (platform === "telegram") {
    const labels = [stringDetail(row, "telegramFormat"), stringDetail(row, "format")]
      .filter((value): value is string => Boolean(value));
    if (labels.length === 0) return "unlabeled";
    return labels.includes(telegramFormat) ? "exact" : "other";
  }

  const labels = [stringDetail(row, "format"), stringDetail(row, "variantSurface")]
    .filter((value): value is string => Boolean(value));
  if (labels.length === 0) return "unlabeled";
  return labels.includes("market-update") ? "exact" : "other";
}

export function selectLegacyMarketEvidence(
  platform: MarketPostPlatform,
  rows: SocialPostEvidence[],
  slot: string,
  telegramFormat: TelegramMarketFormat,
): SocialPostEvidence | null {
  const classified = rows.map((row) => ({
    row,
    classification: classifyLegacyMarketEvidence(platform, row, slot, telegramFormat),
  }));
  const exact = classified.filter((item) => item.classification === "exact").map((item) => item.row);
  const exactWithPublicId = exact.filter((row) => Boolean(row.externalId?.trim()));

  if (exactWithPublicId.length === 1) return exactWithPublicId[0];
  if (exactWithPublicId.length > 1 || exact.length > 1) {
    throw new Error(
      `Multiple legacy ${platform} deliveries match ${slot}; reconcile them before publishing.`,
    );
  }
  if (exact.length === 1) return exact[0];

  const unlabeled = classified
    .filter((item) => item.classification === "unlabeled")
    .map((item) => item.row);
  if (unlabeled.length === 0) return null;
  if (platform === "x" && unlabeled.length === 1) return unlabeled[0];

  throw new Error(
    `Legacy ${platform} delivery evidence for ${slot} is ambiguous; reconcile it before publishing.`,
  );
}

export function requireLegacyMarketExternalId(
  platform: MarketPostPlatform,
  row: SocialPostEvidence,
): string {
  const externalId = row.externalId?.trim();
  if (!externalId) {
    throw new Error(
      `Legacy ${platform} delivery ${row.contentKey} has no external ID; reconcile it before publishing.`,
    );
  }
  return externalId;
}

function isAmbiguousMarketCreateError(platform: MarketPostPlatform, error: unknown): boolean {
  if (platform === "x") return isXCreateOutcomeUnknownError(error);
  return isTelegramCreateOutcomeUnknownError(error);
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

function getTelegramFormatLabel(format: TelegramMarketFormat): string {
  switch (format) {
    case "market-pulse":
      return "Market Pulse";
    case "radar-divergence":
      return "Radar Divergence";
    case "watchlist-check":
      return "Watchlist Check";
    default:
      return "Market Brief";
  }
}

function escapePreviewHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function writeTelegramPreview(options: {
  previewDir: string;
  format: TelegramMarketFormat;
  caption: string;
  image: Buffer | null;
}): Promise<void> {
  ensureDirSync(options.previewDir);

  const baseName = `telegram-${options.format}`;
  const textPath = path.join(options.previewDir, `${baseName}.txt`);
  const htmlPath = path.join(options.previewDir, `${baseName}.html`);
  const jsonPath = path.join(options.previewDir, `${baseName}.json`);
  const imagePath = options.image ? path.join(options.previewDir, `${baseName}.png`) : null;

  if (imagePath && options.image) {
    await fs.promises.writeFile(imagePath, options.image);
  }

  await fs.promises.writeFile(textPath, options.caption, "utf-8");
  await fs.promises.writeFile(
    jsonPath,
    JSON.stringify(
      {
        format: options.format,
        caption: options.caption,
        imagePath,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const imageTag = imagePath
    ? `<img src="${escapePreviewHtml(path.basename(imagePath))}" alt="${escapePreviewHtml(getTelegramFormatLabel(options.format))}" />`
    : "";
  const captionHtml = options.caption.replace(/\n/g, "<br />");
  await fs.promises.writeFile(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapePreviewHtml(getTelegramFormatLabel(options.format))}</title>
  <style>
    body { margin: 0; background: #0f172a; color: #e5e7eb; font: 16px/1.45 Arial, sans-serif; padding: 32px; }
    .post { width: min(560px, 100%); margin: 0 auto; background: #17212b; border-radius: 8px; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.35); }
    img { display: block; width: 100%; height: auto; }
    .caption { padding: 18px 20px 22px; white-space: normal; }
    a { color: #8ab4f8; }
  </style>
</head>
<body>
  <main class="post">
    ${imageTag}
    <div class="caption">${captionHtml}</div>
  </main>
</body>
</html>
`,
    "utf-8",
  );

  console.log(`  Local Telegram preview written: ${htmlPath}`);
}

function normalizeDeliveryKeyPart(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || fallback;
}

function getMarketDeliveryContentKey(
  date: string,
  platform: MarketPostPlatform,
  socialSlot: string,
  telegramFormat: TelegramMarketFormat,
): string {
  const slot = normalizeDeliveryKeyPart(
    socialSlot,
    platform === "telegram" ? `telegram-${telegramFormat}` : "x-market-update",
  );
  const format = platform === "telegram" ? telegramFormat : "market-update";
  return `${date}:slot:${slot}:${platform}:${normalizeDeliveryKeyPart(format, "market-update")}`;
}



// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const includeLinkReply = args.includes("--link-reply");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const previewDirArg = getArgValue(args, "--preview-dir") || getArgValue(args, "--local-preview-dir");
  const previewDir = previewDirArg ? path.resolve(process.cwd(), previewDirArg) : undefined;
  let telegramFormat: TelegramMarketFormat;
  try {
    telegramFormat = parseTelegramMarketFormat(getArgValue(args, "--format") || getArgValue(args, "--telegram-format"));
  } catch (error) {
    console.error(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = platformIdx !== -1 ? args[platformIdx + 1] : "all"; // x, telegram, all
  if (!["all", "telegram", "x"].includes(targetPlatform)) {
    console.error("  ✗ Invalid --platform value. Expected one of: all, telegram, x.");
    process.exit(1);
  }

  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 1;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 500;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Market Updates v2    ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Target Range: #${startRank} — #${endRank}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  if (targetPlatform === "all" || targetPlatform === "telegram") {
    console.log(`  Telegram Format: ${telegramFormat}`);
  }
  if (previewDir) {
    console.log(`  Preview Dir: ${previewDir}`);
  }
  console.log();

  const TODAY = new Date().toISOString().split('T')[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  const configuredSocialSlot = process.env.SOCIAL_SLOT?.trim();
  const socialSlotFor = (platform: MarketPostPlatform): string => configuredSocialSlot || (
    platform === "x"
      ? "x-market-update"
      : telegramFormat === "market-brief"
        ? "telegram-market-brief"
        : `telegram-${telegramFormat}`
  );
  if (!dryRun) {
    cleanupExpiredCooldownFolders(DATA_DIR);
    ensureDirSync(POSTED_DIR);
  }

  let runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  let runX = targetPlatform === "all" || targetPlatform === "x";
  if (runX) console.log(`  X Link Reply: ${includeLinkReply ? "enabled" : "disabled"}`);

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  ✗ Missing Telegram credentials (required for telegram/all platform).");
      process.exit(1);
    }
    if (runX) {
      const missingX = getMissingXCredentialNames();

      if (missingX.length > 0) {
        console.error(`  ✗ Missing X (Twitter) credentials: ${missingX.join(", ")}`);
        console.error("    Run 'npx tsx scripts/generate-x-token.ts' to set up OAuth 2.0.");
        process.exit(1);
      }
    }

    // One-release compatibility bridge: promote confirmed token-scoped rows
    // only when they unambiguously belong to this production slot.
    for (const platform of [
      ...(runTelegram ? ["telegram" as const] : []),
      ...(runX ? ["x" as const] : []),
    ]) {
      const slot = socialSlotFor(platform);
      const stableContentKey = getMarketDeliveryContentKey(TODAY, platform, slot, telegramFormat);
      if (await hasSocialPost(platform, stableContentKey)) continue;
      const legacyRows = await listSocialPostEvidence(platform, `${TODAY}:market-update:`);
      if (legacyRows.length === 0) continue;
      const matchingLegacy = selectLegacyMarketEvidence(platform, legacyRows, slot, telegramFormat);
      if (!matchingLegacy) {
        continue;
      }
      const legacyExternalId = requireLegacyMarketExternalId(platform, matchingLegacy);
      await recordSocialPost({
        platform,
        contentKey: stableContentKey,
        externalId: legacyExternalId,
        postedAt: matchingLegacy.postedAt,
        details: {
          migratedFromLegacyContentKey: matchingLegacy.contentKey,
          socialSlot: slot,
          format: platform === "telegram" ? telegramFormat : "market-update",
        },
      });
    }

    if (runTelegram && await hasSocialPost(
      "telegram",
      getMarketDeliveryContentKey(TODAY, "telegram", socialSlotFor("telegram"), telegramFormat),
    )) {
      console.log("Telegram market slot is already published; skipping generation and external work for it.");
      runTelegram = false;
    }
    if (runX && await hasSocialPost(
      "x",
      getMarketDeliveryContentKey(TODAY, "x", socialSlotFor("x"), telegramFormat),
    )) {
      console.log("X market slot is already published; skipping generation and external work for it.");
      runX = false;
    }
    if (!runTelegram && !runX) return;
  }

  // 1. Load candidate tokens (fetches fresh data + merges with local)
  console.log(`▶ Step 1: Loading candidate tokens for ranks ${startRank}-${endRank}...`);
  const metricsDir = path.join(DATA_DIR, "metrics");
  const { 
    candidates: candidateTokens, 
    allRegistry: allTokensRegistry,
    onWebsiteIds 
  } = await loadCandidateTokens(DATA_DIR, startRank, endRank);

  console.log(`  Candidates in range #${startRank}-#${endRank}: ${candidateTokens.length}`);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found in the target rank range. Ensure data/tokens/ exists and contains valid JSON.");
    process.exit(1);
  }

  // 2. Load dedup state
  const todayPosted = getTodayPostedTokens(DATA_DIR, TODAY, targetPlatform as any);
  const recentlyPosted = getRecentlyPostedTokens(DATA_DIR, targetPlatform as any);
  console.log(`  Already posted today: ${todayPosted.size} tokens`);
  console.log(`  Posted in last 30 days: ${recentlyPosted.size} tokens`);

  // Global/category endpoints use independent caches. Do not merge their
  // numbers into copy attributed to the fresher token snapshot until those
  // auxiliary timestamps are carried end-to-end.
  const globalStatsStr = "";
  const sectorPerformanceStr = "";

  // 3. Select token using priority-based strategy
  console.log(`\n▶ Step 2: Selecting token (priority-based)...`);
  const selection = await selectToken(candidateTokens, todayPosted, recentlyPosted, metricsDir, allTokensRegistry, onWebsiteIds, targetPlatform as "x" | "telegram" | "all");

  if (!selection) {
    console.error("  ✗ Could not select a target token.");
    process.exit(1);
  }

  const { token: targetToken, reason, trendingContext } = selection;
  console.log(`\n  ✦ Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  console.log(`  ✦ Reason: ${reason}`);

  // 5. Build Content Properties
  let targetMetric: MetricData | undefined;
  const metricsFile = path.join(metricsDir, `${targetToken.id}.json`);
  if (fs.existsSync(metricsFile)) {
    targetMetric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
  }
  const targetMarketAsOf = resolveProviderMarketTimestamp(targetToken.lastMarketUpdate);
  if (!targetMarketAsOf) {
    throw new Error(`Selected token ${targetToken.id} has no valid market snapshot timestamp.`);
  }
  if (targetMetric && !isMetricDataFreshForMarket(targetMetric, targetMarketAsOf)) {
    console.warn("  Derived Risk/Growth metrics do not match the fresh market snapshot; omitting them from copy.");
    targetMetric = undefined;
  }

  const timeOfDay = getTimeOfDay();
  const tone = getRandomTone();

  const socialContext = "";
  const sentimentScore = 0.5;

  const context = {
    ...targetMetric,
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    marketCap: targetToken.market.marketCap,
    marketCapRank: targetToken.market.marketCapRank,
    volume24h: targetToken.market.volume24h,
    marketDataSource: targetToken.marketDataSource,
    marketDataAsOf: targetMarketAsOf,
    // Community/developer fields are omitted until their own freshness
    // timestamps are carried independently from the market snapshot.
    twitterFollowers: undefined,
    redditSubscribers: undefined,
    githubCommits4Weeks: undefined,
    socialContext,
    sentimentScore,
    trendingContext,
    globalStats: globalStatsStr,
    sectorPerformance: sectorPerformanceStr,
    timeOfDay,
    tone,
    selectionReason: reason
  };
  const socialFacts = buildSocialContentFacts(targetToken.name, targetToken.symbol, context);

  let tgMessage = "";
  let xMessage = "";
  let xReplyMessage = "";
  let telegramDraft: TelegramMarketPostDraft | null = null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";


  const captionPlatforms: PlatformTarget[] = [];
  const captionOptions: UnifiedCaptionOptions = {};
  const contentVariants: Partial<Record<PlatformTarget, SocialContentVariant>> = {};
  const contentArchetypes: Partial<Record<PlatformTarget, SocialContentArchetype>> = {};
  const marketPlans: Partial<Record<MarketPostPlatform, MarketSocialPlan>> = {};
  if (runTelegram) {
    marketPlans.telegram = buildMarketSocialPlan({
      dataDir: DATA_DIR,
      platform: "telegram",
      today: TODAY,
      tokenId: targetToken.id,
      reason,
      slot: socialSlotFor("telegram"),
    });
    contentArchetypes.telegram = marketPlans.telegram.archetype;
    if (telegramFormat === "market-brief") {
      console.log(`▶ Step 3/TG: Generating Telegram Post in "${tone}" tone...`);
      captionOptions.telegramMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS;
      captionPlatforms.push("telegram");
      contentVariants.telegram = marketPlans.telegram.variant;
      console.log(`  Telegram variant: ${contentVariants.telegram.label} (${contentVariants.telegram.key})`);
      console.log(`  Telegram archetype: ${marketPlans.telegram.archetype.label} (${marketPlans.telegram.archetype.key})`);
    } else {
      telegramDraft = buildTelegramMarketPost({
        format: telegramFormat,
        token: {
          id: targetToken.id,
          name: targetToken.name,
          symbol: targetToken.symbol,
          price: targetToken.market.price || 0,
          priceChange24h: targetToken.market.priceChange24h || 0,
          marketCap: targetToken.market.marketCap || 0,
          volume24h: targetToken.market.volume24h || 0,
          marketCapRank: targetToken.market.marketCapRank || 0,
          riskScore: context.riskScore,
          selectionReason: reason,
        },
        context: {
          globalStats: globalStatsStr,
          sectorPerformance: sectorPerformanceStr,
          generatedAt: new Date(targetMarketAsOf),
          sourceLabel: `${formatMarketDataSourceLabel(targetToken.marketDataSource) || "CoinGecko"} snapshot`,
        },
      });
      tgMessage = [telegramDraft.captionBody, formatMarketDataAttribution(socialFacts)]
        .filter(Boolean)
        .join("\n");
      contentVariants.telegram = {
        key: telegramDraft.variantKey,
        label: telegramDraft.variantLabel,
        angle: "deterministic image-backed Telegram market format",
        promptInstruction: "Local formatter; no AI prompt required.",
      };
      console.log(`▶ Step 3/TG: Built Telegram ${telegramDraft.variantLabel} format.`);
      console.log(`  Telegram archetype: ${marketPlans.telegram.archetype.label} (${marketPlans.telegram.archetype.key})`);
    }
  }

  if (runX) {
    console.log(`▶ Step 3/X: Generating Tweet in "${tone}" tone...`);
    const isOnWebsite = onWebsiteIds.has(targetToken.id);
    captionOptions.xMaxChars = 230;
    captionPlatforms.push("x");
    marketPlans.x = buildMarketSocialPlan({
      dataDir: DATA_DIR,
      platform: "x",
      today: TODAY,
      tokenId: targetToken.id,
      reason,
      slot: socialSlotFor("x"),
    });
    contentVariants.x = marketPlans.x.variant;
    contentArchetypes.x = marketPlans.x.archetype;
    console.log(`  X variant: ${contentVariants.x.label} (${contentVariants.x.key})`);
    console.log(`  X archetype: ${marketPlans.x.archetype.label} (${marketPlans.x.archetype.key})`);

    xReplyMessage = includeLinkReply
      ? isOnWebsite
        ? `Read the $${targetToken.symbol.toUpperCase()} deep-dive and find all TokenRadar links here:\n\n${buildSocialUtmUrl(`${siteUrl}/${targetToken.id}`, {
            platform: "x",
            date: TODAY,
            surface: "market-update",
            archetypeKey: marketPlans.x.archetype.key,
            tokenId: targetToken.id,
          })}`
        : `Discover 300+ tracked and upcoming tokens through TokenRadar links:\n\n${buildSocialUtmUrl(SOCIAL.ecosystemUrl, {
            platform: "x",
            date: TODAY,
            surface: "market-update",
            archetypeKey: marketPlans.x.archetype.key,
            tokenId: targetToken.id,
          })}`
      : "";
  }

  if (captionPlatforms.length > 0) {
    console.log(`Step 3: Generating unified captions for ${captionPlatforms.join(", ")}...`);
    captionOptions.contentVariants = contentVariants;
    captionOptions.contentArchetypes = contentArchetypes;
    const captions = await generateUnifiedCaptions(
      targetToken.name,
      targetToken.symbol,
      targetToken.description || "",
      context,
      captionPlatforms,
      captionOptions,
    );

    if (runTelegram && telegramFormat === "market-brief") tgMessage = captions.telegramSummary || "";
    if (runX) xMessage = captions.xTweet || "";
  }

  if (runX && xMessage) {
    const recentXTexts = getRecentPlatformTexts(DATA_DIR, "x", 14);
    const diversified = diversifyXPostText(
      xMessage,
      recentXTexts,
      `${TODAY}:${targetToken.id}:${reason}`,
      captionOptions.xMaxChars ?? 230,
    );
    if (diversified !== xMessage) {
      console.log("  Adjusted X copy to avoid repeating recent post structure.");
      xMessage = diversified;
    }
    const finalValidation = validateSocialContent(
      xMessage,
      socialFacts,
    );
    if (!finalValidation.ok) {
      throw new Error(
        `Final X copy failed the publishing gate after diversification: ${finalValidation.issues.map((issue) => issue.code).join(", ")}`,
      );
    }

  }

  if (dryRun) {
    console.log("\n=== PRELIMINARY DRY RUN INFO ===");
    console.log(`Reason: ${selection.reason} | Time: ${timeOfDay} | Tone: ${tone}`);
  }

  // ── Fetch/render image assets ──
  let telegramImage: Buffer | null = null;
  let tokenImage: Buffer | null = null;

  if (telegramDraft?.image.kind === "market-pulse") {
    console.log("▶ Rendering Telegram market pulse image...");
    telegramImage = await renderTelegramMarketImage(telegramDraft.image.data);
    console.log(`  ✓ Telegram market image rendered (${(telegramImage.length / 1024).toFixed(1)} KB)`);
  }

  const needsTokenImage = runX || !telegramImage;
  if (needsTokenImage) {
    const tokenCard = telegramDraft?.image.kind === "token-card"
      ? telegramDraft.image.data
      : {
          symbol: targetToken.symbol.toUpperCase(),
          name: targetToken.name,
          marketCap: targetToken.market.marketCap || 0,
          volume24h: targetToken.market.volume24h || 0,
          rank: targetToken.market.marketCapRank || 0,
          risk: context.riskScore,
        };

    console.log(`▶ Fetching OG image for ${targetToken.id}...`);
    tokenImage = await fetchTokenImage(targetToken.id, tokenCard);
    if (tokenImage) {
      console.log(`  ✓ OG image fetched (${(tokenImage.length / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`  ⚠ No OG image available, will post text-only.`);
    }
  }

  if (!telegramImage) {
    telegramImage = tokenImage;
  }

  const successfulPlatforms = new Set<"telegram" | "x">();
  const alreadyPublishedPlatforms = new Set<"telegram" | "x">();
  const successfulTrackerPayloads = new Map<MarketPostPlatform, Record<string, unknown>>();
  const marketContentKey = (platform: MarketPostPlatform): string =>
    getMarketDeliveryContentKey(TODAY, platform, socialSlotFor(platform), telegramFormat);
  const deliveryAttemptId = (platform: MarketPostPlatform): string =>
    `${process.env.GITHUB_RUN_ID || "local"}:${process.env.GITHUB_RUN_ATTEMPT || "1"}:${platform}:${marketContentKey(platform)}`;
  const deliveryDetails = (platform: MarketPostPlatform) => ({
    requestedPlatform: targetPlatform,
    tokenId: targetToken.id,
    socialSlot: socialSlotFor(platform),
    format: platform === "telegram" ? telegramFormat : "market-update",
  });
  const persistSuccessfulPlatform = async (
    platform: MarketPostPlatform,
    externalId: string | number,
    publishedUrl?: string,
  ): Promise<void> => {
    const variantSurface = platform === "telegram"
      ? telegramDraft?.variantSurface ?? getTelegramMarketVariantSurface(telegramFormat)
      : "market-update";
    const plan = marketPlans[platform];
    const plannedUrl = plan
      ? buildSocialUtmUrl(onWebsiteIds.has(targetToken.id) ? `${siteUrl}/${targetToken.id}` : SOCIAL.ecosystemUrl, {
          platform,
          date: TODAY,
          surface: variantSurface,
          archetypeKey: plan.archetype.key,
          tokenId: targetToken.id,
        })
      : undefined;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform,
      requestedPlatform: targetPlatform,
      surface: variantSurface,
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      tokenSymbol: targetToken.symbol.toUpperCase(),
      reason,
      variantKey: contentVariants[platform]?.key,
      variantLabel: contentVariants[platform]?.label,
      archetypeKey: plan?.archetype.key,
      archetypeLabel: plan?.archetype.label,
      hookFamily: plan?.hookFamily,
      ctaFamily: plan?.ctaFamily,
      text: platform === "x" ? xMessage : tgMessage,
      externalId,
      plannedUrl,
      publishedUrl,
      details: {
        tone,
        socialSlot: socialSlotFor(platform),
        telegramFormat: platform === "telegram" ? telegramFormat : undefined,
        marketDataSource: targetToken.marketDataSource,
        marketDataAsOf: targetMarketAsOf,
        metricsAsOf: targetMetric?.inputDataAsOf,
      },
    });
    const trackerFile = path.join(POSTED_DIR, `${targetToken.id}-${platform}.json`);
    writeFileAtomicSync(trackerFile, JSON.stringify(trackerPayload, null, 2));
    successfulTrackerPayloads.set(platform, trackerPayload);
    await recordSocialPost({
      platform,
      contentKey: marketContentKey(platform),
      externalId,
      postedAt,
      details: buildSocialPostDetails(trackerPayload),
    });
  };
  const attachPublishedUrl = async (
    platform: MarketPostPlatform,
    publishedUrl: string,
  ): Promise<void> => {
    const existingPayload = successfulTrackerPayloads.get(platform);
    if (!existingPayload) {
      throw new Error(`Cannot attach a published URL before ${platform} post evidence exists.`);
    }
    const updatedPayload = attachPublishedUrlToSocialTrackerPayload(existingPayload, publishedUrl);
    await updateSocialPostDetails({
      platform,
      contentKey: marketContentKey(platform),
      details: buildSocialPostDetails(updatedPayload),
    });
    const trackerFile = path.join(POSTED_DIR, `${targetToken.id}-${platform}.json`);
    writeFileAtomicSync(trackerFile, JSON.stringify(updatedPayload, null, 2));
    successfulTrackerPayloads.set(platform, updatedPayload);
  };
  const reservePlatform = async (platform: MarketPostPlatform): Promise<boolean> => {
    const reservation = await reserveSocialDelivery({
      platform,
      contentKey: marketContentKey(platform),
      attemptId: deliveryAttemptId(platform),
      details: deliveryDetails(platform),
    });
    if (reservation.acquired) return true;
    if (reservation.state === "published") {
      console.log(`${platform}/${marketContentKey(platform)} is already published; treating this run as an idempotent no-op.`);
      alreadyPublishedPlatforms.add(platform);
      return false;
    }
    throw new Error(`Publishing blocked for ${platform}/${marketContentKey(platform)}: delivery is ${reservation.state}.`);
  };
  const markPlatformFailure = async (
    platform: MarketPostPlatform,
    error: unknown,
  ): Promise<void> => {
    await markSocialDeliveryStatus({
      platform,
      contentKey: marketContentKey(platform),
      attemptId: deliveryAttemptId(platform),
      status: isAmbiguousMarketCreateError(platform, error)
        ? "outcome_unknown"
        : "failed",
      error: formatErrorForLog(error),
      details: deliveryDetails(platform),
    });
  };
  const markPlatformPublished = async (
    platform: MarketPostPlatform,
    externalId: string | number,
  ): Promise<void> => {
    await markSocialDeliveryStatus({
      platform,
      contentKey: marketContentKey(platform),
      attemptId: deliveryAttemptId(platform),
      status: "published",
      externalId,
      details: deliveryDetails(platform),
    });
  };

  if (runTelegram) {
    let reserved = false;
    let publishedExternalId: string | number | undefined;
    try {
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      const tokenLink = buildSocialUtmUrl(isOnWebsite ? `${siteUrl}/${targetToken.id}` : SOCIAL.ecosystemUrl, {
        platform: "telegram",
        date: TODAY,
        surface: telegramDraft?.variantSurface ?? getTelegramMarketVariantSurface(telegramFormat),
        archetypeKey: marketPlans.telegram?.archetype.key || "single_token_snapshot",
        tokenId: targetToken.id,
      });
      const telegramFooter = getTelegramFooter(targetToken.symbol, tokenLink);
      if (!dryRun) {
        reserved = await reservePlatform("telegram");
      }

      if (!dryRun && !reserved) {
        // The durable ledger already has this post; no external write is needed.
      } else if (telegramImage) {
        // ── Photo mode: short caption (1024 char limit) ──
        const caption = buildTelegramMediaCaption(tgMessage, telegramFooter, {
          maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
          bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS,
        });
        const finalValidation = validateSocialContent(caption, socialFacts);
        if (!finalValidation.ok) {
          throw new Error(
            `Final Telegram photo caption failed the publishing gate: ${finalValidation.issues.map((issue) => issue.code).join(", ")}`,
          );
        }
        
        // Use Inline Keyboard for the main CTA if available
        const keyboard = isOnWebsite 
          ? createTelegramKeyboard([{ text: "Open TokenRadar Analytics", url: tokenLink }])
          : undefined;

        if (!dryRun) {
          const api = getApi();
          const msg = await api.sendPhoto(channelId as string, new InputFile(telegramImage), {
            caption,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          const messageId = requireTelegramMessageId(msg, "sendPhoto");
          console.log(`✅ Posted photo to Telegram (Message ID: ${messageId})`);
          publishedExternalId = messageId;
          await persistSuccessfulPlatform("telegram", messageId, tokenLink);
          successfulPlatforms.add("telegram");
        } else {
          console.log(`✅ [DRY RUN] Would have posted photo to Telegram with caption length: ${caption.length}`);
          console.log(`DEBUG CAPTION:\n${caption}`);
          if (previewDir) {
            await writeTelegramPreview({
              previewDir,
              format: telegramFormat,
              caption,
              image: telegramImage,
            });
          }
        }
      } else {
        // ── Text-only fallback ──
        let finalTgMessage = tgMessage.trim() + "\n" + telegramFooter.trim();
        const keyboard = isOnWebsite 
          ? createTelegramKeyboard([{ text: "Open TokenRadar Analytics", url: tokenLink }])
          : undefined;

        if (finalTgMessage.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT) {
          console.warn(`  ⚠ Message too long (${finalTgMessage.length}/${SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT}), trimming body...`);
          const footerWithPadding = "\n" + telegramFooter.trim();
          const maxBody = SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT - footerWithPadding.length - 3;
          let body = tgMessage.substring(0, maxBody);
          
          // Remove incomplete tag at the end if any
          const lastLt = body.lastIndexOf("<");
          const lastGt = body.lastIndexOf(">");
          if (lastLt > lastGt) {
            body = body.substring(0, lastLt);
          }
          
          // Close any broken tags before adding the ellipsis
          body = ensureHtmlTagsClosed(body, ["b", "tg-spoiler"]);
          finalTgMessage = body + "..." + footerWithPadding;

        }
        
        finalTgMessage = sanitizeHtmlForTelegram(finalTgMessage, SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT);
        const finalValidation = validateSocialContent(finalTgMessage, socialFacts);
        if (!finalValidation.ok) {
          throw new Error(
            `Final Telegram text failed the publishing gate: ${finalValidation.issues.map((issue) => issue.code).join(", ")}`,
          );
        }

        if (!dryRun) {
          const api = getApi();
          const msg = await api.sendMessage(channelId as string, finalTgMessage, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          console.log(`✅ Posted text to Telegram (Message ID: ${msg.message_id})`);
          const messageId = requireTelegramMessageId(msg, "sendMessage");
          publishedExternalId = messageId;
          await persistSuccessfulPlatform("telegram", messageId, tokenLink);
          successfulPlatforms.add("telegram");
        } else {
          console.log(`✅ [DRY RUN] Would have posted text to Telegram with length: ${finalTgMessage.length}`);
          console.log(`DEBUG MESSAGE:\n${finalTgMessage}`);
          if (previewDir) {
            await writeTelegramPreview({
              previewDir,
              format: telegramFormat,
              caption: finalTgMessage,
              image: null,
            });
          }
        }
      }
    } catch (error) {
      if (reserved && !successfulPlatforms.has("telegram")) {
        try {
          if (publishedExternalId !== undefined) {
            await markPlatformPublished("telegram", publishedExternalId);
            successfulPlatforms.add("telegram");
          } else {
            await markPlatformFailure("telegram", error);
          }
        } catch (ledgerError) {
          console.error(`❌ Failed to record Telegram delivery failure: ${formatErrorForLog(ledgerError)}`);
        }
      }
      await logError("post-market-updates-telegram", error, false);
      console.error(`❌ Failed to post Telegram message: ${formatErrorForLog(error)}`);
    }
  }

  if (runX) {
    let reserved = false;
    let publishedExternalId: string | number | undefined;
    try {
      if (!dryRun) {
        reserved = await reservePlatform("x");
        if (reserved) {
          let tweetId: string;
          if (tokenImage) {
            const altText = `TokenRadar research card for ${targetToken.name} (${targetToken.symbol.toUpperCase()}) with market cap, volume, rank, and risk snapshot.`;
            tweetId = await postTweetWithMedia(xMessage, tokenImage, "image/png", undefined, altText);
            console.log(`✅ Posted tweet with image to X (Tweet ID: ${tweetId})`);
          } else {
            tweetId = await postTweet(xMessage);
            console.log(`✅ Posted text tweet to X (Tweet ID: ${tweetId})`);
          }
          publishedExternalId = tweetId;
          await persistSuccessfulPlatform("x", tweetId);
          successfulPlatforms.add("x");

          if (xReplyMessage) {
            let replyId: string;
            try {
              replyId = await postTweet(xReplyMessage, tweetId);
              console.log(`✅ Posted reply to X (Reply ID: ${replyId})`);
            } catch (replyError) {
              await logError("post-market-updates-x-reply", replyError, false);
              console.warn(`⚠ Main tweet succeeded, but the follow-up reply failed: ${formatErrorForLog(replyError)}`);
              replyId = "";
            }
            if (replyId) {
              const xPlan = marketPlans.x;
              const publishedUrl = xPlan
                ? buildSocialUtmUrl(onWebsiteIds.has(targetToken.id) ? `${siteUrl}/${targetToken.id}` : SOCIAL.ecosystemUrl, {
                    platform: "x",
                    date: TODAY,
                    surface: "market-update",
                    archetypeKey: xPlan.archetype.key,
                    tokenId: targetToken.id,
                  })
                : undefined;
              if (publishedUrl) {
                try {
                  await attachPublishedUrl("x", publishedUrl);
                } catch (trackingError) {
                  await logError("post-market-updates-x-reply-attribution", trackingError, false);
                  console.warn(
                    `⚠ X reply succeeded, but its attribution evidence could not be updated: ${formatErrorForLog(trackingError)}`,
                  );
                }
              }
            }
          }
        }
      } else {
        console.log(`✅ [DRY RUN] Would have posted to X:`);
        console.log("\n" + "=".repeat(50));
        console.log("DEBUG TWEET:");
        console.log("-".repeat(50));
        console.log(xMessage);
        console.log("-".repeat(50));
        if (xReplyMessage) {
          console.log("DEBUG REPLY:");
          console.log(xReplyMessage);
          console.log("-".repeat(50));
        }
        console.log("=".repeat(50) + "\n");

      }
    } catch (error) {
      if (reserved && !successfulPlatforms.has("x")) {
        try {
          if (publishedExternalId !== undefined) {
            await markPlatformPublished("x", publishedExternalId);
            successfulPlatforms.add("x");
          } else {
            await markPlatformFailure("x", error);
          }
        } catch (ledgerError) {
          console.error(`❌ Failed to record X delivery failure: ${formatErrorForLog(ledgerError)}`);
        }
      }
      await logError("post-market-updates-x", error, false);
      console.error(`❌ Failed to post to X: ${formatErrorForLog(error)}`);
    }
  }

  // Successful platform writes were persisted immediately after each external create.
  if (!dryRun && successfulPlatforms.size > 0) {
    // Log success for the Daily Report
    logActivity("social-post", {
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      platform: Array.from(successfulPlatforms).join(","),
      requestedPlatform: targetPlatform,
      reason,
      tone
    });
  }

  if (dryRun) {
    console.log("✅ Dry run completed without posting or writing tracker files.");
    if (previewDir) console.log("  Local preview files were written for review.");
    return;
  }

  const requestedPlatforms: MarketPostPlatform[] = [
    ...(runTelegram ? ["telegram" as const] : []),
    ...(runX ? ["x" as const] : []),
  ];
  const failedPlatforms = requestedPlatforms.filter(
    (platform) => !successfulPlatforms.has(platform) && !alreadyPublishedPlatforms.has(platform),
  );
  if (failedPlatforms.length > 0) {
    throw new Error(`Requested market post failed for: ${failedPlatforms.join(", ")}. Successful platforms remain recorded.`);
  }
}

const isDirectExecution = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  main().catch(async (error) => {
    await logError("post-market-updates", error);
    process.exit(1);
  });
}
