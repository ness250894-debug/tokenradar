/**
 * Cloudflare R2 - Media Staging Client
 *
 * Manages temporary media storage for Meta (IG/Threads) API publishing.
 * Meta requires publicly accessible URLs to fetch video and image content.
 *
 * Strategy:
 *  - Use per-format prefixes so one social flow cannot delete another flow's files
 *  - Upload media, obtain public URLs for Meta containers
 *  - Delete exact uploaded keys after a successful publish
 *  - Keep failed-run files briefly for diagnostics, with a bucket lifecycle rule as fallback
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import { Readable } from "stream";
import { markMediaStagingDeleted, recordMediaStagingUpload } from "./ops-ledger";

/** Required environment variables for R2 access. */
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

/**
 * Load and validate R2 configuration from environment variables.
 * @throws if any required variable is missing.
 */
function loadR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || "tokenradar-media";
  const publicUrl = process.env.R2_PUBLIC_URL || `https://pub-${accountId}.r2.dev`;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

/** Lazily initialized S3 client singleton. */
let s3Client: S3Client | null = null;
let r2Config: R2Config | null = null;

function getClient(): { client: S3Client; config: R2Config } {
  if (!s3Client || !r2Config) {
    r2Config = loadR2Config();
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }
  return { client: s3Client, config: r2Config };
}

function buildPublicUrl(baseUrl: string, key: string): string {
  const safeKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${baseUrl.replace(/\/$/, "")}/${safeKey}`;
}

function inferStagingMetadata(key: string, contentType: string): { platform: string; kind: string } {
  const parts = key.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || key;
  const baseName = fileName.replace(/\.[^.]+$/, "");

  if (parts[0] === "ig-carousel") {
    return { platform: "instagram", kind: "carousel-image" };
  }

  if (parts[0] === "video") {
    return {
      platform: baseName || "unknown",
      kind: contentType.startsWith("video/") ? "video" : "media",
    };
  }

  if (baseName.includes("threads")) {
    return { platform: "threads", kind: contentType.startsWith("video/") ? "video" : "media" };
  }

  if (baseName.includes("instagram")) {
    return { platform: "instagram", kind: contentType.startsWith("video/") ? "video" : "media" };
  }

  return { platform: "unknown", kind: contentType.startsWith("video/") ? "video" : "media" };
}

async function uploadObject(
  body: Buffer | Uint8Array,
  key: string,
  contentType: string,
): Promise<string> {
  const { client, config } = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const publicUrl = buildPublicUrl(config.publicUrl, key);
  const staging = inferStagingMetadata(key, contentType);
  await recordMediaStagingUpload({
    objectKey: key,
    bucket: config.bucketName,
    platform: staging.platform,
    kind: staging.kind,
    bytes: body.length,
    contentType,
    publicUrl,
  });

  console.info(`  [r2] Uploaded ${key} (${(body.length / 1024 / 1024).toFixed(2)} MB) -> ${publicUrl}`);
  return publicUrl;
}

/**
 * Remove ALL objects from the staging bucket.
 * Prefer cleanPrefix() for production social flows so different media types remain isolated.
 */
export async function cleanBucket(): Promise<number> {
  return cleanPrefix("");
}

/**
 * Remove all objects under a specific key prefix.
 *
 * @param prefix - Object key prefix, such as "video/" or "ig-carousel/"
 * @returns Number of deleted objects.
 */
export async function cleanPrefix(prefix: string): Promise<number> {
  const { client, config } = getClient();
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listResult.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key));

    deleted += await deleteObjects(keys);
    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  const label = prefix ? `prefix "${prefix}"` : "bucket";
  if (deleted === 0) {
    console.info(`  [r2] ${label} is clean - no stale files to remove.`);
    return 0;
  }

  console.info(`  [r2] Cleaned ${deleted} stale file(s) from ${label}.`);
  return deleted;
}

/**
 * Upload a local video file to R2 and return the public URL.
 *
 * @param filePath - Absolute path to the local video file (MP4)
 * @param key - Object key in the bucket (e.g., "video/2026-05-09/instagram.mp4")
 * @returns Public URL for the uploaded file
 */
export async function uploadVideo(filePath: string, key: string): Promise<string> {
  const body = fs.readFileSync(filePath);
  const contentType = key.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";

  return uploadObject(body, key, contentType);
}

/**
 * Upload an in-memory object to R2 and return the public URL.
 */
export async function uploadBuffer(
  body: Buffer | Uint8Array,
  key: string,
  contentType: string = "application/octet-stream",
): Promise<string> {
  return uploadObject(body, key, contentType);
}

/**
 * Download an object from R2.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const { client, config } = getClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  const body = response.Body;
  if (!body) return Buffer.alloc(0);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error(`Unsupported R2 response body for ${key}`);
}

/**
 * Delete a single object from the bucket by key.
 */
export async function deleteObject(key: string): Promise<void> {
  const { client, config } = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  console.info(`  [r2] Deleted ${key}`);
  await markMediaStagingDeleted(key);
}

/**
 * Delete specific objects from the bucket by key.
 *
 * DeleteObject is a free R2 operation, and explicit keys prevent one publishing
 * flow from removing another flow's still-needed staged media.
 */
export async function deleteObjects(keys: string[]): Promise<number> {
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  if (uniqueKeys.length === 0) return 0;

  for (const key of uniqueKeys) {
    await deleteObject(key);
  }

  return uniqueKeys.length;
}

/**
 * Check if R2 credentials are configured.
 * Used by the orchestrator to conditionally skip R2 operations.
 */
export function hasR2Credentials(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
  );
}
