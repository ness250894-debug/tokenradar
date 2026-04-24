/**
 * TokenRadar Telegram native Movers Image generator
 * 
 * Extracts the Top 5 Gainers from local data, generates a branded image buffer,
 * and sends it to Telegram with an AI-generated contextual caption.
 */

import * as path from "path";
import { callAIWithFallback } from "../src/lib/gemini";
import { sendTelegramPhoto } from "../src/lib/telegram";
import { loadEnv, safeReadJson } from "../src/lib/utils";
import { generateMoversImage, MoverToken } from "../src/lib/movers-generator";

// Load environment
loadEnv();

async function main() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const tokensPath = path.resolve(process.cwd(), "data", "tokens.json");

  if (!channelId) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  try {
    console.log("▶ Loading token data...");
    const tokens = safeReadJson<any[]>(tokensPath, []);
    
    if (tokens.length === 0) {
      throw new Error("No tokens found in data/tokens.json");
    }

    // 1. Selection: Top 5 Gainers (24h)
    const movers: MoverToken[] = [...tokens]
      .filter(t => t.market?.priceChange24h !== undefined)
      .sort((a, b) => (b.market?.priceChange24h || 0) - (a.market?.priceChange24h || 0))
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        price: t.market.price || 0,
        change24h: t.market.priceChange24h || 0
      }));

    if (movers.length === 0) {
      throw new Error("Could not find any tokens with price change data.");
    }

    console.log("▶ Generating local PNG image...");
    const photoBuffer = await generateMoversImage(movers);

    console.log("▶ Generating contextual caption based on REAL data...");
    const system = "You are a crypto market analyst writing for TokenRadar.co.";
    
    // Construct data context for AI to prevent hallucinations
    const dataContext = movers.map((m, i) => `#${i+1} ${m.symbol.toUpperCase()} (${m.name}): $${m.price.toFixed(m.price >= 1 ? 2 : 6)} (+${m.change24h.toFixed(2)}%)`).join("\n");

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
    
    // Safety Fallback Logic
    let caption = result.content;
    if (!caption || caption.length < 10) {
      console.warn("  ⚠ Using static fallback caption due to AI refusal or empty output.");
      caption = `TokenRadar Top 5 Movers leading the charge today! 🚀\n\n1. ${movers[0].symbol.toUpperCase()} +${movers[0].change24h.toFixed(2)}%\n2. ${movers[1].symbol.toUpperCase()} +${movers[1].change24h.toFixed(2)}%\n\n<tg-spoiler>Massive breakout volume detected across the board.</tg-spoiler>\n\n#Crypto #TokenRadar #MarketMovers`;
    }

    console.log("▶ Sending native photo to Telegram...");
    const msgId = await sendTelegramPhoto(photoBuffer, caption, channelId);
    console.log(`✅ Successfully sent Top Movers photo (msg_id: ${msgId})`);
  } catch (err) {
    console.error("❌ Failed to process and send daily movers photo:", err);
    process.exit(1);
  }
}

main();
