import * as fs from "fs";

import { SOCIAL_PLATFORM_LIMITS } from "./config";
import { fetchWithRetry } from "./fetch-with-retry";

const TIKTOK_AUTH_BASE_URL = "https://www.tiktok.com";
const DEFAULT_TIKTOK_API_BASE_URL = "https://open.tiktokapis.com";
const DEFAULT_VIDEO_CHUNK_SIZE = 10 * 1024 * 1024;
const MIN_VIDEO_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_CHUNK_SIZE = 64 * 1024 * 1024;
const TIKTOK_FETCH_RETRIES = 3;
const TIKTOK_FETCH_RETRY_DELAY_MS = 1_000;
const DEFAULT_DIRECT_POST_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DIRECT_POST_POLL_TIMEOUT_MS = 120_000;

export const TIKTOK_UPLOAD_SCOPE = "video.upload";
export const TIKTOK_PUBLISH_SCOPE = "video.publish";
export const TIKTOK_BASIC_USER_SCOPE = "user.info.basic";

export type TikTokCredentialMode = "sandbox" | "production";
export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

export interface TikTokAuthUrlOptions {
  clientKey?: string;
  redirectUri?: string;
  scopes?: string[];
  state?: string;
}

export interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface TikTokErrorPayload {
  error?: string | {
    code?: string;
    message?: string;
    log_id?: string;
  };
  error_description?: string;
  log_id?: string;
  data?: unknown;
}

interface TikTokApiEnvelope<T> {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
  data?: T;
}

interface TikTokUploadInitResponse {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

export interface TikTokPostStatus {
  status?: string;
  fail_reason?: string;
  publicaly_available_post_id?: string[];
  uploaded_bytes?: number;
}

interface TikTokPostStatusResponse {
  data?: TikTokPostStatus;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

export interface TikTokUploadVideoOptions {
  videoPath: string;
  accessToken?: string;
}

export interface TikTokUploadVideoResult {
  publishId: string;
  status?: TikTokPostStatus;
}

export interface TikTokDirectPostVideoOptions extends TikTokUploadVideoOptions {
  caption: string;
  privacyLevel?: TikTokPrivacyLevel;
  /** Primarily exposed so deterministic tests do not wait between status reads. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface TikTokCreatorInfo {
  creator_username?: string;
  creator_avatar_url?: string;
  privacy_level_options?: TikTokPrivacyLevel[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

interface TikTokCreatorInfoResponse {
  data?: TikTokCreatorInfo;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

export interface TikTokDirectPostVideoResult extends TikTokUploadVideoResult {
  creatorInfo?: TikTokCreatorInfo;
  privacyLevel: TikTokPrivacyLevel;
  /** Public post evidence; the upload operation's publishId is not a post ID. */
  publicPostId: string;
}

export class TikTokPublishOutcomeUnknownError extends Error {
  override readonly cause: unknown;
  readonly publishId: string;

  constructor(publishId: string, cause: unknown) {
    super(`TikTok publish ${publishId} did not reach a verifiable public terminal state.`);
    this.name = "TikTokPublishOutcomeUnknownError";
    this.publishId = publishId;
    this.cause = cause;
  }
}

export function isTikTokPublishOutcomeUnknownError(
  error: unknown,
): error is TikTokPublishOutcomeUnknownError {
  return error instanceof TikTokPublishOutcomeUnknownError;
}

interface TikTokChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

class TikTokChunkUploadError extends Error {
  override readonly cause: unknown;
  readonly finalChunkOutcomeMayBeUnknown: boolean;

  constructor(message: string, cause: unknown, finalChunkOutcomeMayBeUnknown: boolean) {
    super(message);
    this.name = "TikTokChunkUploadError";
    this.cause = cause;
    this.finalChunkOutcomeMayBeUnknown = finalChunkOutcomeMayBeUnknown;
  }
}

function getTikTokApiBaseUrl(): string {
  return (process.env.TIKTOK_API_BASE_URL || DEFAULT_TIKTOK_API_BASE_URL).replace(/\/$/, "");
}

function getTikTokClientKey(): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) throw new Error("Missing TIKTOK_CLIENT_KEY.");
  return clientKey;
}

