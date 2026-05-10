/**
 * Render-time social content helpers.
 *
 * Publish-time captions are generated through generateUnifiedCaptions in gemini.ts.
 */

import { callAIWithFallback, type MarketContext } from "./gemini";

/**
 * Generate a short, punchy hook text for the video's first act.
 *
 * @param tokenName - Full token name
 * @param symbol - Token symbol
 * @param context - Market data and selection context
 * @returns A short all-caps string capped at 40 characters
 */
export async function generateHookText(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
): Promise<string> {
  const maxChars = 40;
  const prompt = `
    Write a 3-second scroll-stopping text hook for a crypto video about ${tokenName} ($${symbol.toUpperCase()}).
    The token price changed ${formatChange(context.priceChange24h)} in 24h.
    Reason selected: ${context.selectionReason || "It's moving fast."}

    RULES:
    1. Maximum ${maxChars} characters total.
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
    1024,
  );

  const hook = result.content.trim().replace(/^["']|["']$/g, "").toUpperCase();
  return hook.length > maxChars ? hook.substring(0, maxChars).trim() : hook;
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
