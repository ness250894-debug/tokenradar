/**
 * TokenRadar — Shared X (Twitter) Client
 *
 * Consolidates X posting into a single module using the official
 * @xdevplatform/xdk SDK with OAuth 2.0 + PKCE authentication.
 *
 * Replaces the legacy twitter-api-v2 integration.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  Client,
  OAuth2,
  type OAuth2Config,
  type ClientConfig,
  type OAuth2Token,
} from "@xdevplatform/xdk";

// ── Cashtag Sanitization ──────────────────────────────────────

/**
 * Enforce X's one-cashtag-per-post rule.
 *
 * Finds all cashtags ($SYMBOL — a `$` immediately followed by 1+ uppercase
 * letters) in the text. Keeps only the **first** occurrence and strips the
 * `$` prefix from all subsequent ones (e.g. `$COMP` → `COMP`).
 *
 * @param text - Raw tweet text
 * @returns Sanitized text with at most one cashtag
 */
export function sanitizeCashtags(text: string): string {
  let foundFirst = false;
  return text.replace(/\$([A-Z]{1,})\b/g, (_match, symbol: string) => {
    if (!foundFirst) {
      foundFirst = true;
      return `$${symbol}`; // keep the first one
    }
    return symbol; // strip the $ from subsequent ones
  });
}

// ── Credentials ───────────────────────────────────────────────

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Validate that all required X API OAuth 2.0 credentials are present.
 *
 * Falls back to legacy OAuth 1.0a validation if OAuth 2.0 vars are missing,
 * to allow a smooth transition period.
 *
 * @returns Object with all credential values
 * @throws Error listing missing credential names
 */
export function validateXCredentials(): OAuth2Credentials {
  const clientId = process.env.X_OAUTH2_CLIENT_ID;
  const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET;
  const refreshToken = process.env.X_OAUTH2_REFRESH_TOKEN;

  const missing: string[] = [];
  if (!clientId) missing.push("X_OAUTH2_CLIENT_ID");
  if (!clientSecret) missing.push("X_OAUTH2_CLIENT_SECRET");
  if (!refreshToken) missing.push("X_OAUTH2_REFRESH_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing X OAuth 2.0 credentials: ${missing.join(", ")}. ` +
      `Run 'npx tsx scripts/generate-x-token.ts' to set up OAuth 2.0.`
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
  };
}

// ── Client Singleton ──────────────────────────────────────────

let _cachedClient: Client | null = null;
let _tokenExpiresAt: number = 0;

/**
 * Path to the persistent OAuth state file.
 * Used in CI/CD (GitHub Actions) where .env.local doesn't exist.
 * The workflow's "Commit Tracking Logs" step pushes this back to the repo.
 */
const OAUTH_STATE_FILE = path.resolve(__dirname, "../../data/x-oauth-state.json");

/**
 * Read the latest refresh token, preferring the persisted state file
 * over the environment variable (which may be stale in CI after rotation).
 */
function getLatestRefreshToken(envToken: string): string {
  try {
    if (fs.existsSync(OAUTH_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(OAUTH_STATE_FILE, "utf-8"));
      if (state.refreshToken && typeof state.refreshToken === "string") {
        console.log("  ℹ Using refresh token from state file (data/x-oauth-state.json)");
        return state.refreshToken;
      }
    }
  } catch {
    // State file missing or corrupt — fall back to env var
  }
  return envToken;
}

/**
 * Persist the new refresh token to both .env.local (local dev)
 * and data/x-oauth-state.json (CI/CD).
 */