function getTikTokClientSecret(): string {
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientSecret) throw new Error("Missing TIKTOK_CLIENT_SECRET.");
  return clientSecret;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isTikTokPrivacyLevel(value: string): value is TikTokPrivacyLevel {
  return [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
  ].includes(value);
}

export function hasTikTokApiCredentials(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY &&
      process.env.TIKTOK_CLIENT_SECRET &&
      (process.env.TIKTOK_REFRESH_TOKEN || process.env.TIKTOK_ACCESS_TOKEN),
  );
}

export function getTikTokCredentialMode(): TikTokCredentialMode {
  const value = (process.env.TIKTOK_ENV || "sandbox").trim().toLowerCase();
  if (["production", "prod", "direct"].includes(value)) return "production";
  if (["sandbox", "sand", "inbox", "upload"].includes(value)) return "sandbox";
  throw new Error("Invalid TIKTOK_ENV. Expected sandbox or production.");
}

export function buildTikTokAuthUrl(options: TikTokAuthUrlOptions = {}): string {
  const clientKey = options.clientKey || getTikTokClientKey();
  const redirectUri = options.redirectUri || process.env.TIKTOK_REDIRECT_URI;
  if (!redirectUri) throw new Error("Missing TIKTOK_REDIRECT_URI.");

  const scopes = options.scopes || [
    TIKTOK_BASIC_USER_SCOPE,
    getTikTokCredentialMode() === "production" ? TIKTOK_PUBLISH_SCOPE : TIKTOK_UPLOAD_SCOPE,
  ];
  const state = options.state || `tokenradar-${Date.now()}`;
  const url = new URL("/v2/auth/authorize/", TIKTOK_AUTH_BASE_URL);
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

function formatTikTokPayloadError(payload: TikTokErrorPayload): { code?: string; message?: string; logId?: string } {
  if (typeof payload.error === "string") {
    return {
      code: payload.error,
      message: payload.error_description,
      logId: payload.log_id,
    };
  }

  return {
    code: payload.error?.code,
    message: payload.error?.message,
    logId: payload.error?.log_id,
  };
}

async function parseTikTokResponse<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T & TikTokErrorPayload : {} as T & TikTokErrorPayload;

  if (!response.ok) {
    const error = formatTikTokPayloadError(payload);
    const code = error.code || response.status.toString();
    const message = error.message || response.statusText;
    const logId = error.logId ? ` log_id=${error.logId}` : "";
    throw new Error(`TikTok ${operation} failed: ${code} ${message}${logId}`);
  }

  const error = formatTikTokPayloadError(payload);
  if (error.code && error.code !== "ok") {
    const logId = error.logId ? ` log_id=${error.logId}` : "";
    throw new Error(`TikTok ${operation} failed: ${error.code} ${error.message || ""}${logId}`);
  }

  return payload;
}

function fetchTikTok(url: string, options: RequestInit): Promise<Response> {
  return fetchWithRetry(url, {
    ...options,
    retries: TIKTOK_FETCH_RETRIES,
    retryDelay: TIKTOK_FETCH_RETRY_DELAY_MS,
    throwOnHttpError: false,
  });
}

