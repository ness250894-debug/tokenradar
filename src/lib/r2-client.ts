/**
 * Cloudflare R2 — Media Staging Client
 *
 * Manages temporary video storage for Meta (IG/Threads) API publishing.
 * Meta requires a publicly accessible URL to fetch video content.
 *
 * Strategy:
 *  - Clean all stale files at the START of each run (clean-before)
 *  - Upload videos, obtain public URLs for Meta containers
 *  - Files remain in R2 until the NEXT run cleans them (~24h)
 *  - 7-day TTL lifecycle rule on the bucket as a safety net
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import * as fs from "fs";

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

/**
 * Remove ALL objects from the staging bucket.
 * Called at the start of each publish run to clean stale files from prior runs.
 */
export async function cleanBucket(): Promise<number> {
  const { client, config } = getClient();

  const listResult = await client.send(
    new ListObjectsV2Command({ Bucket: config.bucketName }),
  );

  if (!listResult.Contents?.length) {
    console.info("  [r2] Bucket is clean — no stale files to remove.");
    return 0;
  }

  const keys = listResult.Contents.map((obj) => ({ Key: obj.Key! }));

  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.bucketName,
      Delete: { Objects: keys },
    }),
  );

  console.info(`  [r2] Cleaned ${keys.length} stale file(s) from bucket.`);
  return keys.length;
}

/**
 * Upload a local video file to R2 and return the public URL.
 *
 * @param filePath - Absolute path to the local video file (MP4)
 * @param key - Object key in the bucket (e.g., "ig-2026-05-09.mp4")
 * @returns Public URL for the uploaded file
 */
export async function uploadVideo(filePath: string, key: string): Promise<string> {
  const { client, config } = getClient();

  const body = fs.readFileSync(filePath);
  const contentType = key.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const publicUrl = `${config.publicUrl.replace(/\/$/, "")}/${key}`;
  console.info(`  [r2] Uploaded ${key} (${(body.length / 1024 / 1024).toFixed(2)} MB) → ${publicUrl}`);
  return publicUrl;
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