function persistRefreshToken(newToken: string): void {
  // Always update in-process env
  process.env.X_OAUTH2_REFRESH_TOKEN = newToken;

  // 1. Persist to state file (works in both local and CI)
  try {
    const stateDir = path.dirname(OAUTH_STATE_FILE);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(
      OAUTH_STATE_FILE,
      JSON.stringify({ refreshToken: newToken, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
    console.log("  ✓ Refresh token saved to data/x-oauth-state.json");
  } catch (err) {
    console.warn("  ⚠ Could not save state file:", (err as Error).message);
  }

  // 2. Also update .env.local if it exists (local dev convenience)
  const envPath = path.resolve(__dirname, "../../.env.local");
  try {
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, "utf-8");
      envContent = envContent.replace(
        /^X_OAUTH2_REFRESH_TOKEN=.*/m,
        `X_OAUTH2_REFRESH_TOKEN=${newToken}`
      );
      fs.writeFileSync(envPath, envContent, "utf-8");
      console.log("  ✓ Refresh token also saved to .env.local");
    }
  } catch {
    // Non-fatal — CI won't have .env.local
  }
}

/**
 * Get a configured XDK Client instance with a valid OAuth 2.0 access token.
 *
 * Automatically refreshes the access token using the stored refresh token
 * when it expires. This is the single entry point for all X API operations.
 *
 * @returns Authenticated XDK Client
 */
export async function getXClient(): Promise<Client> {
  const now = Date.now();

  // Return cached client if token hasn't expired (with 60s buffer)
  if (_cachedClient && now < _tokenExpiresAt - 60_000) {
    return _cachedClient;
  }

  const creds = validateXCredentials();

  // Prefer the state file token over the (potentially stale) env var
  const activeRefreshToken = getLatestRefreshToken(creds.refreshToken);

  const oauth2Config: OAuth2Config = {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri: "http://127.0.0.1:3000",
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"],
  };

  const oauth2 = new OAuth2(oauth2Config);

  // Exchange refresh token for a fresh access token
  let tokens: OAuth2Token;
  try {
    tokens = await oauth2.refreshToken(activeRefreshToken);
  } catch (error) {
    console.error("  ✗ Failed to refresh OAuth 2.0 token:", error);
    throw new Error(
      "X OAuth 2.0 token refresh failed. Your refresh token may have expired. " +
      "Run 'npx tsx scripts/generate-x-token.ts' to re-authenticate."
    );
  }

  // X OAuth 2.0 uses rotating refresh tokens — each is single-use.
  // We MUST persist the new one or the next run will fail.
  if (tokens.refresh_token && tokens.refresh_token !== activeRefreshToken) {
    persistRefreshToken(tokens.refresh_token);
  }

  const config: ClientConfig = {
    accessToken: tokens.access_token,
  };

  _cachedClient = new Client(config);
  _tokenExpiresAt = now + (tokens.expires_in ?? 7200) * 1000;

  return _cachedClient;
}



// ── Text Utilities ────────────────────────────────────────────

/**
 * Strip HTML tags from text for X (which doesn't support HTML).
 * Extracts URLs from <a> tags and appends them inline.
 *
 * @param html - HTML-formatted text
 * @returns Plain text suitable for X
 */
export function stripHtmlForX(html: string): string {
  // Convert standard block/break tags into newlines
  let text = html.replace(/<\/?(br|p|div|li)[^>]*>/gi, "\n");

  // Extract URLs from <a> tags: <a href="url">text</a>
  // If text is effectively the same as URL, just return the URL to avoid duplication.
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/gi, (match, url, linkText) => {
    const cleanText = linkText.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").replace(/<[^>]*>?/gm, "");
    const cleanUrl = url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

    if (cleanText === cleanUrl) {
      return url;
    }
    return `${linkText}: ${url}`;
  });

  // Strip remaining HTML tags
  text = text.replace(/<[^>]*>?/gm, "");
  
  // Clean up excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n");
  
  // Decode common HTML entities
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  text = text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/gi, match => entities[match.toLowerCase()] ?? match);

  return text.trim();
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

  // Keep the last 5 lines (socials + hashtags)
  for (let i = 0; i < 5 && lines.length > 0; i++) {
    footerLines.unshift(lines.pop()!);
  }

  const footerText = "\n...\n" + footerLines.join("\n").trim();

  // If footer text alone is too large, we must truncate the whole string
  if (footerText.length >= maxLength) {
    return text.substring(0, Math.max(0, maxLength - 3)) + "...";
  }

  // Calculate remaining length for header
  const allowedHeaderLength = maxLength - footerText.length;
  let headerText = lines.join("\n").trim().substring(0, allowedHeaderLength);

  // Avoid cutting in the middle of a word if possible
  const lastSpace = headerText.lastIndexOf(" ");
  if (lastSpace > allowedHeaderLength * 0.7) {
    headerText = headerText.substring(0, lastSpace);
  }

  return headerText + footerText;
}


// ── Post Operations ───────────────────────────────────────────

/**
 * Post a tweet using the XDK.
 *
 * @param text - Tweet text (HTML will be stripped, long text truncated, cashtags sanitized)
 * @param replyToTweetId - Optional ID of a tweet to reply to (creating a thread)
 * @returns Tweet ID
 */
export async function postTweet(text: string, replyToTweetId?: string): Promise<string> {
  const client = await getXClient();

  // Clean, truncate, and sanitize for X
  let cleanText = stripHtmlForX(text);
  cleanText = truncateForX(cleanText);
  cleanText = sanitizeCashtags(cleanText);

  try {
    const response = await client.posts.create({
      text: cleanText,
      ...(replyToTweetId ? { reply: { in_reply_to_tweet_id: replyToTweetId } } : {}),
    });
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    return tweetId;
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.error("  ✗ Tweet failure detail:", e?.data || e?.message || e);
    throw e;
  }
}

