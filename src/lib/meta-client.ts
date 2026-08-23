/**
 * Meta (Instagram + Threads) — Container-Based Publishing Client
 *
 * Unified client for publishing video content to Instagram Reels and Threads.
 * Both platforms use Meta's container-based publishing flow:
 *   1. Create a media container (returns container ID)
 *   2. Poll container status until FINISHED
 *   3. Publish the container
 *
 * Key differences:
 *   - IG: graph.instagram.com, media_publish endpoint
 *   - Threads: graph.threads.net, threads_publish endpoint, supports spoiler + topic_tag
 */

import { sleep } from "./shared-utils";
import { sanitizePostTextLinks } from "./social-link-policy";

/** Supported Meta platforms. */
export type MetaPlatform = "instagram" | "threads";

/** Text entity for Threads spoiler tags. */
export interface TextEntity {
  entity_type: "SPOILER";
  offset: number;
  length: number;
}

/** Options for video publishing. */
export interface PublishVideoOptions {
  /** Topic tag for Threads (no #, no . or &, 1-50 chars). */
  topicTag?: string;
  /** Text spoiler entities for Threads. */
  spoilerEntities?: TextEntity[];
  /** Cover frame offset in ms for IG Reels (e.g., 3000 = 3s). */
  thumbOffset?: number;
}

/** Options for Threads text publishing. */
export interface PublishThreadsTextOptions {
  /** Topic tag for Threads (no #, no . or &, 1-50 chars). */
  topicTag?: string;
  /** Text spoiler entities for Threads. */
  spoilerEntities?: TextEntity[];
}

/** Options for static image publishing. Threads supports the same decorations as text posts. */
export interface PublishImageOptions extends PublishThreadsTextOptions {
  /** Accessibility label describing the published image. */
  altText?: string;
}

/** Image item for an Instagram carousel post. */
export interface InstagramCarouselItem {
  imageUrl: string;
  /** Accessibility description for this individual carousel slide. */
  altText?: string;
}

/** Result of a successful publish. */
export interface PublishResult {
  id: string;
  platform: MetaPlatform;
}

/** Meta API error structure. */
interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

class MetaApiRequestError extends Error {
  readonly code: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly fbtraceId?: string;

  constructor(
    platformLabel: string,
    code: number,
    message: string,
    description: string,
    type?: string,
    subcode?: number,
    fbtraceId?: string,
  ) {
    const details = [
      subcode !== undefined ? `subcode ${subcode}` : null,
      fbtraceId ? `fbtrace ${fbtraceId}` : null,
    ].filter(Boolean);
    super(
      `Meta API error [${platformLabel}] (code ${code}${details.length ? `, ${details.join(", ")}` : ""}): ${message}. ${description}`,
    );
    this.name = "MetaApiRequestError";
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
  }
}

/** The final non-idempotent publish may have succeeded even though its response was lost. */
export class MetaPublishOutcomeUnknownError extends Error {
  override readonly cause: unknown;
  readonly platform: MetaPlatform;
  readonly containerId: string;

  constructor(platform: MetaPlatform, containerId: string, cause: unknown) {
    super(
      `Meta ${platform} publish outcome is unknown for container ${containerId}; reconcile the account feed before retrying.`,
    );
    this.name = "MetaPublishOutcomeUnknownError";
    this.platform = platform;
    this.containerId = containerId;
    this.cause = cause;
  }
}

export function isMetaPublishOutcomeUnknownError(error: unknown): error is MetaPublishOutcomeUnknownError {
  return error instanceof MetaPublishOutcomeUnknownError;
}

/** Container polling status. */
type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED";

interface ContainerStatusResponse {
  id: string;
  status_code?: ContainerStatus;
  status?: string;
}

