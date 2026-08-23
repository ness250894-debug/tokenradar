/**
 * TokenRadar Telegram native Movers image generator
 *
 * Extracts the top 5 gainers from live CoinGecko data (via loadCandidateTokens),
 * renders a branded image in-memory, and sends it to Telegram with an AI caption.
 *
 * Usage:
 *   npx tsx scripts/post-daily-movers.ts
 *   npx tsx scripts/post-daily-movers.ts --dry-run
 *   npx tsx scripts/post-daily-movers.ts --force
 */

import * as fs from "fs";
import * as path from "path";

import { buildTelegramMediaCaption, isTelegramCreateOutcomeUnknownError, sendTelegramPhoto } from "../src/lib/telegram";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { generateMoversImage, type MoverToken } from "../src/lib/movers-generator";
import {
  hasSocialPost,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
} from "../src/lib/ops-ledger";
import { buildGroundedMoversCaption } from "../src/lib/grounded-movers-caption";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import {
  cleanupExpiredCooldownFolders,
  getRecentlyPostedTokens,
  hasSocialImageSafeText,
  loadCandidateTokens,
} from "./lib/token-selection";
import {
  SOCIAL_PLATFORM_LIMITS,
  SOCIAL_VARIANT_COOLDOWN_DAYS,
  getTelegramResearchLinkHtml,
  SITE_URL,
  TELEGRAM_SIGNAL_NOTE,
} from "../src/lib/config";
import { selectSocialContentVariant } from "../src/lib/social-variety";
import { buildSocialUtmUrl } from "../src/lib/social-utm";
import { getRecentSocialVariantKeys } from "./lib/social-history";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");

/**
 * Maximum 24h change percentage to consider legitimate.
 * Tokens above this threshold are likely pump-and-dump scams
 * or data errors from CoinGecko and are excluded.
 */
