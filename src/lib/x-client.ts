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
import { sleep } from "./shared-utils";
import { formatErrorForLog, redactSensitiveText } from "./utils";

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
  clientSecret?: string;
  refreshToken: string;
  bearerToken?: string;
}

/**
 * Ensures required X OAuth 2.0 and API credentials exist.
 * Includes clientSecret for Confidential Client authentication.
 */
export function validateXCredentials(): OAuth2Credentials {
  const clientId = process.env.X_OAUTH2_CLIENT_ID;
  const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET;
  const refreshToken = process.env.X_OAUTH2_REFRESH_TOKEN;

  const missing: string[] = [];
  if (!clientId) missing.push("X_OAUTH2_CLIENT_ID");
  if (!refreshToken) missing.push("X_OAUTH2_REFRESH_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing X OAuth 2.0 credentials: ${missing.join(", ")}. ` +
      `Run 'npx tsx scripts/generate-x-token.ts' to set up OAuth 2.0.`
    );
  }

  return {
    clientId: clientId!,
    clientSecret,
    refreshToken: refreshToken!,
    bearerToken: process.env.X_BEARER_TOKEN,
  };
}

// ── Client Singleton ──────────────────────────────────────────

const MAX_X_RETRIES = 3;

/**
 * Executes an X API call with exponential backoff retries.
 * Handles transient errors like 503 Service Unavailable.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;
  for (let attempt = 1; attempt <= MAX_X_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.status || (error as any)?.response?.status;
      
      // Retry on 503 (Service Unavailable) or 500 (Internal Error), or networking errors
      const shouldRetry = status === 503 || status === 500 || !status;
      
      if (shouldRetry && attempt < MAX_X_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.warn(`  ⚠ X API [${label}] failed (HTTP ${status || "Network"}), retrying in ${delay}ms... (Attempt ${attempt}/${MAX_X_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

let _cachedClient: Client | null = null;
let _tokenExpiresAt: number = 0;

/**
 * Read the latest refresh token directly from .env.local
 * to prevent race conditions when multiple scripts run concurrently.
 */
function getLatestRefreshToken(envToken: string): string {
  const envPath = path.resolve(__dirname, "../../.env.local");
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/^X_OAUTH2_REFRESH_TOKEN=(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // fallback
  }
  return envToken;
}

/**
 * Persist the new refresh token to both .env.local (local dev)
 * and GITHUB_ENV (CI/CD) for secure rotation.
 */
