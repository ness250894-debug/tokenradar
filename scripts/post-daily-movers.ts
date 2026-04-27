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
import { sanitizeHtmlForTelegram, sendTelegramPhoto } from "../src/lib/telegram";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";
import { generateMoversImage, type MoverToken } from "../src/lib/movers-generator";
import { safeReadJson } from "../src/lib/utils";
import { loadCandidateTokens } from "./lib/token-selection";

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
        t.market.marketCap > 0
      )
      .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
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
      Write exactly 2 punchy, highly engaging sentences summarizing the market heat for today's Top 5 Gainers.
      Use the following REAL data for today:
      ${dataContext}

      Wrap the most impressive metric or insight (like the highest % gainer) in <tg-spoiler> tags.
      Follow the 2 sentences with 3 trending hashtags.

      DO NOT refer to 'seeing' an image. Speak naturally as if you are looking at the live data shelf.
      DO NOT USE ANY LINKS, external URLs, third-party domains, or ads. The only permitted website is tokenradar.co.
    `;

    const result = await callAIWithFallback(system, prompt, 300);

    let caption = result.content;
    if (!caption || caption.length < 10) {
      console.warn("Using static fallback caption due to AI refusal or empty output.");
      caption = `TokenRadar Top 5 Movers leading the charge today! 🚀\n\n1. ${movers[0].symbol.toUpperCase()} +${movers[0].change24h.toFixed(2)}%\n2. ${movers[1]?.symbol.toUpperCase() || "—"} +${movers[1]?.change24h.toFixed(2) || "0"}%\n\n<tg-spoiler>Massive breakout volume detected across the board.</tg-spoiler>\n\n#Crypto #TokenRadar #MarketMovers`;
    }

    const sanitizedCaption = sanitizeHtmlForTelegram(caption, 1024);

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