/** Platform-specific API configuration. */
const PLATFORM_CONFIG = {
  instagram: {
    baseUrl: "https://graph.facebook.com/v25.0",
    containerEndpoint: (userId: string) => `/${userId}/media`,
    publishEndpoint: (userId: string) => `/${userId}/media_publish`,
    publishIdField: "creation_id",
    envTokenKey: "IG_ACCESS_TOKEN",
    envAccountKey: "IG_ACCOUNT_ID",
  },
  threads: {
    baseUrl: "https://graph.threads.net/v1.0",
    containerEndpoint: (userId: string) => `/${userId}/threads`,
    publishEndpoint: (userId: string) => `/${userId}/threads_publish`,
    publishIdField: "creation_id",
    envTokenKey: "THREADS_ACCESS_TOKEN",
    envAccountKey: "THREADS_ACCOUNT_ID",
  },
} as const;

/** Polling configuration. */
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;
const META_API_MAX_ATTEMPTS = 3;
const META_API_RETRY_BASE_DELAY_MS = 10_000;
const RETRYABLE_META_ERROR_CODES = new Set([1, 2, 4, 17, 9004, 2207026, 2207027, 2207052]);
const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_UNPUBLISHED_CONTAINER_CODES = new Set([9007, 2207026, 2207027]);
const DEFINITIVE_RATE_LIMIT_CODES = new Set([4, 17, 32, 429, 2207050]);

/**
 * Human-readable descriptions of common Meta API error codes.
 * Used for structured error reporting.
 */
export const META_ERROR_DESCRIPTIONS: Record<number, string> = {
  1: "Temporary Meta service error. Wait and retry.",
  2: "Meta service temporarily unavailable. Wait and retry.",
  4: "Application-level rate limit reached. Wait and retry.",
  17: "User-level rate limit reached. Wait and retry.",
  10: "Permission denied. Check Meta App Review status.",
  32: "Page-level rate limit reached. Retry in 1 hour.",
  190: "Access token expired or invalid. Run refresh-meta-tokens.ts.",
  200: "Missing required publish permission.",
  9007: "Media container is not ready for final publishing. Wait and retry.",
  2207001: "Invalid media type or format. Check video codec (H.264 required).",
  2207026: "Media container still processing. Extend poll timeout.",
  2207027: "Media container is not ready for final publishing. Wait and retry.",
  2207050: "Publishing rate limit reached.",
  2207052: "Media URL could not be fetched or is not recognized. Wait and retry.",
};

/**
 * Check if credentials for a given platform are configured.
 */
export function hasMetaCredentials(platform: MetaPlatform): boolean {
  const config = PLATFORM_CONFIG[platform];
  return Boolean(process.env[config.envTokenKey] && process.env[config.envAccountKey]);
}

/**
 * Get credentials for a given platform.
 * @throws if credentials are missing.
 */
function getCredentials(platform: MetaPlatform): { accessToken: string; userId: string } {
  const config = PLATFORM_CONFIG[platform];
  const accessToken = process.env[config.envTokenKey];
  const userId = process.env[config.envAccountKey];

  if (!accessToken || !userId) {
    throw new Error(
      `Missing ${platform} credentials. Required: ${config.envTokenKey}, ${config.envAccountKey}`,
    );
  }

  return { accessToken, userId };
}

/**
 * Make a request to the Meta Graph API.
 * Handles error extraction and structured reporting.
 */