/**
 * Post a tweet with an attached media file (image or video) using the XDK.
 *
 * Uploads the file via XDK's media.upload(), then creates the tweet with
 * the media_id attached. Falls back to text-only if media upload fails.
 *
 * @param text - Tweet text (HTML will be stripped, long text truncated, cashtags sanitized)
 * @param mediaBuffer - File as a Buffer
 * @param mimeType - Optional mime type (default: image/png, use video/mp4 for videos)
 * @param replyToTweetId - Optional ID of a tweet to reply to (creating a thread)
 * @returns Tweet ID
 */
export async function postTweetWithMedia(
  text: string,
  mediaBuffer: Buffer,
  mimeType: string = "image/png",
  replyToTweetId?: string
): Promise<string> {
  const client = await getXClient();

  let cleanText = stripHtmlForX(text);
  cleanText = truncateForX(cleanText);
  cleanText = sanitizeCashtags(cleanText);

  // Upload media via the XDK media endpoint
  let mediaId: string | undefined;
  try {
    const mediaBase64 = mediaBuffer.toString("base64");
    // Note: XDK's oneshot upload only supports tweet_image, dm_image, subtitles.
    // Video uploads (tweet_video) require the chunked init/append/finalize flow.
    const uploadResponse = await client.media.upload({
      body: {
        media: mediaBase64,
        mediaCategory: "tweet_image",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(mimeType ? { mediaType: mimeType as any } : {}),
      },
    });
    mediaId = String(uploadResponse?.data?.id ?? uploadResponse?.data?.media_id_string ?? "");
    if (mediaId) {
      console.log(`  ✓ Media uploaded (media_id: ${mediaId}, type: ${mimeType})`);
    }
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.warn("  ⚠ Media upload failed, falling back to text-only:", e?.data || e?.message || e);
  }

  try {
    const tweetBody: Record<string, unknown> = { text: cleanText };
    if (mediaId) {
      tweetBody.media = { media_ids: [mediaId] };
    }
    if (replyToTweetId) {
      tweetBody.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    const response = await client.posts.create(tweetBody);
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    return tweetId;
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
 * Post a poll tweet using the XDK.
 *
 * If the native poll creation fails (e.g., tier restriction, API error),
 * automatically falls back to a plain-text tweet with emoji-numbered options.
 *
 * @param poll - Poll configuration
 * @returns Object with tweet ID and whether it used the native poll or fallback
 */
export async function postPoll(poll: PollOptions): Promise<{ tweetId: string; native: boolean }> {
  const client = await getXClient();
  const duration = poll.durationMinutes ?? 1440;

  // Sanitize the question text
  const cleanText = sanitizeCashtags(poll.text);

  // ── Attempt 1: Native poll ──
  try {
    const response = await client.posts.create({
      text: cleanText,
      poll: {
        options: poll.options,
        duration_minutes: duration,
      },
    });
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    console.log("  ✓ Native poll created successfully");
    return { tweetId, native: true };
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    const errorMsg = String(e?.message || e?.data || e);
    console.warn(`  ⚠ Native poll failed: ${errorMsg}`);
    console.log("  ↳ Falling back to text-based poll...");
  }

  // ── Attempt 2: Text-based fallback ──
  // Strip $ from options to avoid violating the one-cashtag rule
  const cleanOptions = poll.options.map((opt) => opt.replace(/\$([A-Z]+)\b/g, "$1"));

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const fallbackLines = [
    cleanText,
    "",
    ...cleanOptions.map((opt, i) => `${emojis[i] || "▪️"} ${opt}`),
    "",
    "Reply with your pick! 👇",
  ];

  let fallbackText = fallbackLines.join("\n");
  fallbackText = truncateForX(fallbackText);
  fallbackText = sanitizeCashtags(fallbackText);

  try {
    const response = await client.posts.create({ text: fallbackText });
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    console.log("  ✓ Text-based fallback poll posted successfully");
    return { tweetId, native: false };
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
 * Fetch worldwide trending topics from the X API.
 *
 * Note: The Trends endpoint may require elevated access. Falls back
 * gracefully to an empty array on failure.
 *
 * @returns Array of trend names, or empty array on failure
 */
export async function fetchXTrends(): Promise<XTrendItem[]> {
  try {
    const client = await getXClient();

    // Use the XDK's TrendsClient.getByWoeid (WOEID 1 = Worldwide)
    const trends = await client.trends.getByWoeid(1);
    if (trends?.data && Array.isArray(trends.data)) {
      return trends.data.map((t) => ({
        trend_name: String(t.trendName || ""),
        tweet_count: typeof t.tweetCount === "number" ? t.tweetCount : undefined,
      }));
    }

    return [];
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
