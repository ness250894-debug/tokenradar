/**
 * Render-time social content helpers.
 *
 * Publish-time captions are generated through generateUnifiedCaptions in gemini.ts.
 */

import { callAIWithFallback, type MarketContext } from "./gemini";
import { sanitizeSocialEditorialText } from "./social-editorial";

export interface VideoHookFormatContext {
  label: string;
  angle: string;
  hookInstruction: string;
}

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
  format?: VideoHookFormatContext,
): Promise<string> {
  const maxChars = 40;
  const formatBrief = format
    ? `
    VIDEO FORMAT:
    ${format.label}: ${format.angle}
    Hook direction: ${format.hookInstruction}
    `
    : "";
  const prompt = `
    Write a 3-second scroll-stopping text hook for a crypto video about ${tokenName} ($${symbol.toUpperCase()}).
    The token price changed ${formatChange(context.priceChange24h)} in 24h.
    Reason selected: ${context.selectionReason || "It's moving fast."}
    ${formatBrief}

    RULES:
    1. Maximum ${maxChars} characters total.
    2. Write in ALL CAPS.
    3. Make it punchy, mysterious, or urgent while staying data-led.
    4. Do NOT use the token name or symbol. We want them to wait for the reveal.
    5. No emojis.
    6. Do NOT say buy, sell, long, short, moon, 100x, guaranteed, rich, or price prediction.

    Examples:
    "THIS MOVE NEEDS PROOF"
    "THE DATA JUST SHIFTED"
    "RISK IS THE REAL STORY"
    "VOLUME TELLS THE TRUTH"

    Respond with ONLY the text hook.
  `;

  const result = await callAIWithFallback(
    "You write high-converting short-form video hooks.",
    prompt,
    1024,
  );

  const hook = sanitizeSocialEditorialText(result.content).trim().replace(/^["']|["']$/g, "").toUpperCase();
  return hook.length > maxChars ? hook.substring(0, maxChars).trim() : hook;
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