async function metaApiRequest<T>(
  baseUrl: string,
  endpoint: string,
  method: "GET" | "POST",
  params: Record<string, string>,
  platformLabel?: string,
): Promise<T> {
  for (let attempt = 1; attempt <= META_API_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await metaApiRequestOnce<T>(baseUrl, endpoint, method, params, platformLabel);
    } catch (error) {
      if (!isRetryableMetaApiRequestError(error) || attempt >= META_API_MAX_ATTEMPTS) {
        throw error;
      }

      const delay = META_API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const label = platformLabel || "meta";
      const reason = error instanceof MetaApiRequestError
        ? `code ${error.code}`
        : error instanceof Error
          ? error.message
          : "network error";

      console.warn(
        `  [meta:${label}] API request failed with retryable error (${reason}); retrying in ${delay / 1000}s... (Attempt ${attempt}/${META_API_MAX_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }

  throw new Error("Meta API request retry loop exhausted unexpectedly.");
}

async function metaApiRequestOnce<T>(
  baseUrl: string,
  endpoint: string,
  method: "GET" | "POST",
  params: Record<string, string>,
  platformLabel?: string,
): Promise<T> {
  const url = new URL(`${baseUrl}${endpoint}`);

  let response: Response;

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    response = await fetch(url.toString());
  } else {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  }

  const label = platformLabel || "meta";
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new MetaApiRequestError(
        label,
        response.status,
        response.statusText || "Invalid Meta API response",
        "Meta API returned a non-JSON error response.",
      );
    }
    throw error;
  }

  if (!response.ok || (data as MetaApiError).error) {
    const apiError = data as MetaApiError;
    const code = apiError.error?.code ?? response.status;
    const description = META_ERROR_DESCRIPTIONS[code] || "Unknown Meta API error.";
    throw new MetaApiRequestError(
      label,
      code,
      apiError.error?.message || response.statusText,
      description,
      apiError.error?.type,
      apiError.error?.error_subcode,
      apiError.error?.fbtrace_id,
    );
  }

  return data as T;
}

function isRetryableMetaApiRequestError(error: unknown): boolean {
  if (error instanceof MetaApiRequestError) {
    return (
      RETRYABLE_META_ERROR_CODES.has(error.code) ||
      (error.subcode !== undefined && RETRYABLE_META_ERROR_CODES.has(error.subcode)) ||
      RETRYABLE_HTTP_STATUS_CODES.has(error.code)
    );
  }

  return error instanceof TypeError || error instanceof DOMException;
}

function isSafeUnpublishedContainerError(error: unknown): error is MetaApiRequestError {
  return error instanceof MetaApiRequestError && (
    SAFE_UNPUBLISHED_CONTAINER_CODES.has(error.code) ||
    (error.subcode !== undefined && SAFE_UNPUBLISHED_CONTAINER_CODES.has(error.subcode))
  );
}

function isDefinitiveRateLimitError(error: unknown): boolean {
  return error instanceof MetaApiRequestError && (
    DEFINITIVE_RATE_LIMIT_CODES.has(error.code) ||
    (error.subcode !== undefined && DEFINITIVE_RATE_LIMIT_CODES.has(error.subcode))
  );
}

function isInvalidParameterError(error: unknown): boolean {
  return error instanceof MetaApiRequestError && error.code === 100;
}

/**
 * Create a media container for publishing.
 */
async function createContainer(
  platform: MetaPlatform,
  videoUrl: string,
  caption: string,
  options?: PublishVideoOptions,
): Promise<string> {
  const { accessToken, userId } = getCredentials(platform);
  const config = PLATFORM_CONFIG[platform];

  const params: Record<string, string> = {
    access_token: accessToken,
    media_type: platform === "instagram" ? "REELS" : "VIDEO",
    video_url: videoUrl,
  };

  if (platform === "instagram") {
    params.caption = caption;
  } else {
    params.text = caption;
  }

  // Instagram-specific options
  if (platform === "instagram") {
    if (options?.thumbOffset !== undefined) {
      params.thumb_offset = String(options.thumbOffset);
    }
  }

  // Threads-specific options
  if (platform === "threads") {
    if (options?.topicTag) {
      params.topic_tag = options.topicTag;
    }
    if (options?.spoilerEntities?.length) {
      params.text_entities = JSON.stringify(options.spoilerEntities);
    }
  }

  const submit = async (requestParams: Record<string, string>): Promise<string> => {
    const result = await metaApiRequest<{ id: string }>(
      config.baseUrl,
      config.containerEndpoint(userId),
      "POST",
      requestParams,
      platform,
    );

    console.info(`  [meta:${platform}] Container created: ${result.id}`);
    return result.id;
  };

  try {
    return await submit(params);
  } catch (error) {
    if (
      platform === "threads" &&
      isInvalidParameterError(error) &&
      (params.topic_tag || params.text_entities)
    ) {
      const retryParams = { ...params };
      delete retryParams.topic_tag;
      delete retryParams.text_entities;
      console.warn(
        "  [meta:threads] Container create rejected optional topic/spoiler params; retrying without them.",
      );
      return submit(retryParams);
    }

    throw error;
  }
}

/**
 * Create a Threads text container for publishing.
 */
async function createThreadsTextContainer(
  text: string,
  options?: PublishThreadsTextOptions,
): Promise<string> {
  const { accessToken, userId } = getCredentials("threads");
  const config = PLATFORM_CONFIG.threads;

  const params: Record<string, string> = {
    access_token: accessToken,
    media_type: "TEXT",
    text,
  };

  if (options?.topicTag) {
    params.topic_tag = options.topicTag;
  }
  if (options?.spoilerEntities?.length) {
    params.text_entities = JSON.stringify(options.spoilerEntities);
  }

  const submit = async (requestParams: Record<string, string>): Promise<string> => {
    const result = await metaApiRequest<{ id: string }>(
      config.baseUrl,
      config.containerEndpoint(userId),
      "POST",
      requestParams,
      "threads",
    );

    console.info(`  [meta:threads] Text container created: ${result.id}`);
    return result.id;
  };

  try {
    return await submit(params);
  } catch (error) {
    if (isInvalidParameterError(error) && (params.topic_tag || params.text_entities)) {
      const retryParams = { ...params };
      delete retryParams.topic_tag;
      delete retryParams.text_entities;
      console.warn(
        "  [meta:threads] Text container create rejected optional topic/spoiler params; retrying without them.",
      );
      return submit(retryParams);
    }

    throw error;
  }
}

/**
 * Create a static image container for Instagram or Threads.
 */
async function createImageContainer(
  platform: MetaPlatform,
  imageUrl: string,
  caption: string,
  options?: PublishImageOptions,
): Promise<string> {
  const { accessToken, userId } = getCredentials(platform);
  const config = PLATFORM_CONFIG[platform];
  const params: Record<string, string> = {
    access_token: accessToken,
    image_url: imageUrl,
  };
  if (options?.altText) params.alt_text = options.altText;

  if (platform === "instagram") {
    params.caption = caption;
  } else {
    params.media_type = "IMAGE";
    params.text = caption;
    if (options?.topicTag) params.topic_tag = options.topicTag;
    if (options?.spoilerEntities?.length) {
      params.text_entities = JSON.stringify(options.spoilerEntities);
    }
  }

  const submit = async (requestParams: Record<string, string>): Promise<string> => {
    const result = await metaApiRequest<{ id: string }>(
      config.baseUrl,
      config.containerEndpoint(userId),
      "POST",
      requestParams,
      platform,
    );
    console.info(`  [meta:${platform}] Image container created: ${result.id}`);
    return result.id;
  };

  try {
    return await submit(params);
  } catch (error) {
    if (
      platform === "threads" &&
      isInvalidParameterError(error) &&
      (params.topic_tag || params.text_entities)
    ) {
      const retryParams = { ...params };
      delete retryParams.topic_tag;
      delete retryParams.text_entities;
      console.warn(
        "  [meta:threads] Image container rejected optional topic/spoiler params; retrying without them.",
      );
      return submit(retryParams);
    }
    throw error;
  }
}

/**
 * Create a child image container for an Instagram carousel.
 */
async function createInstagramCarouselItem(item: InstagramCarouselItem): Promise<string> {
  const { accessToken, userId } = getCredentials("instagram");
  const config = PLATFORM_CONFIG.instagram;

  const params: Record<string, string> = {
    access_token: accessToken,
    image_url: item.imageUrl,
    is_carousel_item: "true",
  };
  if (item.altText?.trim()) params.alt_text = item.altText.trim();

  const result = await metaApiRequest<{ id: string }>(
    config.baseUrl,
    config.containerEndpoint(userId),
    "POST",
    params,
    "instagram",
  );

  console.info(`  [meta:instagram] Carousel child container created: ${result.id}`);
  return result.id;
}

/**
 * Create the parent Instagram carousel container from child container IDs.
 */
async function createInstagramCarouselContainer(
  childContainerIds: string[],
  caption: string,
): Promise<string> {
  if (childContainerIds.length < 2 || childContainerIds.length > 10) {
    throw new Error(
      `Instagram carousels require 2-10 items. Received ${childContainerIds.length}.`,
    );
  }

  const { accessToken, userId } = getCredentials("instagram");
  const config = PLATFORM_CONFIG.instagram;

  const result = await metaApiRequest<{ id: string }>(
    config.baseUrl,
    config.containerEndpoint(userId),
    "POST",
    {
      access_token: accessToken,
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption,
    },
    "instagram",
  );

  console.info(`  [meta:instagram] Carousel parent container created: ${result.id}`);
  return result.id;
}

/**
 * Poll container status until it's ready for publishing.
 * @throws if container enters ERROR/EXPIRED state or poll times out.
 */
async function pollContainerStatus(
  platform: MetaPlatform,
  containerId: string,
): Promise<void> {
  const { accessToken } = getCredentials(platform);
  const config = PLATFORM_CONFIG[platform];

  const startTime = Date.now();
  const statusField = platform === "threads" ? "status" : "status_code,status";

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const result = await metaApiRequest<ContainerStatusResponse>(
      config.baseUrl,
      `/${containerId}`,
      "GET",
      {
        fields: statusField,
        access_token: accessToken,
      },
      platform,
    );

    const status = result.status_code || result.status;

    if (status === "FINISHED") {
      console.info(`  [meta:${platform}] Container ${containerId} is ready.`);
      return;
    }

    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(
        `Container ${containerId} failed with status: ${status}. ${result.status || "No additional details."}`,
      );
    }

    console.info(
      `  [meta:${platform}] Container ${containerId} status: ${status}. Polling again in ${POLL_INTERVAL_MS / 1000}s...`,
    );

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Container ${containerId} timed out after ${POLL_TIMEOUT_MS / 1000}s. Last status was IN_PROGRESS.`,
  );
}

/**
 * Publish a ready container.
 */
async function publishContainer(
  platform: MetaPlatform,
  containerId: string,
): Promise<string> {
  const { accessToken, userId } = getCredentials(platform);
  const config = PLATFORM_CONFIG[platform];

  const params = {
    access_token: accessToken,
    [config.publishIdField]: containerId,
  };

  for (let attempt = 1; attempt <= META_API_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await metaApiRequestOnce<{ id: string }>(
        config.baseUrl,
        config.publishEndpoint(userId),
        "POST",
        params,
        platform,
      );
      if (typeof result.id !== "string" || !result.id.trim()) {
        throw new MetaPublishOutcomeUnknownError(
          platform,
          containerId,
          new Error("Meta returned a successful final-publish response without a post ID."),
        );
      }
      console.info(`  [meta:${platform}] Published successfully. Post ID: ${result.id}`);
      return result.id;
    } catch (error) {
      if (error instanceof MetaPublishOutcomeUnknownError) throw error;
      if (isSafeUnpublishedContainerError(error)) {
        if (attempt < META_API_MAX_ATTEMPTS) {
          const delay = META_API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `  [meta:${platform}] Container is explicitly not published yet (code ${error.code}); retrying final publish in ${delay / 1000}s... (Attempt ${attempt}/${META_API_MAX_ATTEMPTS})`,
          );
          await sleep(delay);
          continue;
        }
        throw error;
      }
      if (isDefinitiveRateLimitError(error)) throw error;

      if (!(error instanceof MetaApiRequestError) || isRetryableMetaApiRequestError(error)) {
        throw new MetaPublishOutcomeUnknownError(platform, containerId, error);
      }
      throw error;
    }
  }

  throw new Error("Meta final publish retry loop exhausted unexpectedly.");
}

