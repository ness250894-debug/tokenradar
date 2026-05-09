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

/** Supported Meta platforms. */
export type MetaPlatform = "instagram" | "threads";

/** Text entity for Threads spoiler tags. */
export interface TextEntity {
  type: "SPOILER";
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
    fbtrace_id: string;
  };
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

/**
 * Human-readable descriptions of common Meta API error codes.
 * Used for structured error reporting.
 */
export const META_ERROR_DESCRIPTIONS: Record<number, string> = {
  4: "Application-level rate limit reached. Wait and retry.",
  10: "Permission denied. Check Meta App Review status.",
  32: "Page-level rate limit reached. Retry in 1 hour.",
  190: "Access token expired or invalid. Run refresh-meta-tokens.ts.",
  200: "Missing required publish permission.",
  2207001: "Invalid media type or format. Check video codec (H.264 required).",
  2207026: "Media container still processing. Extend poll timeout.",
  2207050: "Publishing rate limit reached.",
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

  const data = await response.json();

  if (!response.ok || (data as MetaApiError).error) {
    const apiError = data as MetaApiError;
    const code = apiError.error?.code ?? response.status;
    const description = META_ERROR_DESCRIPTIONS[code] || "Unknown Meta API error.";
    const label = platformLabel || "meta";
    throw new Error(
      `Meta API error [${label}] (code ${code}): ${apiError.error?.message || response.statusText}. ${description}`,
    );
  }

  return data as T;
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
    ...((platform === "instagram" ? { caption } : { text: caption }) as any),
  };

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

  const result = await metaApiRequest<{ id: string }>(
    config.baseUrl,
    config.containerEndpoint(userId),
    "POST",
    params,
    platform,
  );

  console.info(`  [meta:${platform}] Container created: ${result.id}`);
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
  const statusField = platform === "threads" ? "status" : "status_code";

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

  const result = await metaApiRequest<{ id: string }>(
    config.baseUrl,
    config.publishEndpoint(userId),
    "POST",
    {
      access_token: accessToken,
      [config.publishIdField]: containerId,
    },
    platform,
  );

  console.info(`  [meta:${platform}] Published successfully. Post ID: ${result.id}`);
  return result.id;
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
  console.info(`  [meta:${platform}] Starting publish pipeline...`);
  console.info(`  [meta:${platform}] Video URL: ${videoUrl}`);
  console.info(`  [meta:${platform}] Caption length: ${caption.length} chars`);

  if (platform === "threads" && options?.topicTag) {
    console.info(`  [meta:${platform}] Topic: ${options.topicTag}`);
  }
  if (platform === "threads" && options?.spoilerEntities?.length) {
    console.info(`  [meta:${platform}] Spoiler entities: ${options.spoilerEntities.length}`);
  }

  // Step 1: Create container
  const containerId = await createContainer(platform, videoUrl, caption, options);

  // Step 2: Poll until ready
  await pollContainerStatus(platform, containerId);

  // Step 3: Publish
  const postId = await publishContainer(platform, containerId);

  return { id: postId, platform };
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
