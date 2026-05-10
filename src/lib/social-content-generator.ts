/**
 * Social Content Generator — Instagram & Threads
 *
 * Generates platform-specific captions for Instagram Reels and Threads posts.
 * Uses the same callAIWithFallback pattern as existing generators in gemini.ts.
 *
 * Instagram: Rich caption with hashtags, call-to-action, and emoji.
 * Threads: Short, conversational caption with topic tag and spoiler entity.
 */

import { callAIWithFallback, type MarketContext } from "./gemini";
import { SOCIAL_PLATFORM_LIMITS } from "./config";

/** Instagram caption output. */
export interface InstagramContent {
  caption: string;
  hashtags: string[];
}

/** Threads caption output with spoiler metadata. */
export interface ThreadsContent {
  caption: string;
  topicTag: string;
  /** The token name text that should be hidden behind a spoiler. */
  spoilerText: string;
  /** Byte offset in the caption where the spoiler starts. */
  spoilerOffset: number;
  /** Byte length of the spoiler text. */
  spoilerLength: number;
}

/**
 * Generate a short, punchy hook text for the video's first act.
 * 
 * @param tokenName - Full token name
 * @param symbol - Token symbol
 * @param context - Market data and selection context
 * @returns A short string (max 40 chars ideally)
 */
export async function generateHookText(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
): Promise<string> {
  const prompt = `
    Write a 3-second scroll-stopping text hook for a crypto video about ${tokenName} ($${symbol.toUpperCase()}).
    The token price changed ${formatChange(context.priceChange24h)} in 24h.
    Reason selected: ${context.selectionReason || "It's moving fast."}

    RULES:
    1. Maximum 40 characters total.
    2. Write in ALL CAPS.
    3. Make it punchy, mysterious, or urgent.
    4. Do NOT use the token name or symbol. We want them to wait for the reveal.
    5. No emojis.
    
    Examples:
    "IS THIS THE NEXT 100X?"
    "WHALES ARE QUIETLY BUYING"
    "DON'T IGNORE THIS BREAKOUT"
    "THE MARKET IS WRONG ABOUT THIS"
    
    Respond with ONLY the text hook.
  `;

  const result = await callAIWithFallback(
    "You write high-converting short-form video hooks.",
    prompt,
    100,
  );

  return result.content.trim().replace(/^["']|["']$/g, "").toUpperCase();
}

/**
 * Generate an Instagram Reel caption for a token spotlight video.
 *
 * @param tokenName - Full token name (e.g., "Ethereum")
 * @param symbol - Token symbol (e.g., "ETH")
 * @param context - Market data and selection context
 * @returns Caption with hashtags embedded
 */
export async function generateInstagramCaption(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
): Promise<InstagramContent> {
  const maxChars = SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT;
  const priceStr = formatPrice(context.price);
  const changeStr = formatChange(context.priceChange24h);
  const mcapStr = formatMarketCap(context.marketCap);

  const prompt = `
    Write an Instagram Reel caption for a crypto spotlight video about ${tokenName} ($${symbol.toUpperCase()}).

    Market Data (Source: CoinGecko):
    - Price: ${priceStr}
    - 24h Change: ${changeStr}
    - Market Cap: ${mcapStr}
    ${context.selectionReason ? `- Selection Reason: ${context.selectionReason}` : ""}

    RULES:
    1. Maximum ${maxChars} characters total (including hashtags).
    2. Start with a hook line (question or bold statement).
    3. Include 2-3 key data points naturally in the body.
    4. End with a call-to-action (e.g., "Follow for daily alpha 📊").
    5. Include 8-12 relevant hashtags at the end, separated by spaces.
    6. Use emojis sparingly (3-5 max) — no emoji in the first 3 words.
    7. Do NOT use "🚀" — it triggers spam filters.
    8. Tone: informative, professional, with mild excitement.
    9. Do NOT start with the token name — build curiosity first.
    10. Mention @tokenradarco once naturally.

    Respond with ONLY the caption text. No markdown, no quotes.
  `;

  const result = await callAIWithFallback(
    "You are a crypto social media manager writing Instagram Reel captions. Be engaging but factual.",
    prompt,
    400,
  );

  const fullCaption = result.content.trim();

  // Extract hashtags from the caption
  const hashtagMatch = fullCaption.match(/#[a-zA-Z0-9_]+/g) || [];
  const hashtags = hashtagMatch.map((tag) => tag.replace("#", ""));

  return {
    caption: fullCaption,
    hashtags,
  };
}

/**
 * Generate a Threads post caption with topic tag and spoiler entity.
 *
 * @param tokenName - Full token name (e.g., "Ethereum")
 * @param symbol - Token symbol (e.g., "ETH")
 * @param context - Market data and selection context
 * @returns Caption, topic tag, and spoiler metadata
 */
export async function generateThreadsCaption(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
): Promise<ThreadsContent> {
  const maxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
  const priceStr = formatPrice(context.price);
  const changeStr = formatChange(context.priceChange24h);
  const mcapStr = formatMarketCap(context.marketCap);

  const prompt = `
    Write a Threads post caption for a crypto spotlight video about a token ($${symbol.toUpperCase()}).
    The token name should be hidden as a SPOILER to create curiosity (users tap to reveal).

    Market Data (Source: CoinGecko):
    - Token: ${tokenName} ($${symbol.toUpperCase()})
    - Price: ${priceStr}
    - 24h Change: ${changeStr}
    - Market Cap: ${mcapStr}
    ${context.selectionReason ? `- Selection Reason: ${context.selectionReason}` : ""}

    RULES:
    1. Maximum ${maxChars} characters total.
    2. Write the token name as [SPOILER:${tokenName}] — this will be converted to a spoiler tag.
    3. Build curiosity around the hidden name. Example: "This token just pumped +${changeStr}... [SPOILER:${tokenName}] 👀"
    4. Keep it conversational and short — Threads rewards brevity.
    5. Include exactly ONE topic suggestion as [TOPIC:word] at the very end. The topic must be:
       - A single word (no spaces, no #, no dots, no &)
       - Between 1-50 characters
       - Relevant to crypto/finance (e.g., crypto, altcoins, defi, trading)
    6. Do NOT use more than 2 emojis.
    7. Tone: casual, curious, like sharing alpha with friends.
    8. Do NOT mention @tokenradarco — keep it organic.

    Respond with ONLY the caption text including [SPOILER:...] and [TOPIC:...] markers. No markdown, no quotes.
  `;

  const result = await callAIWithFallback(
    "You are a crypto enthusiast posting on Threads. Keep it casual, short, and curiosity-driven.",
    prompt,
    300,
  );

  let caption = result.content.trim();

  // Extract topic tag
  const topicMatch = caption.match(/\[TOPIC:([^\]]+)\]/);
  let topicTag = topicMatch?.[1]?.trim() || "crypto";
  caption = caption.replace(/\[TOPIC:[^\]]+\]/, "").trim();

  // Validate topic tag per API constraints
  topicTag = sanitizeTopicTag(topicTag);

  // Extract and process spoiler
  const spoilerMatch = caption.match(/\[SPOILER:([^\]]+)\]/);
  const spoilerText = spoilerMatch?.[1]?.trim() || tokenName;

  // Replace the [SPOILER:text] marker with just the text
  caption = caption.replace(/\[SPOILER:[^\]]+\]/, spoilerText);

  // Compute byte offset and length for the spoiler entity
  const spoilerIndex = caption.indexOf(spoilerText);
  const textEncoder = new TextEncoder();
  const spoilerOffset = spoilerIndex >= 0
    ? textEncoder.encode(caption.substring(0, spoilerIndex)).length
    : 0;
  const spoilerLength = textEncoder.encode(spoilerText).length;

  // Enforce character limit
  if (caption.length > maxChars) {
    caption = caption.substring(0, maxChars - 3) + "...";
  }

  return {
    caption,
    topicTag,
    spoilerText,
    spoilerOffset,
    spoilerLength,
  };
}

/**
 * Sanitize a topic tag per Threads API constraints.
 * - No #, no ., no &
 * - 1-50 characters
 * - Single word only
 */
function sanitizeTopicTag(tag: string): string {
  let sanitized = tag
    .replace(/[#.&]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (sanitized.length === 0) sanitized = "crypto";
  if (sanitized.length > SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH) {
    sanitized = sanitized.substring(0, SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH);
  }

  return sanitized;
}

// ── Shared formatters ──

function formatPrice(price: number | undefined): string {
  if (price === undefined) return "N/A";
  return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(6)}`;
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function formatMarketCap(mcap: number | undefined): string {
  if (mcap === undefined) return "N/A";
  return mcap >= 1e9
    ? `$${(mcap / 1e9).toFixed(2)}B`
    : `$${(mcap / 1e6).toFixed(0)}M`;
}
