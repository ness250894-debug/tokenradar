/**
 * TokenRadar — Shared X (Twitter) Client
 *
 * Consolidates X posting into a single module using the twitter-api-v2 SDK.
 * Replaces both the raw OAuth 1.0a approach in post-to-x.ts and the
 * TwitterApi SDK usage in post-market-updates.ts.
 */

import { TwitterApi } from "twitter-api-v2";
import { X_COST_PER_POST } from "./config";

/**
 * Validate that all required X API credentials are present.
 *
 * @returns Object with all credential values
 * @throws Error listing missing credential names
 */
export function validateXCredentials(): {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
} {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  const missing: string[] = [];
  if (!apiKey) missing.push("X_API_KEY");
  if (!apiSecret) missing.push("X_API_SECRET");
  if (!accessToken) missing.push("X_ACCESS_TOKEN");
  if (!accessSecret) missing.push("X_ACCESS_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing X (Twitter) credentials: ${missing.join(", ")}`);
  }

  return { apiKey: apiKey!, apiSecret: apiSecret!, accessToken: accessToken!, accessSecret: accessSecret! };
}

/**
 * Strip HTML tags from text for X (which doesn't support HTML).
 * Extracts URLs from <a> tags and appends them inline.
 *
 * @param html - HTML-formatted text
 * @returns Plain text suitable for X
 */
export function stripHtmlForX(html: string): string {
  // Extract URLs from <a> tags: <a href="url">text</a>
  // If text is effectively the same as URL, just return the URL to avoid duplication.
  let text = html.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/gi, (match, url, linkText) => {
    const cleanText = linkText.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").replace(/<b>|<i>|<\/b>|<\/i>/gi, "");
    const cleanUrl = url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

    if (cleanText === cleanUrl) {
      return url;
    }
    return `${linkText}: ${url}`;
  });

  // Strip remaining HTML tags
  text = text.replace(/<[^>]*>?/gm, "");
  return text;
}

/**
 * Truncate text to fit X's 280 character limit.
 * Keeps the first 4 lines (header) and last 5 lines (footer/links/hashtags).
 *
 * @param text - Plain text to truncate
 * @param maxLength - Maximum character count (default: 280)
 * @returns Truncated text
 */
export function truncateForX(text: string, maxLength: number = 280): string {
  if (text.length <= maxLength) return text;

  const lines = text.split("\n");
  const footerLines: string[] = [];
  const headerLines: string[] = [];

  // Keep the last 5 lines (socials + hashtags)
  for (let i = 0; i < 5; i++) {
    const line = lines.pop();
    if (line !== undefined) footerLines.unshift(line);
  }

  // Keep the first 4 lines (header + stats)
  for (let i = 0; i < 4; i++) {
    const line = lines.shift();
    if (line !== undefined) headerLines.push(line);
  }

  return [...headerLines, "...", ...footerLines]
    .join("\n")
    .substring(0, maxLength - 3) + "...";
}

/**
 * Post a tweet using the twitter-api-v2 SDK.
 *
 * @param text - Tweet text (HTML will be stripped, long text truncated)
 * @param replyToTweetId - Optional ID of a tweet to reply to (creating a thread)
 * @returns Tweet ID
 */
export async function postTweet(text: string, replyToTweetId?: string): Promise<string> {
  const creds = validateXCredentials();

  const client = new TwitterApi({
    appKey: creds.apiKey,
    appSecret: creds.apiSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });

  // Clean and truncate for X
  let cleanText = stripHtmlForX(text);
  cleanText = truncateForX(cleanText);

  try {
    const rwClient = client.readWrite;
    const options = replyToTweetId ? { reply: { in_reply_to_tweet_id: replyToTweetId } } : undefined;
    const { data: createdTweet } = await rwClient.v2.tweet(cleanText, options);
    return createdTweet.id;
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.error("  ✗ Tweet failure detail:", e?.data || e?.message || e);
    throw e;
  }
}

// ── Poll Support ──────────────────────────────────────────────

/** Options for creating a poll tweet. */
export interface PollOptions {
  /** The question text for the poll (max 280 chars). */
  text: string;
  /** Poll answer options (2-4 items, each max 25 chars). */
  options: string[];
  /** Duration in minutes (default: 1440 = 24h). */
  durationMinutes?: number;
}

