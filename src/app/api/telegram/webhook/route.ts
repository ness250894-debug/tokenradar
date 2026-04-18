
import { Bot, webhookCallback } from "grammy";
import { telegramAgent } from "@/lib/agents/telegram-agent";

// Initialize the bot only when a real token is available
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new Bot(token) : null;

// Reactive Agentic Behavior: Handle incoming messages
if (bot) {
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
}

/**
 * Next.js Edge-compatible Webhook Handler.
 * Returns 503 if TELEGRAM_BOT_TOKEN is not configured.
 */
export const POST = bot
  ? webhookCallback(bot, "std/http")
  : () => new Response("Telegram bot not configured: TELEGRAM_BOT_TOKEN is missing", { status: 503 });
