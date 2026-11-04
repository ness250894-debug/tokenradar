/**
 * TokenRadar Telegram native Interactive Poll Generator
 *
 * Publishes a short, accessible reader-choice poll.
 * Rotates curated questions and coherent answer sets without inventing a product roadmap.
 *
 * Usage:
 *   npx tsx scripts/post-daily-poll.ts
 *   npx tsx scripts/post-daily-poll.ts --dry-run
 *   npx tsx scripts/post-daily-poll.ts --force
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import {
  isTelegramCreateOutcomeUnknownError,
  sendTelegramPoll,
} from "../src/lib/telegram";
import { SOCIAL_VARIANT_COOLDOWN_DAYS } from "../src/lib/config";
import {
  hasSocialPost,
  markSocialDeliveryStatus,
  recordSocialPost,
  reserveSocialDelivery,
} from "../src/lib/ops-ledger";
import { selectSocialArchetype } from "../src/lib/social-archetypes";
import { buildSocialPostDetails, buildSocialTrackerPayload } from "../src/lib/social-post-tracker";
import { sanitizeSocialEditorialText } from "../src/lib/social-editorial";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { buildTelegramPollPayload } from "./lib/telegram-poll";
import { getRecentSocialArchetypeKeys, getRecentSocialVariantKeys } from "./lib/social-history";
import { cleanupExpiredCooldownFolders } from "./lib/token-selection";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

/** Poll theme categories selected with deterministic controlled variety. */
const POLL_THEMES = [
  {
    key: "research_basics",
    theme: "Research Basics",
    question: "Community Pulse: Which crypto term should we explain next?",
    options: ["Trading turnover", "Market cap", "Circulating supply", "Token unlocks"],
  },
  {
    key: "liquidity_basics",
    theme: "Liquidity Basics",
    question: "Community Pulse: Which liquidity check needs a worked example?",
    options: ["Bid-ask spread", "Order-book depth", "Trading venues", "Reported volume"],
  },
  {
    key: "data_pitfalls",
    theme: "Data Pitfalls",
    question: "Community Pulse: Which market-data pitfall should we explain?",
    options: ["Missing data", "Stale scores", "Unusual volume", "Broad token categories"],
  },
  {
    key: "follow_up_format",
    theme: "Research Follow-up",
    question: "Community Pulse: What would help you understand a research follow-up?",
    options: ["The original snapshot", "What changed", "What is still missing", "The comparison method"],
  },
  {
    key: "supply_basics",
    theme: "Supply Basics",
    question: "Community Pulse: Which supply question should we unpack?",
    options: ["Circulating vs total supply", "Token unlock schedules", "Diluted valuation", "Supply data sources"],
  },
  {
    key: "comparison_basics",
    theme: "Comparing Tokens",
    question: "Community Pulse: Which comparison needs a plain-English example?",
    options: ["Price vs market cap", "Volume vs trading depth", "Similar token categories", "Matching time windows"],
  },
  {
    key: "source_checks",
    theme: "Checking Sources",
    question: "Community Pulse: Which source check would you like to learn?",
    options: ["Finding the timestamp", "Checking a project claim", "Comparing data providers", "Spotting missing fields"],
  },
] as const;

type PollTheme = typeof POLL_THEMES[number];

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectPollTheme(usedThemeKeys: Iterable<string> = [], date: Date = new Date()): PollTheme {
  const used = new Set(usedThemeKeys);
  const eligible = POLL_THEMES.filter((theme) => !used.has(theme.key));
  const candidates = eligible.length > 0 ? eligible : POLL_THEMES;
  const seed = `telegram-poll:${utcDateKey(date)}`;
  return candidates[stableHash(seed) % candidates.length];
}

