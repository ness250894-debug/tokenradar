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
import { loadResearchCohort, evaluateResearchCohort, buildResearchFollowUpText, getFollowUpEndpointTimes } from "./lib/social-follow-up";

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
import { buildProtectedSocialEntitiesForToken, sanitizeSocialEditorialText } from "../src/lib/social-editorial";
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
  type TelegramWeeklyRecap,
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
    const archetype = getSocialArchetypeByKey("weekly_scoreboard");
    if (!archetype) throw new Error("Missing weekly_scoreboard social archetype.");
    const now = new Date();
    const followUps = evaluateResearchCohort(await loadResearchCohort(DATA_DIR, "telegram", now), candidates, now);
    let marketDataAsOf: string | undefined;
    let recap: TelegramWeeklyRecap;
    if (followUps.length) {
      const { first, last } = getFollowUpEndpointTimes(followUps);
      marketDataAsOf = first;
      recap = {
        captionBody: buildResearchFollowUpText(followUps, SOCIAL_PLATFORM_LIMITS.TELEGRAM.MOVERS_AI_SUMMARY_CHARS),
        image: {
          title: "Research follow-up",
          subtitle: "Changes since the original recorded prices",
          leaders: [],
          followUps,
          generatedAtLabel: first
            ? `${first === last ? "Endpoint" : "Oldest endpoint"}: ${first.slice(0, 16).replace("T", " ")} UTC`
            : "Fresh endpoint prices unavailable",
        },
        tokenIds: followUps.map((item) => item.snapshot.tokenId),
        leaders: [],
      };
    } else {
      const selection = selectWeeklyRecapTokens(candidates);
      const recapSnapshotTimes = [ ...selection.leaders, selection.pullback, selection.volumeLeader ]
        .flatMap((token) => token ? [candidates.find((candidate) => candidate.id === token.id)] : [])
        .map((candidate) => Date.parse(candidate?.lastMarketUpdate || candidate?.fetchedAt || ""));
      if (!recapSnapshotTimes.length || !recapSnapshotTimes.every(Number.isFinite)) {
        throw new Error("Every Telegram recap token must have a valid CoinGecko snapshot timestamp.");
      }
      const observedAt = new Date(Math.min(...recapSnapshotTimes));
      marketDataAsOf = observedAt.toISOString();
      recap = buildTelegramWeeklyRecap(selection, observedAt);
    }
    const trackedUrl = buildSocialUtmUrl(new URL("/research", SITE_URL).href, {
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
      !followUps.length && marketDataAsOf ? `Source: CoinGecko snapshot, ${marketDataAsOf.slice(0, 16).replace("T", " ")} UTC.` : "",
      buildTelegramResearchFooter(telegramCta),
    ].filter(Boolean).join("\n\n");

    const protectedEntities = [
      ...followUps.flatMap((item) => buildProtectedSocialEntitiesForToken(item.snapshot.name, item.snapshot.symbol)),
      ...[...recap.leaders, recap.pullback, recap.volumeLeader].flatMap((token) =>
        token ? buildProtectedSocialEntitiesForToken(token.name, token.symbol) : [],
      ),
    ];

    const caption = buildTelegramMediaCaption(
      sanitizeSocialEditorialText(recap.captionBody, { protectedEntities }),
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
        marketDataAsOf,
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
        marketDataAsOf,
        socialSlot: process.env.SOCIAL_SLOT,
        editorialMode: followUps.length ? "research-follow-up" : "weekly-lesson",
        followUpCohort: followUps.length ? followUps : undefined,
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