/**
 * Post a poll tweet using the X API v2.
 *
 * If the native poll creation fails (e.g., tier restriction, API error),
 * automatically falls back to a plain-text tweet with emoji-numbered options.
 *
 * @param poll - Poll configuration
 * @returns Object with tweet ID and whether it used the native poll or fallback
 */
export async function postPoll(poll: PollOptions): Promise<{ tweetId: string; native: boolean }> {
  const creds = validateXCredentials();

  const client = new TwitterApi({
    appKey: creds.apiKey,
    appSecret: creds.apiSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });

  const rwClient = client.readWrite;
  const duration = poll.durationMinutes ?? 1440;

  // ── Attempt 1: Native poll ──
  try {
    const { data: createdTweet } = await rwClient.v2.tweet(poll.text, {
      poll: {
        options: poll.options,
        duration_minutes: duration,
      },
    });
    console.log("  ✓ Native poll created successfully");
    return { tweetId: createdTweet.id, native: true };
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    const errorMsg = String(e?.message || e?.data || e);
    console.warn(`  ⚠ Native poll failed: ${errorMsg}`);
    console.log("  ↳ Falling back to text-based poll...");
  }

  // ── Attempt 2: Text-based fallback ──
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const fallbackLines = [
    poll.text,
    "",
    ...poll.options.map((opt, i) => `${emojis[i] || "▪️"} ${opt}`),
    "",
    "Reply with your pick! 👇",
  ];

  let fallbackText = fallbackLines.join("\n");
  fallbackText = truncateForX(fallbackText);

  try {
    const { data: createdTweet } = await rwClient.v2.tweet(fallbackText);
    console.log("  ✓ Text-based fallback poll posted successfully");
    return { tweetId: createdTweet.id, native: false };
  } catch (_e2: unknown) {
    const e2 = _e2 as Record<string, unknown>;
    console.error("  ✗ Fallback tweet also failed:", e2?.data || e2?.message || e2);
    throw e2;
  }
}


// ── X Trends Integration ──────────────────────────────────────

/** A single trend item from the X API. */
export interface XTrendItem {
  trend_name: string;
  tweet_count?: number;
}

/**
 * Fetch worldwide trending topics from the X API v2.
 * Uses WOEID 1 (Worldwide). Falls back gracefully if the API tier
 * does not support the Trends endpoint (requires Basic+ tier).
 *
 * @returns Array of trend names, or empty array on failure
 */
export async function fetchXTrends(): Promise<XTrendItem[]> {
  try {
    const creds = validateXCredentials();
    const client = new TwitterApi({
      appKey: creds.apiKey,
      appSecret: creds.apiSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });

    // twitter-api-v2 exposes v1.1 trends endpoint via .v1.trendsAvailable()
    // The v2 trends endpoint may require higher tier access.
    // Fallback: use v1.1 GET trends/place (WOEID 1 = Worldwide)
    const trends = await client.v1.trendsByPlace(1);

    if (!trends || trends.length === 0 || !trends[0].trends) {
      return [];
    }

    return trends[0].trends.map((t) => ({
      trend_name: t.name,
      tweet_count: t.tweet_volume ?? undefined,
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // 403 = tier not supported, 429 = rate limited — both are non-fatal
    console.warn(`  ⚠ Failed to fetch X Trends: ${msg}`);
    return [];
  }
}

/**
 * Match X trend names against a list of known token names/symbols.
 * Uses case-insensitive matching against hashtags and keyword patterns.
 *
 * @param trends - Raw X trend items
 * @param knownTokens - Array of { id, name, symbol } from local registry
 * @returns Array of matched token IDs, ordered by tweet volume (highest first)
 */
export function matchTrendsToTokens(
  trends: XTrendItem[],
  knownTokens: { id: string; name: string; symbol: string }[]
): string[] {
  const matched = new Map<string, number>();

  for (const trend of trends) {
    const trendLC = trend.trend_name
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^a-z0-9]/g, "");

    for (const token of knownTokens) {
      const nameLC = token.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const symbolLC = token.symbol.toLowerCase();

      if (trendLC === symbolLC || trendLC === nameLC) {
        const volume = trend.tweet_count ?? 0;
        const existing = matched.get(token.id) ?? 0;
        matched.set(token.id, Math.max(existing, volume));
      }
    }
  }

  return Array.from(matched.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
