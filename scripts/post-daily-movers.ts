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

import { callAIWithFallback } from "../src/lib/gemini";
import { buildTelegramMediaCaption, sendTelegramPhoto } from "../src/lib/telegram";
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
import { generateMoversImage, type MoverToken } from "../src/lib/movers-generator";
import { cleanupExpiredCooldownFolders, hasSocialImageSafeText, loadCandidateTokens } from "./lib/token-selection";
import { SOCIAL_PLATFORM_LIMITS, TELEGRAM_ECOSYSTEM_LINK_HTML, TELEGRAM_SIGNAL_NOTE } from "../src/lib/config";

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
  cleanupExpiredCooldownFolders(DATA_DIR);

  if (!channelId && !dryRun) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  if (fs.existsSync(trackerFile) && !dryRun && !force) {
    const existing = safeReadJson<{ postedAt?: string }>(trackerFile, {});
    console.log(`Telegram movers card already sent today (${existing.postedAt || "unknown time"}). Exiting.`);
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
    const movers: MoverToken[] = candidates
      .filter((t) =>
        t.market.priceChange24h > 0 &&
        t.market.priceChange24h <= MAX_CHANGE_THRESHOLD &&
        t.market.price > 0 &&
        t.market.marketCap > 0 &&
        hasSocialImageSafeText(t)
      )
      .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
      .slice(0, 5)
      .map((t) => ({
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
    console.log("Rendering movers card in-memory...");
    const photoBuffer = await generateMoversImage(movers);
    console.log(`  ✓ Rendered ${(photoBuffer.length / 1024).toFixed(1)} KB PNG`);

    // ── Generate AI caption ──
    console.log("Generating contextual caption...");
    const system = "You are a crypto market analyst writing for TokenRadar.co.";
    const dataContext = movers
      .map(
        (mover, index) =>
          `#${index + 1} ${mover.symbol.toUpperCase()} (${mover.name}): $${mover.price.toFixed(mover.price >= 1 ? 2 : 6)} (+${mover.change24h.toFixed(2)}%)`,
      )
      .join("\n");

    const prompt = `
      Write a premium Telegram market-desk brief, maximum ${SOCIAL_PLATFORM_LIMITS.TELEGRAM.MOVERS_AI_SUMMARY_CHARS} characters.
      Use the following REAL data for today:
      ${dataContext}

      Required structure:
      <b>Radar Movers Brief</b>
      Signal: one line summarizing the lead mover and breadth.
      Risk read: one line about volatility, liquidity, or confirmation quality.
      <tg-spoiler>TokenRadar read: one balanced watchlist verdict.</tg-spoiler>

      Use <b> tags for bold/emphasis. DO NOT use markdown bold (**) or any other markdown symbols.
      DO NOT include hashtags. The footer already includes them.

      DO NOT refer to 'seeing' an image. Speak naturally as if you are looking at the live data shelf.
      DO NOT use rocket emojis, moon language, guaranteed-return language, or direct buy/sell instructions.
      DO NOT USE ANY LINKS, external URLs, third-party domains, or ads. The only permitted website is tokenradar.co.
    `;

    const result = await callAIWithFallback(system, prompt, 220);

    let caption = result.content;
    if (!caption || caption.length < 10) {
      console.warn("Using static fallback caption due to AI refusal or empty output.");
      caption = [
        "<b>Radar Movers Brief</b>",
        `Signal: ${movers[0].symbol.toUpperCase()} leads today's watchlist at +${movers[0].change24h.toFixed(2)}%, with ${movers.length} eligible gainers in focus.`,
        "Risk read: treat sharp 24h moves as volatility signals until liquidity and continuation confirm.",
        "<tg-spoiler>TokenRadar read: useful momentum shelf, not a blind trade command.</tg-spoiler>",
      ].join("\n");
    }

    const tgFooter = `
${TELEGRAM_ECOSYSTEM_LINK_HTML}

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

    // ── Post to Telegram (buffer goes directly, never saved) ──
    const msgId = await sendTelegramPhoto(photoBuffer, sanitizedCaption, channelId!);
    fs.writeFileSync(
      trackerFile,
      JSON.stringify(
        {
          postedAt: new Date().toISOString(),
          messageId: msgId,
          movers: movers.map((mover) => mover.id),
        },
        null,
        2,
      ),
    );
    console.log(`✅ Telegram movers card sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    console.error(`Telegram movers card failed: ${formatErrorForLog(err)}`);
    process.exit(1);
  }
}

main();