/**
 * Full publishing pipeline: create container → poll → publish.
 *
 * @param platform - Target platform ("instagram" or "threads")
 * @param videoUrl - Publicly accessible URL for the video (R2 public URL)
 * @param caption - Post caption/text
 * @param options - Platform-specific options (topic_tag, spoilers, thumb_offset)
 * @returns Published post ID and platform
 */
export async function publishVideo(
  platform: MetaPlatform,
  videoUrl: string,
  caption: string,
  options?: PublishVideoOptions,
): Promise<PublishResult> {
  const safeCaption = sanitizePostTextLinks(caption);

  console.info(`  [meta:${platform}] Starting publish pipeline...`);
  console.info(`  [meta:${platform}] Video URL: ${videoUrl}`);
  console.info(`  [meta:${platform}] Caption length: ${safeCaption.length} chars`);

  if (platform === "threads" && options?.topicTag) {
    console.info(`  [meta:${platform}] Topic: ${options.topicTag}`);
  }
  if (platform === "threads" && options?.spoilerEntities?.length) {
    console.info(`  [meta:${platform}] Spoiler entities: ${options.spoilerEntities.length}`);
  }

  // Step 1: Create container
  const containerId = await createContainer(platform, videoUrl, safeCaption, options);

  // Step 2: Poll until ready
  await pollContainerStatus(platform, containerId);

  // Step 3: Publish
  const postId = await publishContainer(platform, containerId);

  return { id: postId, platform };
}

