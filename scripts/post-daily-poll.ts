/**
 * TokenRadar Telegram native Interactive Poll Generator
 *
 * Generates an automated Telegram poll to spike organic engagement.
 * Uses AI (Gemini primary, Claude fallback) to create varied, topical polls
 * that rotate through different themes and question styles.
 *
 * Usage:
 *   npx tsx scripts/post-daily-poll.ts
 *   npx tsx scripts/post-daily-poll.ts --dry-run
 *   npx tsx scripts/post-daily-poll.ts --force
 */

import * as fs from "fs";
import * as path from "path";

import { callAIWithFallback } from "../src/lib/gemini";
import { sendTelegramPoll } from "../src/lib/telegram";
import { SOCIAL_VARIANT_COOLDOWN_DAYS } from "../src/lib/config";
import { hasSocialPost, recordSocialPost } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import { buildTelegramPollPayload } from "./lib/telegram-poll";
import { getRecentSocialVariantKeys } from "./lib/social-history";
import { cleanupExpiredCooldownFolders } from "./lib/token-selection";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

/** Poll theme categories selected with deterministic controlled variety. */
const POLL_THEMES = [
  {
    key: "market_regime",
    theme: "Market Regime",
    directive: "Ask subscribers to classify the current market regime using risk-aware language.",
    example: "Which market regime are we in right now?",
  },
  {
    key: "narrative_rotation",
    theme: "Narrative Rotation",
    directive: "Ask which crypto narrative deserves the next research focus based on momentum, liquidity, and catalyst quality.",
    example: "Which narrative deserves the next TokenRadar scan?",
  },
  {
    key: "risk_discipline",
    theme: "Risk Discipline",
    directive: "Ask about invalidation, position sizing, cash levels, or confirmation rules without giving financial advice.",
    example: "What invalidates a setup fastest for you?",
  },
  {
    key: "signal_follow_up",
    theme: "Signal Follow-up",
    directive: "Ask how subscribers want prior watchlist signals reviewed: continuation, failed setup, or neutral follow-up.",
    example: "Which prior signal should we review next?",
  },
  {
    key: "watchlist_criteria",
    theme: "Watchlist Criteria",
    directive: "Ask which data point should carry the most weight in the next Radar Signal.",
    example: "What matters most before a token enters the watchlist?",
  },
  {
    key: "liquidity_quality",
    theme: "Liquidity Quality",
    directive: "Ask subscribers to rank liquidity, volume expansion, market depth, or volatility as a signal filter.",
    example: "Which liquidity signal do you trust most?",
  },
  {
    key: "catalyst_quality",
    theme: "Catalyst Quality",
    directive: "Ask which catalyst type deserves the highest confidence: product, listing, sector flow, developer activity, or on-chain adoption.",
    example: "Which catalyst type should get the highest score?",
  },
] as const;

const POLL_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", description: "The poll question, 1-2 sentences, under 250 chars." },
    options: { 
      type: "array", 
      items: { type: "string", description: "Answer option, under 80 chars." },
      minItems: 4,
      maxItems: 4
    }
  },
  required: ["question", "options"]
};

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

/**
 * Build the AI prompt with today's controlled-variety theme.
 */
function buildPollPrompt(theme: PollTheme): string {
  return `You are running the TokenRadar.co Telegram channel as a premium crypto signal desk.
Today's poll theme: "${theme.theme}"
Directive: ${theme.directive}

Write ONE Telegram "Community Pulse" poll that helps guide future market intelligence.

RULES:
- The question must be sharp, professional, and 1-2 sentences max (under 250 chars).
- Start the question with "Community Pulse:".
- Provide exactly 4 distinct answer options (each under 80 chars).
- Options should be meaningfully different, specific, and useful for a research audience.
- Make it feel timely, but avoid hype, meme language, and entertainment-first wording.
- Do not ask users to buy, sell, long, short, or chase a token.
- DO NOT repeat this example: "${theme.example}"
- NEVER include URLs, external links, third-party domains, or ads. The only permitted site is tokenradar.co.

Return ONLY the JSON.`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, "daily-telegram-poll.json");
  const socialPostKey = `${today}:telegram-poll`;
  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
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
    console.log(`Today's poll theme: "${theme.theme}" (${theme.key})`);
    console.log("Generating poll via AI...");

    const prompt = buildPollPrompt(theme);
    const result = await callAIWithFallback("", prompt, 1000, POLL_SCHEMA);

    // Parse JSON from the AI response
    // Using a more robust extraction that finds the outermost { }
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Raw AI Content:", result.content);
      throw new Error("AI output was not parseable as JSON.");
    }

    const payload = JSON.parse(jsonMatch[0]) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("AI output was not a valid poll payload.");
    }

    const { question, options } = buildTelegramPollPayload(
      payload as { question?: unknown; options?: unknown },
      `Community Pulse: ${theme.example}`,
    );

    console.log(`  Question: ${question}`);
    console.log(`  Options: ${options.join(" | ")}`);

    if (dryRun) {
      console.log("Dry run - poll not sent.");
      return;
    }

    const msgId = await sendTelegramPoll(question, options, channelId!);
    const postedAt = new Date().toISOString();
    writeFileAtomicSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt,
          question,
          options,
          messageId: msgId,
          theme: theme.theme,
          themeKey: theme.key,
          variantKey: theme.key,
          variantLabel: theme.theme,
          variantSurface: "telegram-poll",
        },
        null,
        2,
      ),
    );
    await recordSocialPost({
      platform: "telegram",
      contentKey: socialPostKey,
      externalId: msgId,
      postedAt,
      details: {
        themeKey: theme.key,
        theme: theme.theme,
        variantSurface: "telegram-poll",
      },
    });

    console.log(`Telegram poll sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    console.error(`Telegram poll failed: ${formatErrorForLog(err)}`);
    process.exit(1);
  }
}

main();
