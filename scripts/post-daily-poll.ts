/**
 * TokenRadar Telegram native Interactive Poll Generator
 *
 * Generates an automated Telegram Poll to spike organic engagement.
 * Uses the native sendPoll API via telegram.ts.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { callAIWithFallback } from "../src/lib/gemini";
import { sendTelegramPoll } from "../src/lib/telegram";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    console.error("Missing TELEGRAM_CHANNEL_ID in env.");
    process.exit(1);
  }

  const system = "";
  const prompt = `
    You are managing the TokenRadar.co Telegram channel. 
    Write an engaging, 1-2 sentence poll question about cryptocurrency that encourages people to vote. 
    Then, provide exactly 4 distinct, highly relevant answer options.
    
    Format your response EXACTLY as a JSON object with this shape:
    {
      "question": "What narrative is pumping next? 🚀",
      "options": ["AI Tokens 🤖", "Layer 2s ⚡", "Memecoins 🤡", "RWA 🏢"]
    }
  `;

  try {
    console.log("Generating Native Telegram Poll...");
    const result = await callAIWithFallback(system, prompt, 256);
    
    // Parse the JSON array from the response string safely
    const jsonMatch = result.content?.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error("AI output was not parseable as JSON.");
    }

    const payload = JSON.parse(jsonMatch[0]) as { question: string; options: string[] };

    console.log(`Question: ${payload.question}`);
    console.log(`Options: ${payload.options.join(" | ")}`);

    const msgId = await sendTelegramPoll(payload.question.substring(0, 300), payload.options, channelId);
    console.log(`✅ Successfully sent native Telegram poll (msg_id: ${msgId})`);
  } catch (err) {
    console.error("❌ Failed to generate or send poll:", err);
    process.exit(1);
  }
}

main();