const MAX_CHANGE_THRESHOLD = 500;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, "daily-telegram-movers.json");
  const socialPostKey = `${today}:telegram-movers`;
  let deliveryReserved = false;
  let publishedExternalId: number | undefined;
  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  if (!dryRun && !force && (fs.existsSync(trackerFile) || await hasSocialPost("telegram", socialPostKey))) {
    const existing = safeReadJson<{ postedAt?: string }>(trackerFile, {});
    console.log(`Telegram movers card already sent today (${existing.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    // ── Load LIVE data from CoinGecko (same source as market updates) ──
    console.log("Loading live token data from CoinGecko...");
    const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 500);

    if (candidates.length === 0) {
      throw new Error("No candidate tokens loaded. Check CoinGecko API and data/tokens/.");
    }

    console.log(`  Loaded ${candidates.length} candidates with live prices.`);

    // ── Select top 5 gainers with quality filters ──
    const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR, "telegram");
    if (!force) {
      console.log(`  Telegram movers cooldown pool: ${recentlyPosted.size} tokens from recent posts.`);
    }

    const eligibleMovers = candidates
      .filter((t) =>
        t.market.priceChange24h > 0 &&
        t.market.priceChange24h <= MAX_CHANGE_THRESHOLD &&
        t.market.price > 0 &&
        t.market.marketCap > 0 &&
        hasSocialImageSafeText(t)
      )
      .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);
    const freshMovers = eligibleMovers.filter((token) => !recentlyPosted.has(token.id));
    const cooldownFillers = eligibleMovers.filter((token) => recentlyPosted.has(token.id));
    const selectedMoverTokens = [
      ...freshMovers.slice(0, 5),
      ...cooldownFillers.slice(0, Math.max(0, 5 - freshMovers.length)),
    ].slice(0, 5);

    if (!force && selectedMoverTokens.some((token) => recentlyPosted.has(token.id))) {
      console.warn("  Not enough fresh movers after cooldown filtering; filled remaining slots with recent movers.");
    }

    const movers: MoverToken[] = selectedMoverTokens.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl,
      price: t.market.price,
      change24h: t.market.priceChange24h,
    }));

    if (movers.length === 0) {
      throw new Error("No eligible gainers found after filtering. Market may be entirely red.");
    }

    console.log("Top 5 Gainers:");
    movers.forEach((m, i) =>
      console.log(`  ${i + 1}. ${m.symbol.toUpperCase()} (${m.name}): $${m.price >= 1 ? m.price.toFixed(2) : m.price.toFixed(6)} +${m.change24h.toFixed(2)}%`)
    );

    // ── Render image in-memory (no file saved) ──
    const variant = selectSocialContentVariant({
      platform: "telegram",
      usedVariantKeys: force
        ? []
        : getRecentSocialVariantKeys(
            DATA_DIR,
            "telegram",
            SOCIAL_VARIANT_COOLDOWN_DAYS,
            new Date(`${today}T00:00:00.000Z`),
            "telegram-movers",
          ),
      seedParts: [today, "telegram", "movers"],
      date: new Date(`${today}T00:00:00.000Z`),
    });
    console.log(`Telegram movers variant: ${variant.label} (${variant.key})`);
    console.log("Rendering movers card in-memory...");
    const photoBuffer = await generateMoversImage(movers);
    console.log(`  ✓ Rendered ${(photoBuffer.length / 1024).toFixed(1)} KB PNG`);

    const snapshotTimes = selectedMoverTokens
      .map((token) => Date.parse(token.lastMarketUpdate || token.fetchedAt || ""))
      .filter(Number.isFinite);
    if (snapshotTimes.length !== selectedMoverTokens.length) {
      throw new Error("Every movers item must have a valid CoinGecko snapshot timestamp.");
    }
    const caption = buildGroundedMoversCaption(
      movers,
      new Date(Math.min(...snapshotTimes)),
      "CoinGecko",
    );
    const trackedUrl = buildSocialUtmUrl(SITE_URL, {
      platform: "telegram",
      date: today,
      surface: "telegram-movers",
      archetypeKey: "movers-card",
      tokenId: movers.map((mover) => mover.id).join("-"),
    });

    const tgFooter = `
${getTelegramResearchLinkHtml(trackedUrl)}

${TELEGRAM_SIGNAL_NOTE}
#Crypto #TokenRadar #MarketMovers
`;

    const sanitizedCaption = buildTelegramMediaCaption(caption, tgFooter, {
      maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
      bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.MOVERS_AI_SUMMARY_CHARS,
    });

    if (dryRun) {
      console.log(`\nDry run - movers card not sent. Caption length: ${sanitizedCaption.length}`);
      console.log(sanitizedCaption);
      return;
    }

    const reservation = await reserveSocialDelivery({
      platform: "telegram",
      contentKey: socialPostKey,
      details: {
        surface: "telegram-movers",
        movers: movers.map((mover) => mover.id),
        marketDataSource: "coingecko-live",
        marketDataAsOf: new Date(Math.min(...snapshotTimes)).toISOString(),
      },
    });
    if (!reservation.acquired) {
      if (reservation.state === "published") {
        console.log("Telegram movers delivery is already published; treating this run as an idempotent no-op.");
        return;
      }
      throw new Error(`Telegram movers delivery is ${reservation.state}; reconcile it before retrying.`);
    }
    deliveryReserved = true;

    // ── Post to Telegram (buffer goes directly, never saved) ──
    const msgId = await sendTelegramPhoto(photoBuffer, sanitizedCaption, channelId!);
    publishedExternalId = msgId;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform: "telegram",
      surface: "telegram-movers",
      reason: "daily-movers",
      archetypeKey: "movers-card",
      archetypeLabel: "Market movers card",
      variantKey: variant.key,
      variantLabel: variant.label,
      text: sanitizedCaption,
      externalId: msgId,
      plannedUrl: trackedUrl,
      publishedUrl: trackedUrl,
      details: {
        movers: movers.map((mover) => mover.id),
        marketDataSource: "coingecko-live",
        marketDataAsOf: new Date(Math.min(...snapshotTimes)).toISOString(),
        socialSlot: process.env.SOCIAL_SLOT,
      },
    });
    writeFileAtomicSync(
      trackerFile,
      JSON.stringify(trackerPayload, null, 2),
    );
    await recordSocialPost({
      platform: "telegram",
      contentKey: socialPostKey,
      externalId: msgId,
      postedAt,
      details: buildSocialPostDetails(trackerPayload),
    });
    console.log(`✅ Telegram movers card sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    if (deliveryReserved) {
      const errorText = formatErrorForLog(err);
      await markSocialDeliveryStatus({
        platform: "telegram",
        contentKey: socialPostKey,
        status: publishedExternalId !== undefined
          ? "published"
          : isTelegramCreateOutcomeUnknownError(err)
            ? "outcome_unknown"
            : "failed",
        externalId: publishedExternalId,
        error: errorText,
        details: { surface: "telegram-movers" },
      });
    }
    console.error(`Telegram movers card failed: ${formatErrorForLog(err)}`);
    process.exit(1);
  }
}

main();