async function requestTikTokToken(body: URLSearchParams, operation: string): Promise<TikTokTokenResponse> {
  const response = await fetchTikTok(`${getTikTokApiBaseUrl()}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
  });

  const payload = await parseTikTokResponse<TikTokTokenResponse | TikTokApiEnvelope<TikTokTokenResponse>>(response, operation);
  const tokens: TikTokTokenResponse = "data" in payload && payload.data
    ? payload.data
    : payload as TikTokTokenResponse;
  if (!tokens.access_token) {
    throw new Error(`TikTok ${operation} did not return an access_token.`);
  }
  return tokens as TikTokTokenResponse;
}

export async function exchangeTikTokAuthorizationCode(code: string, redirectUri?: string): Promise<TikTokTokenResponse> {
  const resolvedRedirectUri = redirectUri || process.env.TIKTOK_REDIRECT_URI;
  if (!resolvedRedirectUri) throw new Error("Missing TIKTOK_REDIRECT_URI.");

  const body = new URLSearchParams({
    client_key: getTikTokClientKey(),
    client_secret: getTikTokClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: resolvedRedirectUri,
  });

  return requestTikTokToken(body, "authorization-code exchange");
}

export async function refreshTikTokAccessToken(refreshToken?: string): Promise<TikTokTokenResponse> {
  const token = refreshToken || process.env.TIKTOK_REFRESH_TOKEN;
  if (!token) throw new Error("Missing TIKTOK_REFRESH_TOKEN.");

  const body = new URLSearchParams({
    client_key: getTikTokClientKey(),
    client_secret: getTikTokClientSecret(),
    grant_type: "refresh_token",
    refresh_token: token,
  });

  return requestTikTokToken(body, "token refresh");
}

export async function getTikTokAccessToken(): Promise<string> {
  if (process.env.TIKTOK_REFRESH_TOKEN) {
    const tokens = await refreshTikTokAccessToken();
    return tokens.access_token;
  }

  if (process.env.TIKTOK_ACCESS_TOKEN) {
    return process.env.TIKTOK_ACCESS_TOKEN;
  }

  throw new Error("Missing TIKTOK_REFRESH_TOKEN or TIKTOK_ACCESS_TOKEN.");
}

export function normalizeTikTokCaption(caption: string | undefined): string {
  const cleanCaption = caption?.trim() || "TokenRadar market update.\n\n#Crypto #TokenRadar";
  if (cleanCaption.length <= SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT) return cleanCaption;
  return `${cleanCaption.substring(0, SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT - 3).trim()}...`;
}

export function buildTikTokChunkPlan(videoSize: number): TikTokChunkPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error("TikTok upload requires a non-empty video file.");
  }

  if (videoSize <= MAX_VIDEO_CHUNK_SIZE) {
    return {
      videoSize,
      chunkSize: videoSize,
      totalChunkCount: 1,
    };
  }

  const configuredChunkSize = Number(process.env.TIKTOK_UPLOAD_CHUNK_SIZE_BYTES || DEFAULT_VIDEO_CHUNK_SIZE);
  const boundedChunkSize = Math.min(
    MAX_VIDEO_CHUNK_SIZE,
    Math.max(MIN_VIDEO_CHUNK_SIZE, Number.isFinite(configuredChunkSize) ? configuredChunkSize : DEFAULT_VIDEO_CHUNK_SIZE),
  );
  const chunkSize = Math.floor(videoSize / boundedChunkSize) >= 2
    ? boundedChunkSize
    : Math.floor(videoSize / 2);
  const totalChunkCount = Math.floor(videoSize / chunkSize);

  return {
    videoSize,
    chunkSize,
    totalChunkCount,
  };
}

async function initializeInboxUpload(accessToken: string, plan: TikTokChunkPlan): Promise<{ publishId: string; uploadUrl: string }> {
  const response = await fetchTikTok(`${getTikTokApiBaseUrl()}/v2/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: plan.videoSize,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    }),
  });

  const payload = await parseTikTokResponse<TikTokUploadInitResponse>(response, "inbox upload init");
  const publishId = payload.data?.publish_id;
  const uploadUrl = payload.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error("TikTok inbox upload init did not return publish_id and upload_url.");
  }
  return { publishId, uploadUrl };
}