/**
 * Full Threads text publishing pipeline: create text container -> poll -> publish.
 */
export async function publishThreadsText(
  text: string,
  options?: PublishThreadsTextOptions,
): Promise<PublishResult> {
  const safeText = sanitizePostTextLinks(text);

  console.info("  [meta:threads] Starting text publish pipeline...");
  console.info(`  [meta:threads] Text length: ${safeText.length} chars`);
  if (options?.topicTag) {
    console.info(`  [meta:threads] Topic: ${options.topicTag}`);
  }
  if (options?.spoilerEntities?.length) {
    console.info(`  [meta:threads] Spoiler entities: ${options.spoilerEntities.length}`);
  }

  const containerId = await createThreadsTextContainer(safeText, options);
  await pollContainerStatus("threads", containerId);
  const postId = await publishContainer("threads", containerId);

  return { id: postId, platform: "threads" };
}

/**
 * Full static-image publishing pipeline for Instagram feed posts and Threads images.
 */
export async function publishImage(
  platform: MetaPlatform,
  imageUrl: string,
  caption: string,
  options?: PublishImageOptions,
): Promise<PublishResult> {
  const safeCaption = sanitizePostTextLinks(caption);

  console.info(`  [meta:${platform}] Starting image publish pipeline...`);
  console.info(`  [meta:${platform}] Image URL: ${imageUrl}`);
  console.info(`  [meta:${platform}] Caption length: ${safeCaption.length} chars`);

  const containerId = await createImageContainer(platform, imageUrl, safeCaption, options);
  await pollContainerStatus(platform, containerId);
  const postId = await publishContainer(platform, containerId);
  return { id: postId, platform };
}