function persistRefreshToken(newToken: string): void {
  // Always update in-process env
  process.env.X_OAUTH2_REFRESH_TOKEN = newToken;

  // 1. Export to GITHUB_ENV if running in GitHub Actions
  if (process.env.GITHUB_ENV) {
    try {
      // Mask the new token so it doesn't appear in logs
      console.info(`::add-mask::${newToken}`);
      fs.appendFileSync(process.env.GITHUB_ENV, `NEW_X_REFRESH_TOKEN=${newToken}\n`);
      console.info("  ✓ Refresh token exported to GITHUB_ENV for secure secret rotation");
    } catch (err) {
      console.error("  ✗ Failed to export to GITHUB_ENV:", (err as Error).message);
    }
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
      console.info("  ✓ Refresh token also saved to .env.local");
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
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write", "like.write"],
  };

  const oauth2 = new OAuth2(oauth2Config);

  // Exchange refresh token for a fresh access token
  let tokens: OAuth2Token;
  try {
    tokens = await oauth2.refreshToken(activeRefreshToken);
  } catch (error) {
    console.error(`  ✗ Failed to refresh OAuth 2.0 token: ${formatErrorForLog(error)}`);
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

/**
 * Get an XDK Client authenticated via Bearer Token (App-Only).
 * Required for specific endpoints like Trends.
 */
export async function getXTrendsClient(): Promise<Client> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error(
      "Missing X_BEARER_TOKEN in environment. Trends API requires a Bearer Token (App-Only). " +
      "Check your .env.local file or the Developer Portal."
    );
  }

  return new Client({ bearerToken: bearerToken });
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
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/gi, (_match, url, linkText) => {
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
    const response = await withRetry(
      () => client.posts.create({
        text: cleanText,
        ...(replyToTweetId ? { reply: { in_reply_to_tweet_id: replyToTweetId } } : {}),
      }),
      "postTweet"
    );
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    return tweetId;
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.error(`  ✗ Tweet failure detail: ${redactSensitiveText(String(e?.data || e?.message || e))}`);
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
  const isVideo = mimeType?.startsWith("video/");
  try {
    if (isVideo) {
      // ── Chunked upload flow (required for video) ──
      // Step 1: INIT — tell X about the file size and type
      const initResponse = await withRetry(
        () => client.media.initializeUpload({
          body: {
            mediaCategory: "tweet_video",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mediaType: mimeType as any,
            totalBytes: mediaBuffer.length,
          },
        }),
        "mediaInitialize"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initData = initResponse?.data as Record<string, any> | undefined;
      const uploadMediaId = String(initData?.id ?? initData?.media_id_string ?? "");
      if (!uploadMediaId) throw new Error("No media_id returned from INIT");

      // Step 2: APPEND — send the binary payload in chunks (≤5 MB each)
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
      let segmentIndex = 0;
      for (let offset = 0; offset < mediaBuffer.length; offset += CHUNK_SIZE) {
        const chunk = mediaBuffer.subarray(offset, offset + CHUNK_SIZE);
        const chunkBase64 = chunk.toString("base64");
        await withRetry(
          () => client.media.appendUpload(uploadMediaId, {
            body: { media: chunkBase64, segmentIndex },
          }),
          `mediaAppend_seg${segmentIndex}`
        );
        segmentIndex++;
      }

      // Step 3: FINALIZE
      const finalizeResponse = await withRetry(
        () => client.media.finalizeUpload(uploadMediaId),
        "mediaFinalize"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalData = finalizeResponse?.data as Record<string, any> | undefined;

      // Step 4: Poll for processing completion (video transcoding)
      let processingInfo = finalData?.processing_info || finalData?.processingInfo;
      
      // X API sometimes omits processing_info on FINALIZE. We must still verify processing is complete.
      if (!processingInfo) {
        console.info(`  ⏳ Video FINALIZE didn't yield status, fetching explicitly...`);
        await new Promise((r) => setTimeout(r, 2000));
        const statusResp = await client.media.getUploadStatus(uploadMediaId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusData = statusResp?.data as Record<string, any> | undefined;
        processingInfo = statusData?.processing_info || statusData?.processingInfo;
      }

      if (processingInfo && processingInfo.state !== "succeeded") {
        let state = processingInfo.state as string;
        let checkAfterSecs = (processingInfo.check_after_secs ?? processingInfo.checkAfterSecs ?? 5) as number;
        const MAX_POLLS = 30; // safety cap ≈ 5 min max
        for (let i = 0; i < MAX_POLLS && state !== "succeeded"; i++) {
          if (state === "failed") throw new Error("Video processing failed on X servers");
          console.info(`  ⏳ Video processing (${state}), polling in ${checkAfterSecs}s...`);
          await new Promise((r) => setTimeout(r, checkAfterSecs * 1000));
          const statusResp = await client.media.getUploadStatus(uploadMediaId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const statusData = statusResp?.data as Record<string, any> | undefined;
          const pi = statusData?.processing_info || statusData?.processingInfo;
          state = pi?.state ?? "succeeded";
          checkAfterSecs = (pi?.check_after_secs ?? pi?.checkAfterSecs ?? 5) as number;
        }
      }

      mediaId = uploadMediaId;
      console.info(`  ✓ Video uploaded via chunked flow (media_id: ${mediaId})`);
    } else {
      // ── One-shot upload (images / subtitles) ──
      const mediaBase64 = mediaBuffer.toString("base64");
      const uploadResponse = await withRetry(
        () => client.media.upload({
          body: {
            media: mediaBase64,
            mediaCategory: "tweet_image",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(mimeType ? { mediaType: mimeType as any } : {}),
          },
        }),
        "mediaUpload"
      );
      mediaId = String(uploadResponse?.data?.id ?? uploadResponse?.data?.media_id_string ?? "");
      if (mediaId) {
        console.info(`  ✓ Image uploaded (media_id: ${mediaId}, type: ${mimeType})`);
      }
    }
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    console.warn(`  ⚠ Media upload failed, falling back to text-only: ${redactSensitiveText(String(e?.data || e?.message || e))}`);
    // Add unique timestamp footprint to bypass X's 403 Duplicate Content filter
    cleanText = truncateForX(cleanText, 250) + `\n\n[🔄 ${Date.now().toString().slice(-4)}]`;
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
    console.error(`  ✗ Tweet failure detail: ${redactSensitiveText(String(e?.data || e?.message || e))}`);
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
    const response = await withRetry(
      () => client.posts.create({
        text: cleanText,
        poll: {
          options: poll.options,
          duration_minutes: duration,
        },
      }),
      "nativePoll"
    );
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    console.info("  ✓ Native poll created successfully");
    return { tweetId, native: true };
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    const errorMsg = redactSensitiveText(String(e?.message || e?.data || e));
    console.warn(`  ⚠ Native poll failed: ${errorMsg}`);
    console.info("  ↳ Falling back to text-based poll...");
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
    const response = await withRetry(
      () => client.posts.create({ text: fallbackText }),
      "fallbackPoll"
    );
    const tweetId = response?.data?.id;
    if (!tweetId) throw new Error("No tweet ID in response");
    console.info("  ✓ Text-based fallback poll posted successfully");
    return { tweetId, native: false };
  } catch (_e2: unknown) {
    const e2 = _e2 as Record<string, unknown>;
    console.error("  ✗ Fallback tweet also failed:", e2?.data || e2?.message || e2);
    throw e2;
  }
}

/**
 * Search for recent tweets matching a specific query.
 * Useful for sentiment analysis and narrative hunting.
 *
 * @param query - X search query (e.g. "$SOL narrative")
 * @param maxResults - Maximum results to return (default 10)
 * @returns Array of tweet objects
 */
export async function searchTweets(query: string, maxResults: number = 10) {
  try {
    const client = await getXClient();
    const response = await withRetry(
      () => client.posts.searchRecent(query, {
        maxResults,
        tweetFields: ["created_at", "public_metrics", "author_id", "text"],
      }),
      "searchTweets"
    );

    return response?.data || [];
  } catch (error) {
    const msg = formatErrorForLog(error);
    console.warn(`  ⚠ X Search failed for "${query}": ${msg}`);
    return [];
  }
}

/**
 * Fetch a user's profile information by their username.
 * Useful for finding official project accounts.
 *
 * @param username - X handle without the @ (e.g. "solana")
 * @returns User object or null if not found
 */
export async function getUserByUsername(username: string) {
  try {
    const client = await getXClient();
    const response = await withRetry(
      () => client.users.getByUsername(username, {
        userFields: ["description", "public_metrics", "verified", "profile_image_url"],
      }),
      "getUserByUsername"
    );

    return response?.data || null;
  } catch (error) {
    const msg = formatErrorForLog(error);
    console.error(`  ✗ Failed to fetch user @${username}: ${msg}`);
    return null;
  }
}

let _myUserId: string | null = null;

/**
 * Like a tweet (passive engagement).
 * Automatically fetches and caches the authenticated user's ID if not available.
 * 
 * @param tweetId - ID of the tweet to like
 * @returns success boolean
 */
export async function likeTweet(tweetId: string): Promise<boolean> {
  try {
    const client = await getXClient();

    // 1. Ensure we have our own user ID
    if (!_myUserId) {
      const me = await withRetry(() => client.users.getMe(), "getMe");
      _myUserId = me?.data?.id ?? null;
    }

    if (!_myUserId) throw new Error("Could not retrieve authenticated user ID");

    // 2. Perform the like
    await withRetry(
      () => client.users.likePost(_myUserId!, {
        body: { tweetId }
      }),
      "likeTweet"
    );

    return true;
  } catch (error) {
    const msg = formatErrorForLog(error);
    console.warn(`  ⚠ Failed to like tweet ${tweetId}: ${msg}`);
    return false;
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
    // Trends endpoint requires App-Only (Bearer Token) authentication
    const client = await getXTrendsClient();

    // Use the XDK's TrendsClient.getByWoeid (WOEID 1 = Worldwide)
    const trends = await withRetry(
      () => client.trends.getByWoeid(1),
      "fetchTrends"
    );
    if (trends?.data && Array.isArray(trends.data)) {
      return trends.data.map((t) => ({
        trend_name: String(t.trendName || ""),
        tweet_count: typeof t.tweetCount === "number" ? t.tweetCount : undefined,
      }));
    }

    return [];
  } catch (error) {
    const msg = formatErrorForLog(error);
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
