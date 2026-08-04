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
import { formatErrorForLog, redactSensitiveText, writeFileAtomic } from "./utils";
import { sendTelegramAlert } from "./reporter";
import { sanitizePostTextLinks } from "./social-link-policy";

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
  return text.replace(/\$([A-Z]{1,6}(?:[._][A-Z]{1,2})?)\b/gi, (_match, symbol: string) => {
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
}

type XCredentialEnv = Record<string, string | undefined>;

export function getMissingXCredentialNames(
  env: XCredentialEnv = process.env,
  options: { requireClientSecret?: boolean } = {},
): string[] {
  const missing: string[] = [];
  if (!env.X_OAUTH2_CLIENT_ID) missing.push("X_OAUTH2_CLIENT_ID");
  if (options.requireClientSecret && !env.X_OAUTH2_CLIENT_SECRET) {
    missing.push("X_OAUTH2_CLIENT_SECRET");
  }
  if (!env.X_OAUTH2_REFRESH_TOKEN) missing.push("X_OAUTH2_REFRESH_TOKEN");
  return missing;
}

/**
 * Ensures required X OAuth 2.0 and API credentials exist.
 * Client secret is optional for PKCE public-client authentication.
 */
export function validateXCredentials(): OAuth2Credentials {
  const clientId = process.env.X_OAUTH2_CLIENT_ID;
  const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET;
  const refreshToken = process.env.X_OAUTH2_REFRESH_TOKEN;

  const missing = getMissingXCredentialNames();

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
  };
}

// ── Client Singleton ──────────────────────────────────────────

const MAX_X_RETRIES = 3;
const X_VIDEO_APPEND_CHUNK_SIZE_BYTES = 1_000_000;

/**
 * Executes an X API call with exponential backoff retries.
 * Handles transient errors like 503 Service Unavailable.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_X_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const err = error as { status?: number; response?: { status?: number }; message?: string } | null | undefined;
      const status = err?.status || err?.response?.status;
      const message = error instanceof Error ? error.message : String(err?.message || error);

      // XDK body-double-read bug: when the X API returns a non-JSON error
      // response, the XDK tries response.json() then response.text() in its
      // catch block, causing "Body is unusable: Body has already been read".
      // This is NOT a transient network error — retrying won't help.
      const isBodyConsumedBug = message.includes("Body is unusable") || message.includes("already been read");
      if (isBodyConsumedBug) {
        console.warn(`  ⚠ X API [${label}] hit XDK response body bug (non-retryable): ${message.slice(0, 200)}`);
        throw error;
      }

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
let xTrendsClient: Client | null = null;
let _tokenExpiresAt: number = 0;
let _cachedAccessToken: string = "";

/**
 * Read the latest refresh token directly from .env.local
 * to prevent race conditions when multiple scripts run concurrently.
 */
