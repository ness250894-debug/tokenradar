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
import { generateTokenSummary, generateTweet, callAIWithFallback } from "../src/lib/gemini";
import { createTelegramKeyboard, getApi } from "../src/lib/telegram";
import { postTweet, postTweetWithMedia, searchTweets, likeTweet } from "../src/lib/x-client";
import { fetchTokenImage } from "../src/lib/og-fetcher";
import { REFERRAL_LINKS_HTML, SOCIAL, SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";
import { safeReadJson, loadEnv, ensureDirSync } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import {
  type MetricData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";
import { fetchGlobalMarketData, fetchTrendingCategories } from "../src/lib/coingecko";
import { sanitizeHtmlForTelegram } from "../src/lib/telegram";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Utilities — Moved to src/lib ───────────────────────────

/**
 * Perform a 'Vibe Check' on X for a specific token symbol.
 * Fetches recent tweets and uses AI to determine community sentiment.
 * 
 * @returns { score: number, snippets: string, tweetIds: string[] }
 */
async function getSocialVibe(symbol: string): Promise<{ score: number; snippets: string; tweetIds: string[] }> {
  console.log(`▶ Vibe Checking $${symbol.toUpperCase()} on X...`);
  const tweets = await searchTweets(`$${symbol.toUpperCase()}`, 15);
  
  if (tweets.length === 0) {
    console.log(`  ⚠ No recent social activity found for $${symbol.toUpperCase()}.`);
    return { score: 0.5, snippets: "", tweetIds: [] };
  }

  const snippets = tweets.map((t: any) => t.text).join("\n---\n");
  const tweetIds = tweets.map((t: any) => t.id);

  const prompt = `
    Analyze the following recent tweets about $${symbol.toUpperCase()} and provide a sentiment score between 0 and 1.
    0.0 = Extremely Bearish / Scam / Rug-pull warning
    0.5 = Neutral / Static / Mixed
    1.0 = Extremely Bullish / Strong Narrative / High Legitimacy

    TWEETS:
    ${snippets.substring(0, 2000)}

    Respond with ONLY a decimal number.
  `;

  try {
    const result = await callAIWithFallback("You are a sentiment analyst.", prompt, 64);
    const score = parseFloat(result.content.trim()) || 0.5;
    console.log(`  ✦ Social Sentiment Score: ${score.toFixed(2)}`);
    return { score, snippets, tweetIds };
  } catch (err) {
    console.warn("  ⚠ Vibe Check AI failed, using neutral score.");
    return { score: 0.5, snippets, tweetIds };
  }
}



// ── Deduplication & Token Selection: imported from ./lib/token-selection.ts ──

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = platformIdx !== -1 ? args[platformIdx + 1] : "all"; // x, telegram, all

  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 1;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 500;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Market Updates v2    ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Target Range: #${startRank} — #${endRank}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const TODAY = new Date().toISOString().split('T')[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  
  ensureDirSync(POSTED_DIR);

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";

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
  const todayPosted = getTodayPostedTokens(DATA_DIR, TODAY);
  const recentlyPosted = getRecentlyPostedTokens(DATA_DIR);
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
  const selection = await selectToken(candidateTokens, todayPosted, recentlyPosted, metricsDir, allTokensRegistry, targetPlatform as "x" | "telegram" | "all");

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

  // ── Step 2b: X Vibe Check (Agentic Integration) ──
  let socialContext = "";
  let sentimentScore = 0.5;
  let researchTweetIds: string[] = [];

  if (runX) {
    const vibe = await getSocialVibe(targetToken.symbol);
    socialContext = vibe.snippets;
    sentimentScore = vibe.score;
    researchTweetIds = vibe.tweetIds;
  }

  const context = {
    ...targetMetric,
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    marketCap: targetToken.market.marketCap,
    marketCapRank: targetToken.market.marketCapRank,
    // Add Community & Developer Stats
    twitterFollowers: (targetToken as any).community?.twitterFollowers || 0,
    redditSubscribers: (targetToken as any).community?.redditSubscribers || 0,
    githubCommits4Weeks: (targetToken as any).developer?.commits4Weeks || 0,
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";


  if (runTelegram) {
    console.log(`▶ Step 3/TG: Generating Telegram Post in "${tone}" tone...`);
    const aiSummary = await generateTokenSummary(targetToken.name, targetToken.symbol, targetToken.description || "", context);
    const sanitized = sanitizeHtmlForTelegram(aiSummary, SOCIAL_PLATFORM_LIMITS.TELEGRAM.AI_SUMMARY_CHARS);
    tgMessage = sanitized;
  }

  if (runX) {
    console.log(`▶ Step 3/X: Generating Tweet in "${tone}" tone...`);
    const isOnWebsite = onWebsiteIds.has(targetToken.id);
    xMessage = await generateTweet(targetToken.name, targetToken.symbol, context);
    
    if (isOnWebsite) {
      xReplyMessage = `📖 Read our full deep-dive data report on $${targetToken.symbol.toUpperCase()} here:\n\n${siteUrl}/${targetToken.id}`;
    } else {
      xReplyMessage = `✨ Newly discovered alpha! Discover 300+ tracked and upcoming tokens on our live dashboard here:\n\n${siteUrl}`;
    }
  }

  if (dryRun) {
    console.log("\n=== PRELIMINARY DRY RUN INFO ===");
    console.log(`Reason: ${selection.reason} | Time: ${timeOfDay} | Tone: ${tone}`);
  }

  // Save tracking info immediately (Decentralized)
  const trackerFile = path.join(POSTED_DIR, `${targetToken.id}.json`);

  // ── Fetch OG image (shared between TG and X) ──
  let tokenImage: Buffer | null = null;
  console.log(`▶ Fetching OG image for ${targetToken.id}...`);
  tokenImage = await fetchTokenImage(targetToken.id, {
    symbol: targetToken.symbol.toUpperCase(),
    name: targetToken.name,
    price: targetToken.market.price >= 1 ? `$${targetToken.market.price.toFixed(2)}` : `$${targetToken.market.price.toFixed(6)}`,
    change: targetToken.market.priceChange24h,
    risk: context.riskScore || 5,
  });
  if (tokenImage) {
    console.log(`  ✓ OG image fetched (${(tokenImage.length / 1024).toFixed(1)} KB)`);
  } else {
    console.warn(`  ⚠ No OG image available, will post text-only.`);
  }

  let posted = false;

  if (runTelegram) {
    try {
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      const tokenLink = `${siteUrl}/${targetToken.id}`;

      const tgFooter = `
<b>🌐 The TokenRadar Ecosystem:</b>
📊 <a href="${siteUrl}">TokenRadar Dashboard</a> | 𝕏 <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ✈️ <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${targetToken.symbol.toUpperCase()} #Crypto
`;

      if (tokenImage) {
        // ── Photo mode: short caption (1024 char limit) ──
        const photoSummary = sanitizeHtmlForTelegram(tgMessage, SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS);
        let caption = photoSummary + "\n\n" + tgFooter.trim();
        
        // Use Inline Keyboard for the main CTA if available
        const keyboard = isOnWebsite 
          ? createTelegramKeyboard([{ text: "📈 View Full Analytics", url: tokenLink }])
          : undefined;

        if (caption.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT) {
          // Trim the summary further to fit
          const footerWithPadding = "\n\n" + tgFooter.trim();
          const maxBody = SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT - footerWithPadding.length - 3;
          let cutAt = photoSummary.lastIndexOf("\n", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = photoSummary.lastIndexOf(" ", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = maxBody;
          caption = photoSummary.substring(0, cutAt) + "..." + footerWithPadding;
        }

        if (!dryRun) {
          const api = getApi();
          const msg = await api.sendPhoto(channelId as string, new InputFile(tokenImage), {
            caption,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          console.log(`✅ Posted photo to Telegram (Message ID: ${msg.message_id})`);
        } else {
          console.log(`✅ [DRY RUN] Would have posted photo to Telegram with caption length: ${caption.length}`);
          console.log(`DEBUG CAPTION:\n${caption}`);
        }
      } else {
        // ── Text-only fallback ──
        let finalTgMessage = tgMessage + "\n\n" + tgFooter.trim();
        const keyboard = isOnWebsite 
          ? createTelegramKeyboard([{ text: "📈 View Full Analytics", url: tokenLink }])
          : undefined;

        if (finalTgMessage.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT) {
          console.warn(`  ⚠ Message too long (${finalTgMessage.length}/${SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT}), trimming body...`);
          const footerWithPadding = "\n\n" + tgFooter.trim();
          const maxBody = SOCIAL_PLATFORM_LIMITS.TELEGRAM.TEXT_LIMIT - footerWithPadding.length - 3;
          let cutAt = tgMessage.lastIndexOf("\n", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = tgMessage.lastIndexOf(" ", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = maxBody;
          finalTgMessage = tgMessage.substring(0, cutAt) + "..." + footerWithPadding;
        }
        
        if (!dryRun) {
          const api = getApi();
          const msg = await api.sendMessage(channelId as string, finalTgMessage, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          console.log(`✅ Posted text to Telegram (Message ID: ${msg.message_id})`);
        } else {
          console.log(`✅ [DRY RUN] Would have posted text to Telegram with length: ${finalTgMessage.length}`);
          console.log(`DEBUG MESSAGE:\n${finalTgMessage}`);
        }
      }
      posted = true;
    } catch (error) {
      await logError("post-market-updates-telegram", error, false);
      console.error("❌ Failed to post Telegram message:", error);
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
        posted = true;

        try {
          const replyId = await postTweet(xReplyMessage, tweetId);
          console.log(`✅ Posted reply to X (Reply ID: ${replyId})`);
        } catch (replyError) {
          await logError("post-market-updates-x-reply", replyError, false);
          console.warn("⚠ Main tweet succeeded, but the follow-up reply failed:", replyError);
        }

        // ── Passive Engagement ──
        if (researchTweetIds.length > 0) {
          try {
            console.log(`▶ Performing passive engagement (liking top research tweets)...`);
            const toLike = researchTweetIds.slice(0, 2);
            for (const id of toLike) {
              await likeTweet(id);
            }
          } catch (engagementError) {
            await logError("post-market-updates-x-engagement", engagementError, false);
            console.warn("⚠ X post succeeded, but passive engagement failed:", engagementError);
          }
        }
      } else {
        console.log(`✅ [DRY RUN] Would have posted to X:`);
        console.log(`DEBUG TWEET:\n${xMessage}`);
        console.log(`DEBUG REPLY:\n${xReplyMessage}`);
        if (researchTweetIds.length > 0) {
          console.log(`DEBUG: Would have liked ${Math.min(2, researchTweetIds.length)} research tweets.`);
        }
      }
    } catch (error) {
      await logError("post-market-updates-x", error, false);
      console.error("❌ Failed to post to X:", error);
    }
  }

  // Only mark as posted if at least one platform succeeded
  if (!dryRun && posted && !fs.existsSync(trackerFile)) {
    fs.writeFileSync(trackerFile, JSON.stringify({ 
      postedAt: new Date().toISOString(), 
      platform: targetPlatform,
      reason,
    }, null, 2));

    // Log success for the Daily Report
    logActivity("social-post", {
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      platform: targetPlatform,
      reason,
      tone
    });
  }

  if (!posted) {
    console.error("❌ Failed to post on all target platforms.");
    process.exit(1);
  }
}

main().catch(async (error) => {
  await logError("post-market-updates", error);
  process.exit(1);
});
