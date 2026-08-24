/**
 * Render-time social content helpers.
 *
 * Publish-time captions are generated through generateUnifiedCaptions in gemini.ts.
 */

import { callAIWithFallback, type AICallOptions, type MarketContext } from "./gemini";
import { sanitizeSocialEditorialText } from "./social-editorial";
import { buildEvidenceLedVideoHook, buildEvidenceLedVoiceover } from "./video-evidence";

export interface VideoHookFormatContext {
  label: string;
  angle: string;
  hookInstruction: string;
  key?: string;
  family?: string;
}

const UNSAFE_VIDEO_WORD_RE = /\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/gi;
const TIKTOK_NATIVE_MAX_WORDS = 45;

export type VideoVoiceoverStyle = "standard" | "tiktok_native";

export interface VideoVoiceoverOptions {
  targetDurationSeconds?: number;
  style?: VideoVoiceoverStyle;
  usageActivity?: AICallOptions["usageActivity"];
}

function normalizeNarrationText(value: string): string {
  return value
    .replace(UNSAFE_VIDEO_WORD_RE, "watch")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function trimToWordLimit(script: string, maxWords: number): string {
  const words = script.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords - 1).join(" ")}.` : script;
}

function buildTikTokNativeVideoVoiceoverScript(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
  format?: VideoHookFormatContext,
): string {
  const cleanTokenName = normalizeNarrationText(tokenName || symbol.toUpperCase());
  void format;
  return trimToWordLimit(normalizeNarrationText(buildEvidenceLedVoiceover({
    tokenName: cleanTokenName,
    symbol,
    priceChange24h: context.priceChange24h,
    volume24h: context.volume24h,
    marketCap: context.marketCap,
    riskScore: context.riskScore,
    marketDataSource: context.marketDataSource,
    marketDataAsOf: context.marketDataAsOf,
  }, "tiktok")), TIKTOK_NATIVE_MAX_WORDS);
}

/**
 * Build the narration Kokoro reads over the video.
 *
 * Keep this separate from publish captions and on-screen metrics: the voiceover
 * should sound like creator commentary, not a dashboard export.
 */
export function buildVideoVoiceoverScript(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
  format?: VideoHookFormatContext,
  options: VideoVoiceoverOptions = {},
): string {
  if (options.style === "tiktok_native") {
    return buildTikTokNativeVideoVoiceoverScript(tokenName, symbol, context, format);
  }

  const cleanTokenName = normalizeNarrationText(tokenName || symbol.toUpperCase());
  void format;
  return trimToWordLimit(normalizeNarrationText(buildEvidenceLedVoiceover({
    tokenName: cleanTokenName,
    symbol,
    priceChange24h: context.priceChange24h,
    volume24h: context.volume24h,
    marketCap: context.marketCap,
    riskScore: context.riskScore,
    marketDataSource: context.marketDataSource,
    marketDataAsOf: context.marketDataAsOf,
  }, "youtube")), 52);
}

// Add support for fully dynamic AI-generated scripts using Gemini
export async function generateDynamicVoiceoverScript(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
  format?: VideoHookFormatContext,
  options: VideoVoiceoverOptions = {},
): Promise<string> {
  const isTikTokNative = options.style === "tiktok_native";
  const targetSeconds = Math.max(12, (options.targetDurationSeconds ?? (isTikTokNative ? 18 : 20)) - 2);
  const maxWords = isTikTokNative ? TIKTOK_NATIVE_MAX_WORDS : 52;
  const formatBrief = format
    ? `
    VIDEO FORMAT:
    ${format.label}: ${format.angle}
    `
    : "";
  const tokenReference = isTikTokNative
    ? `${tokenName} (${symbol.toUpperCase()})`
    : `${tokenName} ($${symbol.toUpperCase()})`;
  const marketBrief = isTikTokNative
    ? `
    Selection reason: ${context.selectionReason || "notable market attention"}
    Supplied 24h move: ${formatChange(context.priceChange24h)}
    Supplied reported volume: ${context.volume24h ?? "N/A"}
    Supplied market cap: ${context.marketCap ?? "N/A"}
    Supplied TokenRadar risk score: ${context.riskScore ?? "N/A"}/10
    `
    : `
    Selection reason: ${context.selectionReason || "significant market movement"}
    Risk Score: ${context.riskScore ?? "N/A"}/10
    Price Change (24h): ${formatChange(context.priceChange24h)}
    `;
  const prompt = `
    Write a highly human-like, conversational ${targetSeconds}-second narration voiceover script for a short-form video about ${tokenReference}.
    ${marketBrief}
    ${formatBrief}

    RULES for Conversational Pacing & Engagement:
    1. Write exactly like a natural, casual human speaker.
    2. Incorporate natural hesitation pauses using ellipses (...) and commas (e.g. "Wait...", "Look...", "But here is the catch...").
    3. Use exclamation marks and question marks to guide pitch and dynamic intonation.
    4. Keep it strictly under ${maxWords} words total so it comfortably fits the render at natural reading speed.
    5. Use the supplied 24h move, reported volume-to-market-cap ratio, and risk score as the three-beat story. Never invent a catalyst or trend.
    6. Strict safety: Do NOT use the words: buy, sell, hold, long, short, moon, 100x, entry, target, guaranteed, rich, or price prediction. Substitute with "context", "research", "watchlist", or "risk check".
    7. End with one answerable question about the evidence, not a generic request for another ticker.
    8. ${isTikTokNative ? "Make it sound like a creator explaining one surprising data tension." : "Keep it focused, searchable, and natural."}

    Respond with ONLY the narration script. No introductory text. No quotes.
  `;

  const result = await callAIWithFallback(
    "You write highly engaging, natural short-form video narration scripts.",
    prompt,
    1024,
    undefined,
    { usageActivity: options.usageActivity },
  );
  return trimToWordLimit(normalizeNarrationText(result.content.trim().replace(/^["']|["']$/g, "")), maxWords);
}

// Unified async voiceover script generator
export async function generateVideoVoiceoverScript(
  tokenName: string,
  symbol: string,
  context: MarketContext = {},
  format?: VideoHookFormatContext,
  options: VideoVoiceoverOptions = {},
): Promise<string> {
  const useDynamic = process.env.TOKENRADAR_DYNAMIC_AI_NARRATION === "1" || 
                     process.env.TOKENRADAR_DYNAMIC_AI_NARRATION === "true";
  
  if (useDynamic) {
    try {
      console.info(`Generating fully dynamic AI voiceover script for ${tokenName}...`);
      return await generateDynamicVoiceoverScript(tokenName, symbol, context, format, options);
    } catch (e) {
      console.warn("Failed to generate dynamic AI voiceover script, falling back to template:", e);
    }
  }
  
  return buildVideoVoiceoverScript(tokenName, symbol, context, format, options);
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
  usageActivity?: AICallOptions["usageActivity"],
): Promise<string> {
  void format;
  void usageActivity;
  const hook = buildEvidenceLedVideoHook({
    tokenName,
    symbol,
    priceChange24h: context.priceChange24h,
    volume24h: context.volume24h,
    marketCap: context.marketCap,
    riskScore: context.riskScore,
    marketDataSource: context.marketDataSource,
    marketDataAsOf: context.marketDataAsOf,
  });
  return sanitizeSocialEditorialText(hook).toUpperCase();
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