export async function getTikTokCreatorInfo(accessToken?: string): Promise<TikTokCreatorInfo> {
  const token = accessToken || await getTikTokAccessToken();
  const response = await fetchTikTok(`${getTikTokApiBaseUrl()}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });

  const payload = await parseTikTokResponse<TikTokCreatorInfoResponse>(response, "creator info query");
  return payload.data || {};
}

function resolveTikTokPrivacyLevel(
  creatorInfo: TikTokCreatorInfo,
  privacyLevel?: TikTokPrivacyLevel,
): TikTokPrivacyLevel {
  const configuredPrivacyLevel = privacyLevel || process.env.TIKTOK_PRIVACY_LEVEL || "PUBLIC_TO_EVERYONE";
  if (!isTikTokPrivacyLevel(configuredPrivacyLevel)) {
    throw new Error(
      "Invalid TIKTOK_PRIVACY_LEVEL. Expected PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, or SELF_ONLY.",
    );
  }

  const options = creatorInfo.privacy_level_options || [];
  if (options.length > 0 && !options.includes(configuredPrivacyLevel)) {
    throw new Error(
      `TikTok privacy level ${configuredPrivacyLevel} is not available for this creator. ` +
        `Available options: ${options.join(", ")}`,
    );
  }

  return configuredPrivacyLevel;
}

async function initializeDirectPost(
  accessToken: string,
  plan: TikTokChunkPlan,
  caption: string,
  privacyLevel: TikTokPrivacyLevel,
): Promise<{ publishId: string; uploadUrl: string }> {
  const response = await fetchTikTok(`${getTikTokApiBaseUrl()}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: normalizeTikTokCaption(caption),
        privacy_level: privacyLevel,
        disable_duet: getBooleanEnv("TIKTOK_DISABLE_DUET", false),
        disable_comment: getBooleanEnv("TIKTOK_DISABLE_COMMENT", false),
        disable_stitch: getBooleanEnv("TIKTOK_DISABLE_STITCH", false),
        brand_content_toggle: getBooleanEnv("TIKTOK_BRAND_CONTENT_TOGGLE", false),
        brand_organic_toggle: getBooleanEnv("TIKTOK_BRAND_ORGANIC_TOGGLE", false),
        is_aigc: getBooleanEnv("TIKTOK_IS_AIGC", false),
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: plan.videoSize,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    }),
  });

  const payload = await parseTikTokResponse<TikTokUploadInitResponse>(response, "direct post init");
  const publishId = payload.data?.publish_id;
  const uploadUrl = payload.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error("TikTok direct post init did not return publish_id and upload_url.");
  }
  return { publishId, uploadUrl };
}

async function uploadChunks(uploadUrl: string, videoPath: string, plan: TikTokChunkPlan): Promise<void> {
  const handle = await fs.promises.open(videoPath, "r");
  try {
    for (let chunkIndex = 0; chunkIndex < plan.totalChunkCount; chunkIndex++) {
      const start = chunkIndex * plan.chunkSize;
      const isFinalChunk = chunkIndex === plan.totalChunkCount - 1;
      const end = isFinalChunk ? plan.videoSize - 1 : start + plan.chunkSize - 1;
      const chunkLength = end - start + 1;
      const buffer = Buffer.alloc(chunkLength);
      await handle.read(buffer, 0, chunkLength, start);

      let response: Response;
      try {
        response = await fetchTikTok(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(chunkLength),
            "Content-Range": `bytes ${start}-${end}/${plan.videoSize}`,
          },
          body: buffer,
        });
      } catch (error) {
        throw new TikTokChunkUploadError(
          `TikTok chunk upload transport failed at chunk ${chunkIndex + 1}/${plan.totalChunkCount}.`,
          error,
          isFinalChunk,
        );
      }

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new TikTokChunkUploadError(
          `TikTok chunk upload failed at chunk ${chunkIndex + 1}/${plan.totalChunkCount}: ` +
            `${response.status} ${response.statusText} ${responseText}`.trim(),
          new Error(`HTTP ${response.status}`),
          isFinalChunk && (response.status === 408 || response.status >= 500),
        );
      }
    }
  } finally {
    await handle.close();
  }
}

