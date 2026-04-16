/**
 * TokenRadar Telegram native Movers Image generator
 *
 * Hits the local Next.js Edge API /api/og/movers route to construct
 * a Top 5 Gainers data card and sends it directly to Telegram using the sendPhoto method.
 */


import { callAIWithFallback } from "../src/lib/gemini";
import { sendTelegramPhoto } from "../src/lib/telegram";
import { loadEnv } from "../src/lib/utils";

// Load environment
loadEnv();

async function main() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!channelId) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  try {
    console.log("▶ Fetching OG image from API...");
    const ogResponse = await fetch(`${siteUrl}/api/og/movers`);
    
    if (!ogResponse.ok) {
      throw new Error(`Failed to fetch OG image: ${ogResponse.statusText}`);
    }

    const arrayBuffer = await ogResponse.arrayBuffer();
    const photoBuffer = Buffer.from(arrayBuffer);

    console.log("▶ Generating contextual caption...");
    const system = "You are a crypto market analyst writing for TokenRadar.co.";
    const prompt = `
      Write exactly 2 punchy, highly engaging sentences summarizing the market heat for today's Top 5 Gainers, followed by 3 trending hashtags.
      Use the following context: TokenRadar just detected massive volatility and breakout volume across these top 5 performing assets.
      Wrap the most impressive metric or insight in <tg-spoiler> tags.
      
      DO NOT refer to 'seeing' an image. Speak naturally as if you are looking at the live data shelf.
      DO NOT USE ANY LINKS.
    `;
    const result = await callAIWithFallback(system, prompt, 300);
    
    // Safety Fallback Logic
    let caption = result.content;
    if (!caption || caption.length < 10) {
      console.warn("  ⚠ Using static fallback caption due to AI refusal or empty output.");
      caption = "TokenRadar Top 5 Movers leading the charge today! 🚀 Double tap to see the heat. <tg-spoiler>Massive breakout volume detected across the board.</tg-spoiler>\n\n#Crypto #TokenRadar #MarketMovers";
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