async function getLatestRefreshToken(envToken: string): Promise<string> {
  const envPath = path.resolve(__dirname, "../../.env.local");
  try {
    const content = await fs.promises.readFile(envPath, "utf-8");
    const match = content.match(/^X_OAUTH2_REFRESH_TOKEN=(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // fallback
  }
  return envToken;
}

async function upsertEnvLocalRefreshToken(envPath: string, newToken: string): Promise<void> {
  let envContent = "";

  try {
    envContent = await fs.promises.readFile(envPath, "utf-8");
  } catch (error) {
    const isMissing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
    if (!isMissing) throw error;
  }

  if (/^X_OAUTH2_REFRESH_TOKEN=.*/m.test(envContent)) {
    envContent = envContent.replace(
      /^X_OAUTH2_REFRESH_TOKEN=.*/m,
      `X_OAUTH2_REFRESH_TOKEN=${newToken}`
    );
  } else {
    const separator = envContent.length > 0 && !envContent.endsWith("\n") ? "\n" : "";
    envContent = `${envContent}${separator}X_OAUTH2_REFRESH_TOKEN=${newToken}\n`;
  }

  await writeFileAtomic(envPath, envContent);
}

async function reportRefreshTokenPersistenceFailure(target: string, error: unknown): Promise<void> {
  const message = formatErrorForLog(error);
  console.error(`  ✗ Failed to persist X refresh token to ${target}: ${message}`);
  await sendTelegramAlert(
    `X OAuth refresh token rotation persistence failed.\n\nTarget: ${target}\nError: ${message.substring(0, 500)}`
  );
}

/**
 * Persist the new refresh token to both .env.local (local dev)
 * and GITHUB_ENV (CI/CD) for secure rotation.
 */
async function persistRefreshToken(newToken: string): Promise<void> {
  // Always update in-process env
  process.env.X_OAUTH2_REFRESH_TOKEN = newToken;
  const envPath = path.resolve(__dirname, "../../.env.local");
  let githubEnvWritten = false;
  let envLocalWritten = false;

  // 1. Export to GITHUB_ENV if running in GitHub Actions
  if (process.env.GITHUB_ENV) {
    try {
      // Mask the new token so it doesn't appear in logs
      console.info(`::add-mask::${newToken}`);
      await fs.promises.appendFile(process.env.GITHUB_ENV, `NEW_X_REFRESH_TOKEN=${newToken}\n`);
      githubEnvWritten = true;
      console.info("  ✓ Refresh token exported to GITHUB_ENV for secure secret rotation.");
    } catch (err) {
      await reportRefreshTokenPersistenceFailure("GITHUB_ENV", err);
    }
  }

  // 2. Also update .env.local. In local dev this is the durable fallback;
  // in CI it gives diagnostics if GITHUB_ENV export fails.
  try {
    await upsertEnvLocalRefreshToken(envPath, newToken);
    envLocalWritten = true;
    console.info("  ✓ Refresh token also saved to .env.local");
  } catch (err) {
    await reportRefreshTokenPersistenceFailure(".env.local", err);
  }

  if (process.env.GITHUB_ENV && !githubEnvWritten) {
    throw new Error("Failed to export rotated X refresh token to GITHUB_ENV.");
  }

  if (!process.env.GITHUB_ENV && !envLocalWritten) {
    throw new Error("Failed to persist rotated X refresh token to .env.local.");
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
  const activeRefreshToken = await getLatestRefreshToken(creds.refreshToken);

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
    console.error(`  ✗ Failed to refresh OAuth 2.0 token: ${formatErrorForLog(error)}`);
    throw new Error(
      "X OAuth 2.0 token refresh failed. Your refresh token may have expired. " +
      "Run 'npx tsx scripts/generate-x-token.ts' to re-authenticate. " +
      "(Note: If this happens in CI, you must manually update the GitHub Secret after generating a new token.)"
    );
  }

  // X OAuth 2.0 uses rotating refresh tokens — each is single-use.
  // We MUST persist the new one or the next run will fail.
  if (tokens.refresh_token && tokens.refresh_token !== activeRefreshToken) {
    await persistRefreshToken(tokens.refresh_token);
  }

  const config: ClientConfig = {
    accessToken: tokens.access_token,
  };

  _cachedClient = new Client(config);
  _cachedAccessToken = tokens.access_token;
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
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/gi, (_match, url, linkText) => {
    const cleanText = linkText.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").replace(/<[^>]*>?/gm, "");
    const cleanUrl = url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

    if (cleanText === cleanUrl) {
      return url;
    }
    return `${linkText}: ${url}`;
  });

  // Strip remaining HTML tags
  // Only strip actual known HTML tags that we use (b, i, a, br, strong, em)
  // This prevents $BTC < 100k from being truncated
  text = text.replace(/<\/?(b|i|a|br|strong|em|tg-spoiler|p|div|span)(\s[^>]*)?>/gi, "");
  
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

const X_DEFAULT_MAX_LENGTH = 280;
const X_ELLIPSIS = "...";
const X_TRAILING_HASHTAG_BLOCK = /(?:\s+#[A-Za-z][A-Za-z0-9_]{0,139}){1,3}\s*$/;

function removeDanglingHighSurrogate(text: string): string {
  if (!text) return text;
  const lastCharCode = text.charCodeAt(text.length - 1);
  return lastCharCode >= 0xd800 && lastCharCode <= 0xdbff
    ? text.slice(0, -1)
    : text;
}

function trimToXBoundary(text: string, maxLength: number, minBoundaryRatio = 0.65): string {
  let candidate = removeDanglingHighSurrogate(text.slice(0, maxLength)).trimEnd();
  if (!candidate) return "";

  const minBoundary = Math.floor(maxLength * minBoundaryRatio);
  const partialSpecialToken = candidate.match(/(?:^|\s)(?:https?:\/\/\S*|[#@$][A-Za-z0-9_]*)$/i);
  if (partialSpecialToken?.index !== undefined && partialSpecialToken.index >= minBoundary) {
    candidate = candidate.slice(0, partialSpecialToken.index).trimEnd();
  }

  const wordBoundary = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"));
  if (wordBoundary >= minBoundary) {
    return candidate.slice(0, wordBoundary).trimEnd();
  }

  return candidate;
}

function splitTrailingXHashtags(text: string): { body: string; hashtags: string } {
  const match = text.match(X_TRAILING_HASHTAG_BLOCK);
  if (!match || match.index === undefined) return { body: text, hashtags: "" };
  return {
    body: text.slice(0, match.index).trimEnd(),
    hashtags: match[0].trim(),
  };
}

/**
 * Truncate text to fit X's character limit without cutting hashtags, cashtags,
 * URLs, words, or surrogate pairs. Trailing hashtags are preserved as complete
 * tokens when possible, because a partial tag is worse than a shorter body.
 *
 * @param text - Plain text to truncate
 * @param maxLength - Maximum character count (default: 280)
 * @returns Truncated text
 */
export function truncateForX(text: string, maxLength: number = X_DEFAULT_MAX_LENGTH): string {
  if (maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= X_ELLIPSIS.length) {
    return removeDanglingHighSurrogate(text.slice(0, maxLength));
  }

  const source = text.trim();
  const { body, hashtags } = splitTrailingXHashtags(source);

  if (hashtags && hashtags.length + X_ELLIPSIS.length + 1 < maxLength) {
    const bodyBudget = maxLength - hashtags.length - X_ELLIPSIS.length - 1;
    const truncatedBody = trimToXBoundary(body, bodyBudget, 0.45);
    if (truncatedBody.length > 0) {
      const withHashtags = `${truncatedBody}${X_ELLIPSIS} ${hashtags}`;
      if (withHashtags.length <= maxLength) return withHashtags;
    }
  }

  const truncated = trimToXBoundary(source, maxLength - X_ELLIPSIS.length);
  return `${truncated}${X_ELLIPSIS}`;
}

const X_SIMILARITY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "how",
  "in",
  "is",
  "it",
  "more",
  "not",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "what",
  "with",
]);

function tokenizeForXSimilarity(text: string): Set<string> {
  const normalized = normalizeForXSimilarity(text);
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !X_SIMILARITY_STOPWORDS.has(token));
  return new Set(tokens);
}

export function normalizeForXSimilarity(text: string): string {
  return stripHtmlForX(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\$[a-z0-9_]+/g, "$token")
    .replace(/#[a-z0-9_]+/g, "#tag")
    .replace(/[^a-z0-9$#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateXPostSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForXSimilarity(a);
  const normalizedB = normalizeForXSimilarity(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const aTokens = tokenizeForXSimilarity(normalizedA);
  const bTokens = tokenizeForXSimilarity(normalizedB);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isTooSimilarForXPost(
  candidate: string,
  recentPosts: string[],
  threshold = 0.68,
): boolean {
  return recentPosts.some((recent) => calculateXPostSimilarity(candidate, recent) >= threshold);
}

export function diversifyXPostText(
  candidate: string,
  recentPosts: string[],
  seed = "",
  maxLength = 260,
): string {
  let cleanText = stripHtmlForX(candidate);
  cleanText = sanitizePostTextLinks(cleanText);
  cleanText = sanitizeCashtags(cleanText);
  cleanText = truncateForX(cleanText, maxLength);

  if (!isTooSimilarForXPost(cleanText, recentPosts)) {
    return cleanText;
  }

  const cashtag = cleanText.match(/\$[A-Z][A-Z0-9]{0,9}\b/i)?.[0].toUpperCase();
  const subject = cashtag || "This setup";
  const rewriteFrames = [
    `${subject} is not interesting because of one candle. Confirmation quality decides whether the read survives. What would invalidate it first? #Crypto`,
    `The useful ${subject} read is risk-first: liquidity, follow-through, then narrative. If one filter fails, the setup gets noisier. #Crypto`,
    `${subject} stays on the watchlist only if the data keeps improving after the first move. The next filter is follow-through. #Crypto`,
    `For ${subject}, the better question is not upside. It is whether the current move has enough confirmation to avoid being noise. #Crypto`,
    `Process note on ${subject}: headline moves get attention, but TokenRadar cares about risk score, liquidity, and confirmation. #Crypto`,
  ];
  const rewriteStartIndex = seed
    ? Math.abs(seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % rewriteFrames.length
    : 0;

  for (let offset = 0; offset < rewriteFrames.length; offset++) {
    const frame = rewriteFrames[(rewriteStartIndex + offset) % rewriteFrames.length];
    const diversified = truncateForX(sanitizeCashtags(frame), maxLength);
    if (!isTooSimilarForXPost(diversified, recentPosts)) {
      return diversified;
    }
  }

  const diversityLines = [
    "Watch confirmation, not the first candle.",
    "The invalidation matters more than the headline move.",
    "Liquidity and follow-through are the next filters.",
    "A clean retest would matter more than another green candle.",
    "Volume quality decides whether this signal survives.",
  ];
  const startIndex = seed
    ? Math.abs(seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % diversityLines.length
    : 0;

  for (let offset = 0; offset < diversityLines.length; offset++) {
    const line = diversityLines[(startIndex + offset) % diversityLines.length];
    const suffix = `\n\n${line}`;
    const bodyBudget = maxLength - suffix.length;
    if (bodyBudget < 40) continue;

    const body = truncateForX(cleanText, bodyBudget).replace(/\.\.\.$/, "").trim();
    const diversified = sanitizeCashtags(`${body}${suffix}`);
    if (!isTooSimilarForXPost(diversified, recentPosts)) {
      return diversified;
    }
  }

  return cleanText;
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
  cleanText = sanitizePostTextLinks(cleanText);
  cleanText = sanitizeCashtags(cleanText);
  cleanText = truncateForX(cleanText);

  try {
    const response = await withRetry(
      () => client.posts.create({
        text: cleanText,
        ...(replyToTweetId ? { reply: { inReplyToTweetId: replyToTweetId } } : {}),
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
  cleanText = sanitizePostTextLinks(cleanText);
  cleanText = sanitizeCashtags(cleanText);
  cleanText = truncateForX(cleanText);

  // Upload media via the XDK media endpoint
  let mediaId: string | undefined;
  const isVideo = mimeType?.startsWith("video/");
  try {
    if (isVideo) {
      // ── Chunked upload flow (required for video) ──
      // Step 1: INIT — tell X about the file size and type
      const initResponse = await withRetry(
        () => client.media.initializeUpload({
          mediaCategory: "tweet_video",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mediaType: mimeType as any,
          totalBytes: mediaBuffer.length,
        }),
        "mediaInitialize"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initData = initResponse?.data as Record<string, any> | undefined;
      const uploadMediaId = String(initData?.media_id_string ?? initData?.mediaIdString ?? initData?.id ?? "");
      if (!uploadMediaId) throw new Error("No media_id returned from INIT");

      // Step 2: APPEND — send binary chunks well under X's 5 MB media cap,
      // leaving room for multipart/form-data overhead.
      // Uses direct fetch instead of the XDK's appendUpload to avoid a body
      // double-read bug in the XDK's error handler (response.json() → response.text()
      // when the server returns non-JSON error responses).
      const CHUNK_SIZE = X_VIDEO_APPEND_CHUNK_SIZE_BYTES;
      let segmentIndex = 0;
      for (let offset = 0; offset < mediaBuffer.length; offset += CHUNK_SIZE) {
        const chunk = mediaBuffer.subarray(offset, offset + CHUNK_SIZE);
        await withRetry(
          async () => {
            const appendUrl = `https://api.x.com/2/media/upload/${encodeURIComponent(uploadMediaId)}/append`;
            const mediaChunk = Uint8Array.from(chunk);
            const appendBody = new FormData();
            appendBody.set("media", new Blob([mediaChunk], { type: mimeType }), `segment-${segmentIndex}.mp4`);
            appendBody.set("segment_index", String(segmentIndex));
            const appendResp = await fetch(appendUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${_cachedAccessToken}`,
              },
              body: appendBody,
            });
            if (!appendResp.ok) {
              let errorDetail: string;
              try {
                errorDetail = await appendResp.text();
              } catch {
                errorDetail = `HTTP ${appendResp.status}`;
              }
              const err = new Error(`APPEND seg${segmentIndex} failed: HTTP ${appendResp.status} — ${errorDetail.slice(0, 400)}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (err as any).status = appendResp.status;
              throw err;
            }
          },
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
        if (state !== "succeeded") {
          throw new Error(
            `Video processing did not complete after ${MAX_POLLS} polls (last state: ${state})`
          );
        }
      }

      mediaId = uploadMediaId;
      console.info(`  ✓ Video uploaded via chunked flow (media_id: ${mediaId})`);
    } else {
      // ── One-shot upload (images / subtitles) ──
      const mediaBase64 = mediaBuffer.toString("base64");
      const uploadResponse = await withRetry(
        () => client.media.upload({
          media: mediaBase64,
          mediaCategory: "tweet_image",
        }),
        "mediaUpload"
      );
      // Keep the legacy response fallback for older X deployments while using
      // the v0.6 SDK's canonical `id` field.
      const uploadData = uploadResponse?.data as Record<string, unknown> | undefined;
      mediaId = String(uploadData?.id ?? uploadData?.media_id_string ?? "");
      if (mediaId) {
        console.info(`  ✓ Image uploaded (media_id: ${mediaId}, type: ${mimeType})`);
      }
    }
  } catch (_e: unknown) {
    const e = _e as Record<string, unknown>;
    const mediaError = redactSensitiveText(String(e?.data || e?.message || e));
    if (isVideo) {
      console.warn(`  ⚠ Video upload failed; not publishing a text-only video tweet: ${mediaError}`);
      throw _e;
    }
    console.warn(`  ⚠ Media upload failed, falling back to text-only: ${mediaError}`);
    // Add unique timestamp footprint to bypass X's 403 Duplicate Content filter
    cleanText = truncateForX(cleanText, 250) + `\n\n[🔄 ${Date.now().toString().slice(-4)}]`;
  }

  try {
    const tweetBody: Record<string, unknown> = { text: cleanText };
    if (mediaId) {
      tweetBody.media = { mediaIds: [mediaId] };
    }
    if (replyToTweetId) {
      tweetBody.reply = { inReplyToTweetId: replyToTweetId };
    }

    const response = await withRetry(
      () => client.posts.create(tweetBody),
      "postTweetWithMedia"
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

const X_POLL_MIN_OPTIONS = 2;
const X_POLL_MAX_OPTIONS = 4;
const X_POLL_MAX_OPTION_LENGTH = 25;

function normalizePollOptions(options: string[]): string[] {
  const normalized = options
    .map((option) => {
      const cleanOption = sanitizePostTextLinks(stripHtmlForX(String(option))).trim();
      return truncateForX(cleanOption, X_POLL_MAX_OPTION_LENGTH);
    })
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
    .slice(0, X_POLL_MAX_OPTIONS);

  if (normalized.length < X_POLL_MIN_OPTIONS) {
    throw new Error(`X polls require at least ${X_POLL_MIN_OPTIONS} non-empty options.`);
  }

  return normalized;
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
  const cleanText = truncateForX(sanitizeCashtags(sanitizePostTextLinks(stripHtmlForX(poll.text))));
  const cleanPollOptions = normalizePollOptions(poll.options);

  // ── Attempt 1: Native poll ──
  try {
    const response = await withRetry(
      () => client.posts.create({
        text: cleanText,
        poll: {
          options: cleanPollOptions,
          durationMinutes: duration,
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
  const cleanOptions = cleanPollOptions.map((opt) => opt.replace(/\$([A-Za-z][A-Za-z0-9_]*)\b/g, "$1"));

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
    console.error(`  ✗ Fallback tweet also failed: ${redactSensitiveText(formatErrorForLog(_e2))}`);
    throw _e2;
  }
}

// ── X Trends Integration ──────────────────────────────────────

/** A single trend item from the X API. */
export interface XTrendItem {
  trend_name: string;
  tweet_count?: number;
}

/**
 * Get a dedicated X Client for Trends using an App-Only Bearer Token.
 * The /2/trends endpoint strictly requires BearerToken auth and rejects OAuth2 User Context.
 */
function getXTrendsClient(): Client {
  if (xTrendsClient) return xTrendsClient;
  
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    throw new Error("Missing X_BEARER_TOKEN in environment. Trends API requires a BearerToken (App-Only).");
  }
  
  xTrendsClient = new Client({ bearerToken: bearer });
  return xTrendsClient;
}

/**
 * Fetch worldwide trending topics from the X API.
 * Uses the App-Only Bearer Token client.
 * Falls back gracefully to an empty array on failure.
 */
export async function fetchXTrends(): Promise<XTrendItem[]> {
  try {
    const client = getXTrendsClient();

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
    console.warn(`  ⚠ Failed to fetch X Trends: ${msg}`);
    return [];
  }
}

/**
 * Match X trend names against a list of known token names/symbols.
 * Uses case-insensitive matching against hashtags and keyword patterns.
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