export function resolveTelegramPollFailureStatus(
  publishedExternalId: number | undefined,
  error: unknown,
): "published" | "outcome_unknown" | "failed" {
  if (publishedExternalId !== undefined) return "published";
  return isTelegramCreateOutcomeUnknownError(error) ? "outcome_unknown" : "failed";
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, "daily-telegram-poll.json");
  const socialPostKey = `${today}:telegram-poll`;
  let deliveryReserved = false;
  let publishedExternalId: number | undefined;
  if (!dryRun) cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    throw new Error("Missing TELEGRAM_CHANNEL_ID in env.");
  }

  if (!dryRun && !force && (fs.existsSync(trackerFile) || await hasSocialPost("telegram", socialPostKey))) {
    const existing = safeReadJson<{ postedAt?: string }>(trackerFile, {});
    console.log(`Telegram daily poll already sent today (${existing.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    const runDate = new Date(`${today}T00:00:00.000Z`);
    const usedThemeKeys = force
      ? []
      : getRecentSocialVariantKeys(
          DATA_DIR,
          "telegram",
          SOCIAL_VARIANT_COOLDOWN_DAYS,
          runDate,
          "telegram-poll",
        );
    const theme = selectPollTheme(usedThemeKeys, runDate);
    const archetype = selectSocialArchetype({
      platform: "telegram",
      usedArchetypeKeys: force
        ? []
        : getRecentSocialArchetypeKeys(DATA_DIR, "telegram", SOCIAL_VARIANT_COOLDOWN_DAYS, runDate, "telegram-poll"),
      seedParts: [today, "telegram", theme.key, "telegram-poll", process.env.SOCIAL_SLOT],
      date: runDate,
    });
    console.log(`Today's poll theme: "${theme.theme}" (${theme.key})`);
    console.log(`Today's poll archetype: "${archetype.label}" (${archetype.key})`);
    console.log("Preparing a short reader-choice poll...");
    const pollPayload = buildTelegramPollPayload(
      { question: theme.question, options: [...theme.options] },
      theme.question,
    );
    const question = sanitizeSocialEditorialText(pollPayload.question);
    const options = pollPayload.options.map((option) => sanitizeSocialEditorialText(option));

    console.log(`  Question: ${question}`);
    console.log(`  Options: ${options.join(" | ")}`);

    if (dryRun) {
      console.log("Dry run - poll not sent.");
      return;
    }

    const reservation = await reserveSocialDelivery({
      platform: "telegram",
      contentKey: socialPostKey,
      details: {
        surface: "telegram-poll",
        theme: theme.key,
      },
    });
    if (!reservation.acquired) {
      if (reservation.state === "published") {
        console.log("Telegram poll delivery is already published; treating this run as an idempotent no-op.");
        return;
      }
      throw new Error(`Telegram poll delivery is ${reservation.state}; reconcile it before retrying.`);
    }
    deliveryReserved = true;

    const msgId = await sendTelegramPoll(question, options, channelId!);
    publishedExternalId = msgId;
    const postedAt = new Date().toISOString();
    const trackerPayload = buildSocialTrackerPayload({
      postedAt,
      platform: "telegram",
      surface: "telegram-poll",
      reason: theme.key,
      variantKey: theme.key,
      variantLabel: theme.theme,
      archetypeKey: archetype.key,
      archetypeLabel: archetype.label,
      hookFamily: archetype.hookFamily,
      ctaFamily: archetype.ctaFamily,
      text: question,
      externalId: msgId,
      details: {
        theme: theme.theme,
        themeKey: theme.key,
        options: [...options],
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

    console.log(`Telegram poll sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    if (deliveryReserved) {
      await markSocialDeliveryStatus({
        platform: "telegram",
        contentKey: socialPostKey,
        status: resolveTelegramPollFailureStatus(publishedExternalId, err),
        externalId: publishedExternalId,
        error: formatErrorForLog(err),
        details: { surface: "telegram-poll" },
      });
    }
    throw err;
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Telegram poll failed: ${formatErrorForLog(error)}`);
    process.exitCode = 1;
  });
}
