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

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

/** Poll theme categories that rotate based on the day of the week. */
const POLL_THEMES = [
  {
    theme: "Market Sentiment",
    directive: "Ask about overall crypto market mood, fear/greed, or whether the market is bullish or bearish this week.",
    example: "How are you feeling about the crypto market this week?",
  },
  {
    theme: "Token Category Battle",
    directive: "Pit different crypto narratives or categories against each other (e.g., AI tokens vs L2s vs memecoins vs DeFi vs RWA).",
    example: "Which crypto narrative will outperform in the coming months?",
  },
  {
    theme: "Trading Strategy",
    directive: "Ask about trading habits, portfolio allocation, DCA strategies, or risk management preferences.",
    example: "What's your go-to strategy when the market dips?",
  },
  {
    theme: "Hot Take / Prediction",
    directive: "Ask for a bold prediction about a trending topic - Bitcoin price targets, ETF impact, regulation, halving effects, etc.",
    example: "Where will Bitcoin be by end of year?",
  },
  {
    theme: "Community Lifestyle",
    directive: "Ask fun, relatable crypto community questions - diamond hands vs paper hands, favorite exchange, how they got into crypto, etc.",
    example: "How long have you been in crypto?",
  },
  {
    theme: "DeFi & Yield",
    directive: "Ask about DeFi strategies, staking preferences, yield farming, or which protocols they trust most.",
    example: "Where do you park your stablecoins for yield?",
  },
  {
    theme: "Technology & Innovation",
    directive: "Ask about blockchain tech preferences - L1 vs L2, ZK rollups, interoperability, account abstraction, AI integration, etc.",
    example: "Which blockchain innovation excites you most?",
  },
] as const;

/**
 * Build the AI prompt with today's theme for variety.
 */
function buildPollPrompt(): string {
  const dayIndex = new Date().getDay(); // 0=Sun, 6=Sat
  const theme = POLL_THEMES[dayIndex % POLL_THEMES.length];

  return `You are running the TokenRadar.co Telegram channel (a crypto analytics community).
Today's poll theme: "${theme.theme}"
Directive: ${theme.directive}

Write ONE highly engaging Telegram poll for our audience.

RULES:
- The question must be punchy, 1-2 sentences max (under 250 chars).
- Use 1-2 relevant emojis in the question to make it pop.
- Provide exactly 4 distinct answer options (each under 80 chars).
- Each option should include one emoji.
- Options should be meaningfully different (not overlapping).
- Make it feel fresh and topical - reference current market conditions if possible.
- DO NOT repeat this example: "${theme.example}"
- NEVER include URLs, external links, third-party domains, or ads. The only permitted site is tokenradar.co.

Format your response as a SINGLE JSON object:
{
  "question": "Your engaging poll question here? 🔥",
  "options": ["Option A 📈", "Option B 💎", "Option C 🎯", "Option D 🚀"]
}

Return ONLY the JSON, nothing else.`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted", today);
  const trackerFile = path.join(postedDir, "daily-telegram-poll.json");

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
    const result = await callAIWithFallback("", prompt, 300);

    // Parse JSON from the AI response
    const jsonMatch = result.content?.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
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
