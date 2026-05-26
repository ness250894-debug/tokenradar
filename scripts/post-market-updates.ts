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

import { logError, logActivity } from "../src/lib/reporter";
import { generateUnifiedCaptions, type PlatformTarget, type UnifiedCaptionOptions } from "../src/lib/gemini";
import { buildTelegramMediaCaption, createTelegramKeyboard, getApi, sanitizeHtmlForTelegram } from "../src/lib/telegram";
import { diversifyXPostText, postTweet, postTweetWithMedia } from "../src/lib/x-client";
import { fetchTokenImage } from "../src/lib/og-fetcher";
import {
  MARKET_UPDATE_VARIANT_COOLDOWN_DAYS,
  SOCIAL,
  SOCIAL_PLATFORM_LIMITS,
  getTelegramFooter,
} from "../src/lib/config";
import { selectSocialContentVariant, type SocialContentVariant } from "../src/lib/social-variety";
import { listSocialPostContentKeys, recordSocialPost } from "../src/lib/ops-ledger";
import { safeReadJson, loadEnv, ensureDirSync, formatErrorForLog } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone, ensureHtmlTagsClosed } from "../src/lib/shared-utils";
import { getRecentPlatformTexts, getRecentSocialVariantKeys } from "./lib/social-history";
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
  selectToken,
} from "./lib/token-selection";
import { fetchGlobalMarketData, fetchTrendingCategories } from "../src/lib/coingecko";
// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

type MarketPostPlatform = "telegram" | "x";

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

