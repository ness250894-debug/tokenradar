/**
 * TokenRadar Telegram native Movers Image generator
 *
 * Hits the local Next.js Edge API /api/og/movers route to construct
 * a Top 5 Gainers data card and sends it directly to Telegram using the sendPhoto method.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { callAIWithFallback } from "../src/lib/gemini";
import { sendTelegramPhoto } from "../src/lib/telegram";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

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
    const system = "";
    const prompt = `
      You are writing a caption for an attached image of the TokenRadar Top 5 Market Movers today.
      Write exactly 2 punchy, highly engaging sentences summarizing the market heat, followed by 3 trending hashtags.
      Wrap the most impressive metric or insight in <tg-spoiler> tags so users have to tap to read it.
      
      DO NOT USE ANY LINKS. Just the raw, brilliant text.
    `;
    const result = await callAIWithFallback(system, prompt, 300);
    const caption = result.content || "Top 5 Movers today! Check out the charts. #Crypto #TokenRadar";

    console.log("▶ Sending native photo to Telegram...");
    const msgId = await sendTelegramPhoto(photoBuffer, caption, channelId);
    console.log(`✅ Successfully sent Top Movers photo (msg_id: ${msgId})`);
  } catch (err) {
    console.error("❌ Failed to process and send daily movers photo:", err);
    process.exit(1);
  }
}

main();
