import { type NextRequest } from "next/server";
import { Bot, webhookCallback } from "grammy";
import { telegramAgent } from "@/lib/agents/telegram-agent";

// Initialize the bot (allow dummy token during build-time module evaluation)
const token = process.env.TELEGRAM_BOT_TOKEN || "BUILD_TIME_DUMMY_TOKEN";
const bot = new Bot(token);

// Reactive Agentic Behavior: Handle incoming messages
bot.on("message", async (ctx) => {
  const text = ctx.message.text;
  if (!text) return;

  // Let the Mastra agent process the user input
  try {
    const result = await telegramAgent.generate(text);
    
    // grammY's ctx.reply handles the response
    await ctx.reply(result.text, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Telegram Agent Error:", error);
    await ctx.reply("System error while processing your request. Please try again later.");
  }
});

/**
 * Next.js Edge-compatible Webhook Handler
 */
export const POST = webhookCallback(bot, "std/http");