function getTelegramFormatLabel(format: TelegramMarketFormat): string {
  switch (format) {
    case "market-pulse":
      return "Market Pulse";
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

function parseMarketUpdateTokenId(contentKey: string): string | null {
  const parts = contentKey.split(":");
  return parts.length >= 3 && parts[1] === "market-update" ? parts[2] || null : null;
}

async function getD1PostedMarketUpdateTokens(
  today: string,
  platforms: MarketPostPlatform[],
): Promise<Set<string>> {
  const posted = new Set<string>();
  for (const platform of platforms) {
    const keys = await listSocialPostContentKeys(platform, `${today}:market-update:`);
    for (const key of keys) {
      const tokenId = parseMarketUpdateTokenId(key);
      if (tokenId) posted.add(tokenId);
    }
  }
  return posted;
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
  if (!dryRun) {
    cleanupExpiredCooldownFolders(DATA_DIR);
    ensureDirSync(POSTED_DIR);
  }

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";
  if (runX) console.log(`  X Link Reply: ${includeLinkReply ? "enabled" : "disabled"}`);

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  ✗ Missing Telegram credentials (required for telegram/all platform).");
      process.exit(1);
    }
    if (runX) {
      const missingX = [];
      if (!process.env.X_OAUTH2_CLIENT_ID) missingX.push("X_OAUTH2_CLIENT_ID");
      if (!process.env.X_OAUTH2_CLIENT_SECRET) missingX.push("X_OAUTH2_CLIENT_SECRET");
      if (!process.env.X_OAUTH2_REFRESH_TOKEN) missingX.push("X_OAUTH2_REFRESH_TOKEN");

      if (missingX.length > 0) {
        console.error(`  ✗ Missing X (Twitter) credentials: ${missingX.join(", ")}`);
        console.error("    Run 'npx tsx scripts/generate-x-token.ts' to set up OAuth 2.0.");
        process.exit(1);
      }
    }
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
  if (!dryRun) {
    const d1TodayPosted = await getD1PostedMarketUpdateTokens(
      TODAY,
      [
        ...(runTelegram ? ["telegram" as const] : []),
        ...(runX ? ["x" as const] : []),
      ],
    );
    for (const tokenId of d1TodayPosted) todayPosted.add(tokenId);
  }
  console.log(`  Already posted today: ${todayPosted.size} tokens`);
  console.log(`  Posted in last 30 days: ${recentlyPosted.size} tokens`);

  // 3. Fetch Macro-Market Context (Global & Sector trends)
  console.log(`\n▶ Step 2a: Fetching Macro Market Context...`);
  let globalStatsStr = "";
  let sectorPerformanceStr = "";

  try {
    const globalData = await fetchGlobalMarketData();
    if (globalData) {
      const mcapUSD = globalData.total_market_cap?.usd || 0;
      const mcapChange = globalData.market_cap_change_percentage_24h_usd || 0;
      const btcDom = globalData.market_cap_percentage?.btc || 0;
      
      const mcapStr = mcapUSD >= 1e12 
        ? `$${(mcapUSD / 1e12).toFixed(2)}T` 
        : `$${(mcapUSD / 1e9).toFixed(0)}B`;
        
      globalStatsStr = `${mcapStr} Total Cap (${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(1)}% 24h), BTC Dominance: ${btcDom.toFixed(1)}%`;
    }

    const sectors = await fetchTrendingCategories(3);
    if (sectors.length > 0) {
      sectorPerformanceStr = sectors
        .map(s => `${s.name} (${s.market_cap_change_24h && s.market_cap_change_24h >= 0 ? "+" : ""}${s.market_cap_change_24h?.toFixed(1)}%)`)
        .join(", ");
    }
    
    if (globalStatsStr) console.log(`  ✦ Global: ${globalStatsStr}`);
    if (sectorPerformanceStr) console.log(`  ✦ Sectors: ${sectorPerformanceStr}`);
  } catch (err) {
    console.warn("  ⚠ Failed to fetch macro context, skipping...");
  }

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
    // Add Community & Developer Stats
    twitterFollowers: targetToken.community?.twitterFollowers || 0,
    redditSubscribers: targetToken.community?.redditSubscribers || 0,
    githubCommits4Weeks: targetToken.developer?.commits4Weeks || 0,
    socialContext,
    sentimentScore,
    trendingContext,
    globalStats: globalStatsStr,
    sectorPerformance: sectorPerformanceStr,
    timeOfDay,
    tone,
    selectionReason: reason
  };

  let tgMessage = "";
  let xMessage = "";
  let xReplyMessage = "";
  let telegramDraft: TelegramMarketPostDraft | null = null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";


  const tgFooter = getTelegramFooter(targetToken.symbol);
  const captionPlatforms: PlatformTarget[] = [];
  const captionOptions: UnifiedCaptionOptions = {};
  const contentVariants: Partial<Record<PlatformTarget, SocialContentVariant>> = {};
  if (runTelegram) {
    if (telegramFormat === "market-brief") {
      console.log(`▶ Step 3/TG: Generating Telegram Post in "${tone}" tone...`);
      captionOptions.telegramMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS;
      captionPlatforms.push("telegram");
      contentVariants.telegram = selectSocialContentVariant({
        platform: "telegram",
        usedVariantKeys: getRecentSocialVariantKeys(
          DATA_DIR,
          "telegram",
          MARKET_UPDATE_VARIANT_COOLDOWN_DAYS,
          new Date(),
          "market-update",
        ),
        seedParts: [TODAY, "telegram", targetToken.id, reason, "market-update"],
      });
      console.log(`  Telegram variant: ${contentVariants.telegram.label} (${contentVariants.telegram.key})`);
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
          riskScore: context.riskScore || 5,
          selectionReason: reason,
        },
        context: {
          globalStats: globalStatsStr,
          sectorPerformance: sectorPerformanceStr,
          generatedAt: new Date(),
        },
      });
      tgMessage = telegramDraft.captionBody;
      contentVariants.telegram = {
        key: telegramDraft.variantKey,
        label: telegramDraft.variantLabel,
        angle: "deterministic image-backed Telegram market format",
        promptInstruction: "Local formatter; no AI prompt required.",
      };
      console.log(`▶ Step 3/TG: Built Telegram ${telegramDraft.variantLabel} format.`);
    }
  }

  if (runX) {
    console.log(`▶ Step 3/X: Generating Tweet in "${tone}" tone...`);
    const isOnWebsite = onWebsiteIds.has(targetToken.id);
    captionOptions.xMaxChars = 260;
    captionPlatforms.push("x");
    contentVariants.x = selectSocialContentVariant({
      platform: "x",
      usedVariantKeys: getRecentSocialVariantKeys(
        DATA_DIR,
        "x",
        MARKET_UPDATE_VARIANT_COOLDOWN_DAYS,
        new Date(),
        "market-update",
      ),
      seedParts: [TODAY, "x", targetToken.id, reason, "market-update"],
    });
    console.log(`  X variant: ${contentVariants.x.label} (${contentVariants.x.key})`);

    xReplyMessage = includeLinkReply
      ? isOnWebsite
        ? `Read the $${targetToken.symbol.toUpperCase()} deep-dive and find all TokenRadar links here:\n\n${SOCIAL.ecosystemUrl}`
        : `Discover 300+ tracked and upcoming tokens through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`
      : "";
  }

  if (captionPlatforms.length > 0) {
    console.log(`Step 3: Generating unified captions for ${captionPlatforms.join(", ")}...`);
    captionOptions.contentVariants = contentVariants;
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
      captionOptions.xMaxChars ?? 260,
    );
    if (diversified !== xMessage) {
      console.log("  Adjusted X copy to avoid repeating recent post structure.");
      xMessage = diversified;
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
          risk: context.riskScore || 5,
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
  const successfulExternalIds = new Map<"telegram" | "x", string | number>();

  if (runTelegram) {
    try {
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      const tokenLink = `${siteUrl}/${targetToken.id}`;

      if (telegramImage) {
        // ── Photo mode: short caption (1024 char limit) ──
        const caption = buildTelegramMediaCaption(tgMessage, tgFooter, {
          maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
          bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS,
        });
        
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
          console.log(`✅ Posted photo to Telegram (Message ID: ${msg.message_id})`);
          successfulPlatforms.add("telegram");
          successfulExternalIds.set("telegram", msg.message_id);
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
        let finalTgMessage = tgMessage.trim() + "\n" + tgFooter.trim();
        const keyboard = isOnWebsite 
          ? createTelegramKeyboard([{ text: "Open TokenRadar Analytics", url: tokenLink }])
          : undefined;

        if (finalTgMessage.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT) {
          console.warn(`  ⚠ Message too long (${finalTgMessage.length}/${SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT}), trimming body...`);
          const footerWithPadding = "\n" + tgFooter.trim();
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

        if (!dryRun) {
          const api = getApi();
          const msg = await api.sendMessage(channelId as string, finalTgMessage, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          console.log(`✅ Posted text to Telegram (Message ID: ${msg.message_id})`);
          successfulPlatforms.add("telegram");
          successfulExternalIds.set("telegram", msg.message_id);
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
      await logError("post-market-updates-telegram", error, false);
      console.error(`❌ Failed to post Telegram message: ${formatErrorForLog(error)}`);
    }
  }

  if (runX) {
    try {
      if (!dryRun) {
        let tweetId: string;
        if (tokenImage) {
          tweetId = await postTweetWithMedia(xMessage, tokenImage);
          console.log(`✅ Posted tweet with image to X (Tweet ID: ${tweetId})`);
        } else {
          tweetId = await postTweet(xMessage);
          console.log(`✅ Posted text tweet to X (Tweet ID: ${tweetId})`);
        }
        successfulPlatforms.add("x");
        successfulExternalIds.set("x", tweetId);

        if (xReplyMessage) {
          try {
            const replyId = await postTweet(xReplyMessage, tweetId);
            console.log(`✅ Posted reply to X (Reply ID: ${replyId})`);
          } catch (replyError) {
            await logError("post-market-updates-x-reply", replyError, false);
            console.warn(`⚠ Main tweet succeeded, but the follow-up reply failed: ${formatErrorForLog(replyError)}`);
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
      await logError("post-market-updates-x", error, false);
      console.error(`❌ Failed to post to X: ${formatErrorForLog(error)}`);
    }
  }

  // Only mark platforms that actually posted successfully.
  if (!dryRun && successfulPlatforms.size > 0) {
    for (const platform of successfulPlatforms) {
      const variantSurface = platform === "telegram"
        ? telegramDraft?.variantSurface ?? getTelegramMarketVariantSurface(telegramFormat)
        : "market-update";
      const tf = path.join(POSTED_DIR, `${targetToken.id}-${platform}.json`);
      if (!fs.existsSync(tf)) {
        fs.writeFileSync(tf, JSON.stringify({ 
          postedAt: new Date().toISOString(), 
          platform,
          requestedPlatform: targetPlatform,
          reason,
          variantKey: contentVariants[platform]?.key,
          variantLabel: contentVariants[platform]?.label,
          variantPlatform: platform,
          variantSurface,
          ...(platform === "x" ? { xText: xMessage } : {}),
          ...(platform === "telegram" ? { telegramText: tgMessage } : {}),
        }, null, 2));
      }
      await recordSocialPost({
        platform,
        contentKey: `${TODAY}:market-update:${targetToken.id}`,
        externalId: successfulExternalIds.get(platform),
        details: {
          tokenId: targetToken.id,
          tokenName: targetToken.name,
          requestedPlatform: targetPlatform,
          reason,
          tone,
          variantKey: contentVariants[platform]?.key,
          variantLabel: contentVariants[platform]?.label,
          variantSurface,
          ...(platform === "x" ? { xText: xMessage } : {}),
          ...(platform === "telegram" ? { telegramText: tgMessage } : {}),
        },
      });
    }

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

  if (successfulPlatforms.size === 0) {
    console.error("❌ Failed to post on all target platforms.");
    process.exit(1);
  }
}

main().catch(async (error) => {
  await logError("post-market-updates", error);
  process.exit(1);
});
