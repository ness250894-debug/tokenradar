/**
 * TokenRadar Telegram native Movers image generator
 *
 * Extracts the top 5 gainers from local data, generates a branded image buffer,
 * and sends it to Telegram with an AI-generated contextual caption.
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
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";
import { generateMoversImage, MoverToken } from "../src/lib/movers-generator";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const tokensPath = path.join(DATA_DIR, "tokens.json");
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
    console.log("Loading token data...");
    const tokens = safeReadJson<unknown[]>(tokensPath, []);

    if (tokens.length === 0) {
      throw new Error("No tokens found in data/tokens.json");
    }

    const movers: MoverToken[] = (
      tokens as Array<{
        id: string;
        symbol: string;
        name: string;
        market: { price: number; priceChange24h: number };
      }>
    )
      .filter((token) => token.market?.priceChange24h !== undefined)
      .sort((a, b) => (b.market?.priceChange24h || 0) - (a.market?.priceChange24h || 0))
      .slice(0, 5)
      .map((token) => ({
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        price: token.market.price || 0,
        change24h: token.market.priceChange24h || 0,
      }));

    if (movers.length === 0) {
      throw new Error("Could not find any tokens with price change data.");
    }

    console.log("Generating local PNG image...");
    const photoBuffer = await generateMoversImage(movers);

    console.log("Generating contextual caption based on real data...");
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
      caption = `TokenRadar Top 5 Movers leading the charge today! 🚀\n\n1. ${movers[0].symbol.toUpperCase()} +${movers[0].change24h.toFixed(2)}%\n2. ${movers[1].symbol.toUpperCase()} +${movers[1].change24h.toFixed(2)}%\n\n<tg-spoiler>Massive breakout volume detected across the board.</tg-spoiler>\n\n#Crypto #TokenRadar #MarketMovers`;
    }

    const sanitizedCaption = sanitizeHtmlForTelegram(caption, 1024);

    if (dryRun) {
      console.log(`Dry run - movers card not sent. Caption length: ${sanitizedCaption.length}`);
      console.log(sanitizedCaption);
      return;
    }

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
    console.log(`Telegram movers card sent successfully (msg_id: ${msgId})`);
  } catch (err) {
    console.error(`Telegram movers card failed: ${formatErrorForLog(err)}`);
    process.exit(1);
  }
}

main();