export async function getTikTokPostStatus(publishId: string, accessToken?: string): Promise<TikTokPostStatus> {
  const token = accessToken || await getTikTokAccessToken();
  const response = await fetchTikTok(`${getTikTokApiBaseUrl()}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const payload = await parseTikTokResponse<TikTokPostStatusResponse>(response, "post status fetch");
  return payload.data || {};
}

export async function uploadVideoToTikTokInbox(options: TikTokUploadVideoOptions): Promise<TikTokUploadVideoResult> {
  const accessToken = options.accessToken || await getTikTokAccessToken();
  const stats = await fs.promises.stat(options.videoPath);
  const plan = buildTikTokChunkPlan(stats.size);
  const { publishId, uploadUrl } = await initializeInboxUpload(accessToken, plan);

  await uploadChunks(uploadUrl, options.videoPath, plan);

  let status: TikTokPostStatus | undefined;
  try {
    status = await getTikTokPostStatus(publishId, accessToken);
  } catch {
    status = undefined;
  }

  return { publishId, status };
}

export async function publishVideoDirectlyToTikTok(
  options: TikTokDirectPostVideoOptions,
): Promise<TikTokDirectPostVideoResult> {
  const accessToken = options.accessToken || await getTikTokAccessToken();
  const creatorInfo = await getTikTokCreatorInfo(accessToken);
  const privacyLevel = resolveTikTokPrivacyLevel(creatorInfo, options.privacyLevel);
  const stats = await fs.promises.stat(options.videoPath);
  const plan = buildTikTokChunkPlan(stats.size);
  const { publishId, uploadUrl } = await initializeDirectPost(
    accessToken,
    plan,
    options.caption,
    privacyLevel,
  );

  try {
    await uploadChunks(uploadUrl, options.videoPath, plan);
  } catch (error) {
    if (!(error instanceof TikTokChunkUploadError) || !error.finalChunkOutcomeMayBeUnknown) {
      throw error;
    }
    let reconciledStatus: TikTokPostStatus;
    try {
      reconciledStatus = await getTikTokPostStatus(publishId, accessToken);
    } catch (statusError) {
      throw new TikTokPublishOutcomeUnknownError(publishId, statusError);
    }
    const state = reconciledStatus.status?.trim().toUpperCase();
    if (state === "PUBLISH_COMPLETE") {
      const publicPostId = reconciledStatus.publicaly_available_post_id
        ?.find((value) => typeof value === "string" && value.trim())
        ?.trim();
      if (publicPostId) {
        return {
          publishId,
          publicPostId,
          status: reconciledStatus,
          creatorInfo,
          privacyLevel,
        };
      }
    }
    if (state && /(?:FAIL|ERROR)/.test(state)) {
      throw new Error(
        `TikTok direct post ${publishId} failed with status ${state}: ${reconciledStatus.fail_reason || "unknown reason"}`,
      );
    }
    throw new TikTokPublishOutcomeUnknownError(publishId, error);
  }

  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? DEFAULT_DIRECT_POST_POLL_INTERVAL_MS);
  const pollTimeoutMs = Math.max(1, options.pollTimeoutMs ?? DEFAULT_DIRECT_POST_POLL_TIMEOUT_MS);
  const deadline = Date.now() + pollTimeoutMs;
  let status: TikTokPostStatus | undefined;
  let lastStatusError: unknown;

  while (Date.now() <= deadline) {
    try {
      status = await getTikTokPostStatus(publishId, accessToken);
      lastStatusError = undefined;
    } catch (error) {
      lastStatusError = error;
    }

    const state = status?.status?.trim().toUpperCase();
    if (state === "PUBLISH_COMPLETE") {
      const publicPostId = status?.publicaly_available_post_id
        ?.find((value) => typeof value === "string" && value.trim())
        ?.trim();
      if (!publicPostId) {
        throw new TikTokPublishOutcomeUnknownError(
          publishId,
          new Error("TikTok reported PUBLISH_COMPLETE without a public post ID."),
        );
      }
      return { publishId, publicPostId, status, creatorInfo, privacyLevel };
    }
    if (state && /(?:FAIL|ERROR)/.test(state)) {
      throw new Error(
        `TikTok direct post ${publishId} failed with status ${state}: ${status?.fail_reason || "unknown reason"}`,
      );
    }
    if (Date.now() >= deadline) break;
    if (pollIntervalMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new TikTokPublishOutcomeUnknownError(
    publishId,
    lastStatusError || new Error(`Last TikTok status: ${status?.status || "unavailable"}`),
  );
}