/**
 * Full Instagram carousel publishing pipeline:
 * create child image containers -> create parent carousel -> poll -> publish.
 */
export async function publishInstagramCarousel(
  items: InstagramCarouselItem[],
  caption: string,
): Promise<PublishResult> {
  const safeCaption = sanitizePostTextLinks(caption);

  console.info("  [meta:instagram] Starting carousel publish pipeline...");
  console.info(`  [meta:instagram] Carousel items: ${items.length}`);
  console.info(`  [meta:instagram] Caption length: ${safeCaption.length} chars`);

  if (items.length < 2 || items.length > 10) {
    throw new Error(`Instagram carousels require 2-10 items. Received ${items.length}.`);
  }

  const childContainerIds: string[] = [];
  for (const item of items) {
    const childId = await createInstagramCarouselItem(item);
    await pollContainerStatus("instagram", childId);
    childContainerIds.push(childId);
  }

  const carouselContainerId = await createInstagramCarouselContainer(childContainerIds, safeCaption);
  await pollContainerStatus("instagram", carouselContainerId);

  const postId = await publishContainer("instagram", carouselContainerId);
  return { id: postId, platform: "instagram" };
}

/**
 * Validate that an access token is still valid by calling the /me endpoint.
 *
 * @returns User info if valid, throws if expired/invalid.
 */
export async function validateToken(
  platform: MetaPlatform,
): Promise<{ id: string; username?: string }> {
  const { accessToken } = getCredentials(platform);
  const config = PLATFORM_CONFIG[platform];

  return metaApiRequest<{ id: string; username?: string }>(
    config.baseUrl,
    "/me",
    "GET",
    {
      access_token: accessToken,
      fields: platform === "threads" ? "id,username" : "id",
    },
    platform,
  );
}
