/**
 * TokenRadar Telegram weekly recap.
 *
 * Posts an image-backed recap of weekly momentum, pullback, and liquidity
 * context to the Telegram channel.
 *
 * Usage:
 *   npx tsx scripts/post-telegram-weekly-recap.ts
 *   npx tsx scripts/post-telegram-weekly-recap.ts --dry-run
 *   npx tsx scripts/post-telegram-weekly-recap.ts --force
 */

import * as fs from "fs";
import * as path from "path";

import {
  SOCIAL_PLATFORM_LIMITS,
  SITE_URL,
} from "../src/lib/config";
import {
  hasSocialPost,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
} from "../src/lib/ops-ledger";
import { getSocialArchetypeByKey } from "../src/lib/social-archetypes";
import { sanitizeSocialEditorialText } from "../src/lib/social-editorial";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { buildSocialUtmUrl } from "../src/lib/social-utm";
import {
  buildTelegramMediaCaption,
  buildTelegramResearchFooter,
  createTelegramResearchKeyboard,
  isTelegramCreateOutcomeUnknownError,
  sendTelegramPhoto,
} from "../src/lib/telegram";
import { renderTelegramWeeklyRecapImage } from "../src/lib/telegram-weekly-recap-image";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import {
  buildTelegramWeeklyRecap,
  selectWeeklyRecapTokens,
} from "./lib/threads-recap";
import {
  cleanupExpiredCooldownFolders,
  loadCandidateTokens,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");
const TRACKER_FILE_NAME = "weekly-telegram-recap.json";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, TRACKER_FILE_NAME);
  const socialPostKey = `${today}:telegram-weekly-recap`;
  let deliveryReserved = false;
  let publishedExternalId: number | undefined;

  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  if (!dryRun && !force && (fs.existsSync(trackerFile) || await hasSocialPost("telegram", socialPostKey))) {
    const existing = safeReadJson<{ postedAt?: string }>(trackerFile, {});
    console.log(`Telegram weekly recap already posted today (${existing.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    console.log("Loading token candidates for Telegram weekly recap...");
    const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 250);
    const recapSelection = selectWeeklyRecapTokens(candidates);
    const recapTokenIds = Array.from(new Set([
      ...recapSelection.leaders.map((token) => token.id),
      recapSelection.pullback?.id,
      recapSelection.volumeLeader?.id,
    ].filter((tokenId): tokenId is string => Boolean(tokenId))));
    const archetype = getSocialArchetypeByKey("weekly_scoreboard");
    if (!archetype) throw new Error("Missing weekly_scoreboard social archetype.");
    const recapSnapshotTimes = recapTokenIds
      .map((tokenId) => candidates.find((candidate) => candidate.id === tokenId))
      .map((candidate) => Date.parse(candidate?.lastMarketUpdate || candidate?.fetchedAt || ""))
      .filter(Number.isFinite);
    if (recapSnapshotTimes.length !== recapTokenIds.length) {
      throw new Error("Every Telegram recap token must have a valid CoinGecko snapshot timestamp.");
    }
    const marketDataAsOf = new Date(Math.min(...recapSnapshotTimes));
    const recap = buildTelegramWeeklyRecap(recapSelection, marketDataAsOf);
    const trackedUrl = buildSocialUtmUrl(SITE_URL, {
      platform: "telegram",
      date: today,
      surface: "telegram-weekly-recap",
      archetypeKey: archetype.key,
      tokenId: recap.tokenIds.join("-"),
    });

    console.log();
    console.log("Telegram weekly recap preview:");
    console.log(recap.captionBody);
    console.log(`Tokens: ${recap.tokenIds.join(", ")}`);
    console.log(`Archetype: ${archetype.label} (${archetype.key})`);

    console.log("Rendering Telegram weekly recap card in-memory...");
    const photoBuffer = await renderTelegramWeeklyRecapImage(recap.image);
    console.log(`  Rendered ${(photoBuffer.length / 1024).toFixed(1)} KB PNG`);

    const telegramCta = {
      url: trackedUrl,
      surface: "recap" as const,
      hashtags: ["#WeeklyRecap"],
    };
    const tgFooter = [
      `Source: CoinGecko snapshot, ${marketDataAsOf.toISOString().slice(11, 16)} UTC.`,
      buildTelegramResearchFooter(telegramCta),
    ].join("\n\n");

    const caption = buildTelegramMediaCaption(
      sanitizeSocialEditorialText(recap.captionBody),
      tgFooter,
      {
        maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
        bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.MOVERS_AI_SUMMARY_CHARS,
      },
    );

    if (dryRun) {
      console.log(`Dry run - Telegram weekly recap not sent. Caption length: ${caption.length}`);
      console.log(caption);
      return;
    }

    const reservation = await reserveSocialDelivery({
      platform: "telegram",
      contentKey: socialPostKey,
      details: {
        surface: "telegram-weekly-recap",
        tokenIds: recap.tokenIds,
        marketDataSource: "coingecko-live",
        marketDataAsOf: marketDataAsOf.toISOString(),
      },
    });
    if (!reservation.acquired) {
      if (reservation.state === "published") {
        console.log("Telegram weekly recap delivery is already published; treating this run as an idempotent no-op.");
        return;
      }
      throw new Error(`Telegram weekly recap delivery is ${reservation.state}; reconcile it before retrying.`);
    }
    deliveryReserved = true;

    const messageId = await sendTelegramPhoto(photoBuffer, caption, channelId!, {
      replyMarkup: createTelegramResearchKeyboard(telegramCta),
    });
    publishedExternalId = messageId;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform: "telegram",
      surface: "telegram-weekly-recap",
      reason: "weekly-recap",
      variantKey: "weekly-recap",
      variantLabel: "Weekly Recap",
      archetypeKey: archetype.key,
      archetypeLabel: archetype.label,
      hookFamily: archetype.hookFamily,
      ctaFamily: archetype.ctaFamily,
      text: caption,
      externalId: messageId,
      plannedUrl: trackedUrl,
      publishedUrl: trackedUrl,
      details: {
        tokenIds: recap.tokenIds,
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
      platform: "telegram",
      contentKey: socialPostKey,
      externalId: messageId,
      postedAt,
      details: buildSocialPostDetails(trackerPayload),
    });

    console.log(`Telegram weekly recap sent successfully (msg_id: ${messageId})`);
  } catch (error) {
    if (deliveryReserved) {
      const errorText = formatErrorForLog(error);
      await markSocialDeliveryStatus({
        platform: "telegram",
        contentKey: socialPostKey,
        status: publishedExternalId !== undefined
          ? "published"
          : isTelegramCreateOutcomeUnknownError(error)
            ? "outcome_unknown"
            : "failed",
        externalId: publishedExternalId,
        error: errorText,
        details: { surface: "telegram-weekly-recap" },
      });
    }
    console.error(`Telegram weekly recap failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
