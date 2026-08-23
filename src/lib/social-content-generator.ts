/**
 * Render-time social content helpers.
 *
 * Publish-time captions are generated through generateUnifiedCaptions in gemini.ts.
 */

import { callAIWithFallback, type AICallOptions, type MarketContext } from "./gemini";
import { sanitizeSocialEditorialText } from "./social-editorial";

export interface VideoHookFormatContext {
  label: string;
  angle: string;
  hookInstruction: string;
  key?: string;
  family?: string;
}

const UNSAFE_VIDEO_WORD_RE = /\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/gi;
const TIKTOK_NATIVE_MAX_WORDS = 55;

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

function getVoiceoverOpening(tokenName: string, context: MarketContext): string {
  switch ((context.selectionReason || "").toLowerCase()) {
    case "trending-coingecko":
      return `Look... ${tokenName} is showing up because search attention picked up... which makes the story worth checking!`;
    case "trending-x":
      return `Wait... ${tokenName} is getting major social attention right now... but social attention can move fast... or fade fast!`;
    case "newly-published":
      return `So... ${tokenName} is a fresh research read... where our first job is context... not conviction.`;
    case "top-gainer":
      return `Right... ${tokenName} is back on the radar because attention picked up... not because the chart solved the story!`;
    case "safe-play":
      return `${tokenName} is a calmer market read... but even the cleanest setups still need confirmation!`;
    default:
      return `${tokenName} is today's market read... useful as a token research exercise, instead of a dashboard headline.`;
  }
}

function getVoiceoverLens(format: VideoHookFormatContext | undefined): string {
  switch (format?.key) {
    case "risk_alert":
    case "risk_score_breakdown":
      return "But here is the catch... it's all about risk... attention only matters if the setup survives basic confirmation.";
    case "volume_spike_check":
    case "liquidity_stress_test":
      return "Let's do a move-quality check... market activity has to prove the move is more than just a fast spike.";
    case "sector_rotation":
    case "narrative_heatmap":
      return "So the real question is... is this part of a bigger narrative... or just a one-off burst of noise?";
    case "catalyst_explainer":
    case "new_listing_radar":
      return "The question we should ask... is why did this attention arrive now... and what still needs to be verified?";
    case "momentum_cooling":
    case "contrarian_signal":
      return "The tension here is simple... attention is loud, but follow-through still has to show up.";
    case "watchlist_battle":
    case "token_vs_sector":
      return "Let's make a comparison... this name has to earn watchlist space against stronger alternatives.";
    default:
      return "The useful question is... does this attention turn into confirmation... or disappear after the first wave?";
  }
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
  const cleanSymbol = symbol.toUpperCase();
  void format;
  const opening = `Someone asked about ${cleanSymbol}. I would not start with the candle.`;
  const story = (context.riskScore ?? 5) >= 7
    ? `${cleanTokenName} got attention, but risk is already elevated. Activity has to prove the move is real before the story holds up.`
    : `${cleanTokenName} got attention. Activity check first, then ask what breaks the story.`;
  const close = "Comment one ticker for the next read.";

  return trimToWordLimit(normalizeNarrationText([
    opening,
    story,
    close,
  ].join(" ... ")), TIKTOK_NATIVE_MAX_WORDS);
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
  const opening = getVoiceoverOpening(cleanTokenName, context);
  const lens = getVoiceoverLens(format);
  const riskCue = (context.riskScore ?? 5) >= 7
    ? "That is why... the safer read is a risk check... not a victory lap."
    : "That is why... the safer read is context first... reaction second.";
  const close = `Comment your next ticker below... and let's check the risk.`;
  const script = normalizeNarrationText([opening, lens, riskCue, close].join(" ... "));
  const words = script.split(/\s+/).filter(Boolean);

  return words.length > 72 ? `${words.slice(0, 71).join(" ")}.` : script;
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
  const targetSeconds = isTikTokNative ? Math.min(18, Math.max(14, (options.targetDurationSeconds ?? 21) - 3)) : 25;
  const maxWords = isTikTokNative ? TIKTOK_NATIVE_MAX_WORDS : 72;
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
    TikTok-native direction: avoid reading exact percentage moves, dollar values, ranks, or dashboard labels aloud. Frame the story as attention, activity, confirmation, and invalidation checks.
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
    5. Do NOT mention specific dry metrics like "Recovery Room Index is 67" or raw JSON numbers unless highly relevant. Focus on the core narrative.
    6. Strict safety: Do NOT use the words: buy, sell, hold, long, short, moon, 100x, entry, target, guaranteed, rich, or price prediction. Substitute with "context", "research", "watchlist", or "risk check".
    7. End with a call to action asking viewers to comment their next ticker for a risk check.
    8. ${isTikTokNative ? "Make it sound like TikTok-native creator commentary, not a dashboard export or a formal report. Do not say exact percentages, exact dollar values, market cap, rank, or reported volume." : "Keep it focused and natural."}

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
    undefined,
    { usageActivity },
  );

  const hook = sanitizeSocialEditorialText(result.content).trim().replace(/^["']|["']$/g, "").toUpperCase();
  return hook.length > maxChars ? hook.substring(0, maxChars).trim() : hook;
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
