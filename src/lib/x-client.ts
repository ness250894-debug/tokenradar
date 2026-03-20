/**
 * TokenRadar — Shared X (Twitter) Client
 *
 * Consolidates X posting into a single module using the twitter-api-v2 SDK.
 * Replaces both the raw OAuth 1.0a approach in post-to-x.ts and the
 * TwitterApi SDK usage in post-market-updates.ts.
 */

import { TwitterApi } from "twitter-api-v2";
import { trackUsage } from "./reporter";
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
  // Extract URLs from <a> tags: <a href="url">text</a> → text: url
  let text = html.replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, "$2: $1");
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
 * @returns Tweet ID
 */
export async function postTweet(text: string): Promise<string> {
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
    const { data: createdTweet } = await rwClient.v2.tweet(cleanText);
    trackUsage("x", 1, X_COST_PER_POST);
    return createdTweet.id;
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.error("  ✗ Tweet failure detail:", e?.data || e?.message || e);
    throw e;
  }
}
