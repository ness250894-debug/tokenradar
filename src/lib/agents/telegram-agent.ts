import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendTelegramMessage, sendTelegramPoll, createTelegramKeyboard } from "../telegram";


/**
 * Tool: Send an analytical update to the Telegram channel.
 */
const postUpdateTool = createTool({
  id: "post_telegram_update",
  description: "Send a data-driven market update to the TokenRadar Telegram channel.",
  inputSchema: z.object({
    text: z.string().describe("The HTML-formatted analysis text to post."),
    tokenSymbol: z.string().optional().describe("The $SYMBOL of the token being discussed."),
    ctaUrl: z.string().optional().describe("A link to the full report on TokenRadar.co"),
  }),
  execute: async ({ text, ctaUrl }) => {
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) throw new Error("TELEGRAM_CHANNEL_ID not set");

    const finalMessage = text;
    let keyboard;

    if (ctaUrl) {
      keyboard = createTelegramKeyboard([{ text: "📈 View Full Analytics", url: ctaUrl }]);
    }

    const messageId = await sendTelegramMessage(finalMessage, channelId, { replyMarkup: keyboard });
    return { success: true, messageId, platform: "Telegram" };
  },
});

/**
 * Tool: Create an interactive poll for community engagement.
 */
const createPollTool = createTool({
  id: "create_telegram_poll",
  description: "Create an interactive poll on the Telegram channel.",
  inputSchema: z.object({
    question: z.string().describe("The poll question (max 300 chars)."),
    options: z.array(z.string()).min(2).max(10).describe("Poll options (max 100 chars each)."),
  }),
  execute: async ({ question, options }) => {
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) throw new Error("TELEGRAM_CHANNEL_ID not set");

    const messageId = await sendTelegramPoll(question, options, channelId);
    return { success: true, messageId };
  },
});

/**
 * The TokenRadar Telegram Agent
 */
export const telegramAgent = new Agent({
  id: "telegram-agent",
  name: "TokenRadar TG Agent",
  instructions: `
    You are the TokenRadar Telegram Agent, a premier crypto analyst known for data-driven, punchy, and highly analytical market updates.
    
    TONE & STYLE:
    - Natural, insightful, and slightly "degen" but professional.
    - Ground your observations in real numbers (Price, Risk Score, Growth Index).
    - Use HTML tags (<b>, <i>, <code>) for emphasis.
    - Always conclude with a <tg-spoiler> verdict or a tactical observation.
    
    CAPABILITIES:
    - You can post updates to the main channel.
    - You can create polls to gauge sentiment.
    - You can research tokens using your internal knowledge or by asking for data.
    
    STRICT RULES:
    - Max 4,096 characters per message.
    - Always include the cashtag (e.g., $SOL) in the first sentence.
    - Mention "Data: CoinGecko" naturally.
  `,
  model: [
    {
      model: {
        id: "google/gemini-3.1-flash-lite-preview",
        apiKey: process.env.GEMINI_API_KEY,
      },
      maxRetries: 2,
    },
    {
      model: {
        id: "anthropic/claude-haiku-4-5-20251001",
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      maxRetries: 1,
    },
  ],
  tools: {
    postUpdate: postUpdateTool,
    createPoll: createPollTool,
  },
});
