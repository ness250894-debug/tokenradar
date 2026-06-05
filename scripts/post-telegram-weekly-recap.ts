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
  SOCIAL_VARIANT_COOLDOWN_DAYS,
  TELEGRAM_ECOSYSTEM_LINK_HTML,
  TELEGRAM_SIGNAL_NOTE,
} from "../src/lib/config";
import { hasSocialPost, recordSocialPost } from "../src/lib/ops-ledger";
import { selectSocialArchetype } from "../src/lib/social-archetypes";
import { sanitizeSocialEditorialText } from "../src/lib/social-editorial";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { buildTelegramMediaCaption, sendTelegramPhoto } from "../src/lib/telegram";
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
import { getRecentSocialArchetypeKeys } from "./lib/social-history";

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
    const recap = buildTelegramWeeklyRecap(selectWeeklyRecapTokens(candidates));
    const archetype = selectSocialArchetype({
      platform: "telegram",
      usedArchetypeKeys: force
        ? []
        : getRecentSocialArchetypeKeys(
            DATA_DIR,
            "telegram",
            SOCIAL_VARIANT_COOLDOWN_DAYS,
            new Date(`${today}T00:00:00.000Z`),
            "telegram-weekly-recap",
          ),
      seedParts: [today, "telegram", "weekly-recap", process.env.SOCIAL_SLOT],
      date: new Date(`${today}T00:00:00.000Z`),
    });

    console.log();
    console.log("Telegram weekly recap preview:");
    console.log(recap.captionBody);
    console.log(`Tokens: ${recap.tokenIds.join(", ")}`);
    console.log(`Archetype: ${archetype.label} (${archetype.key})`);

    console.log("Rendering Telegram weekly recap card in-memory...");
    const photoBuffer = await renderTelegramWeeklyRecapImage(recap.image);
    console.log(`  Rendered ${(photoBuffer.length / 1024).toFixed(1)} KB PNG`);

    const tgFooter = `
${TELEGRAM_ECOSYSTEM_LINK_HTML}

${TELEGRAM_SIGNAL_NOTE}
#Crypto #TokenRadar #WeeklyRecap
`;

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

    const messageId = await sendTelegramPhoto(photoBuffer, caption, channelId!);
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
      details: {
        tokenIds: recap.tokenIds,
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
    console.error(`Telegram weekly recap failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

main();
