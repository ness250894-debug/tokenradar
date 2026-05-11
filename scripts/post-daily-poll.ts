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
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
import { cleanupExpiredCooldownFolders } from "./lib/token-selection";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

/** Poll theme categories that rotate based on the day of the week. */
const POLL_THEMES = [
  {
    theme: "Market Regime",
    directive: "Ask subscribers to classify the current market regime using risk-aware language.",
    example: "Which market regime are we in right now?",
  },
  {
    theme: "Narrative Rotation",
    directive: "Ask which crypto narrative deserves the next research focus based on momentum, liquidity, and catalyst quality.",
    example: "Which narrative deserves the next TokenRadar scan?",
  },
  {
    theme: "Risk Discipline",
    directive: "Ask about invalidation, position sizing, cash levels, or confirmation rules without giving financial advice.",
    example: "What invalidates a setup fastest for you?",
  },
  {
    theme: "Signal Follow-up",
    directive: "Ask how subscribers want prior watchlist signals reviewed: continuation, failed setup, or neutral follow-up.",
    example: "Which prior signal should we review next?",
  },
  {
    theme: "Watchlist Criteria",
    directive: "Ask which data point should carry the most weight in the next Radar Signal.",
    example: "What matters most before a token enters the watchlist?",
  },
  {
    theme: "Liquidity Quality",
    directive: "Ask subscribers to rank liquidity, volume expansion, market depth, or volatility as a signal filter.",
    example: "Which liquidity signal do you trust most?",
  },
  {
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

/**
 * Build the AI prompt with today's theme for variety.
 */
function buildPollPrompt(): string {
  const dayIndex = new Date().getDay(); // 0=Sun, 6=Sat
  const theme = POLL_THEMES[dayIndex % POLL_THEMES.length];

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
  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  if (fs.existsSync(trackerFile) && !dryRun && !force) {
    const existing = safeReadJson<{ postedAt?: string }>(trackerFile, {});
    console.log(`Telegram daily poll already sent today (${existing.postedAt || "unknown time"}). Exiting.`);
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  try {
    const dayIndex = new Date().getDay();
    const theme = POLL_THEMES[dayIndex % POLL_THEMES.length];
    console.log(`Today's poll theme: "${theme.theme}" (day ${dayIndex})`);
    console.log("Generating poll via AI...");

    const prompt = buildPollPrompt();
    const result = await callAIWithFallback("", prompt, 1000, POLL_SCHEMA);

    // Parse JSON from the AI response
    // Using a more robust extraction that finds the outermost { }
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Raw AI Content:", result.content);
      throw new Error("AI output was not parseable as JSON.");
    }

    const payload = JSON.parse(jsonMatch[0]) as { question: string; options: string[] };

    if (!payload.question || typeof payload.question !== "string") {
      throw new Error("AI returned invalid question.");
    }
    if (!Array.isArray(payload.options) || payload.options.length !== 4) {
      throw new Error(`AI returned ${payload.options?.length ?? 0} options, expected 4.`);
    }

    const question = payload.question.substring(0, 300);
    const options = payload.options.map((option) => option.substring(0, 100));

    console.log(`  Question: ${question}`);
    console.log(`  Options: ${options.join(" | ")}`);

    if (dryRun) {
      console.log("Dry run - poll not sent.");
      return;
    }

    const msgId = await sendTelegramPoll(question, options, channelId!);
    fs.writeFileSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt: new Date().toISOString(),
          question,
          options,
          messageId: msgId,
          theme: theme.theme,
        },
        null,
        2,
      ),
    );

    console.log(`Telegram poll sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    console.error(`Telegram poll failed: ${formatErrorForLog(err)}`);
    process.exit(1);
  }
}

main();
