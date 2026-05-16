import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { executeD1Query, loadD1Config } from "../src/lib/d1-client";
import { isOpsLedgerEnabled, recordQuotaSnapshot } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

type JsonRecord = Record<string, unknown>;

interface CloudflareResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
}

interface D1DatabaseInfo {
  uuid?: string;
  name?: string;
  file_size?: number;
  num_tables?: number;
  version?: string;
}

interface CountRow {
  source: string;
  count: number;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

const PERIOD = new Date().toISOString().slice(0, 10);

function requiredD1Config() {
  const config = loadD1Config({ required: true });
  if (!config) throw new Error("Missing D1 configuration.");
  return config;
}

async function cloudflareGet<T>(path: string): Promise<CloudflareResponse<T>> {
  const config = requiredD1Config();
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
  });

  const payload = await response.json() as CloudflareResponse<T>;
  if (!response.ok || !payload.success) {
    const details = (payload.errors || []).map((error) => error.message || error.code).join("; ");
    throw new Error(`Cloudflare API request failed (${response.status}): ${details || response.statusText}`);
  }

  return payload;
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumR2Metric(result: unknown, key: "metadataSize" | "objects" | "payloadSize"): number {
  if (!result || typeof result !== "object") return 0;

  let total = 0;
  for (const [entryKey, entryValue] of Object.entries(result as JsonRecord)) {
    if (entryKey === key) {
      total += numberField(entryValue);
    } else if (entryValue && typeof entryValue === "object") {
      total += sumR2Metric(entryValue, key);
    }
  }

  return total;
}

function loadR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return null;
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

async function recordD1Snapshots(): Promise<void> {
  const config = requiredD1Config();
  const db = await cloudflareGet<D1DatabaseInfo>(`/accounts/${config.accountId}/d1/database/${config.databaseId}`);
  const dbInfo = db.result || {};

  await recordQuotaSnapshot({
    source: "d1_storage_bytes",
    period: PERIOD,
    count: numberField(dbInfo.file_size),
    details: {
      databaseId: dbInfo.uuid || config.databaseId,
      databaseName: dbInfo.name || null,
      version: dbInfo.version || null,
    },
  });

  await recordQuotaSnapshot({
    source: "d1_table_count",
    period: PERIOD,
    count: numberField(dbInfo.num_tables),
    details: {
      databaseId: dbInfo.uuid || config.databaseId,
      databaseName: dbInfo.name || null,
    },
  });

  const counts = await executeD1Query<CountRow>(
    `
    SELECT 'd1_social_posts_rows' AS source, COUNT(*) AS count FROM social_posts
    UNION ALL SELECT 'd1_media_staging_rows', COUNT(*) FROM media_staging
    UNION ALL SELECT 'd1_automation_runs_rows', COUNT(*) FROM automation_runs
    UNION ALL SELECT 'd1_quota_snapshots_rows', COUNT(*) FROM quota_snapshots
    `,
    [],
    { required: true },
  );

  for (const row of counts[0]?.results || []) {
    await recordQuotaSnapshot({
      source: row.source,
      period: PERIOD,
      count: row.count,
      details: { databaseId: config.databaseId },
    });
  }
}

async function recordR2Snapshots(): Promise<void> {
  const config = requiredD1Config();

  try {
    const metrics = await cloudflareGet<JsonRecord>(`/accounts/${config.accountId}/r2/metrics`);
    const result = metrics.result || {};
    const payloadSize = sumR2Metric(result, "payloadSize");
    const metadataSize = sumR2Metric(result, "metadataSize");
    const objects = sumR2Metric(result, "objects");

    await recordQuotaSnapshot({
      source: "r2_storage_bytes",
      period: PERIOD,
      count: payloadSize + metadataSize,
      details: { payloadSize, metadataSize },
    });

    await recordQuotaSnapshot({
      source: "r2_object_count",
      period: PERIOD,
      count: objects,
      details: { accountLevelMetrics: true },
    });
  } catch (error) {
    console.warn(`  [warn] R2 metrics snapshot skipped: ${formatErrorForLog(error)}`);
  }
}

async function recordR2BucketSnapshot(): Promise<void> {
  const config = loadR2Config();
  if (!config) {
    console.log("R2 S3 credentials are not configured; skipping bucket-level R2 usage snapshot.");
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  let continuationToken: string | undefined;
  let objectCount = 0;
  let storageBytes = 0;

  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      ContinuationToken: continuationToken,
    }));

    for (const object of result.Contents || []) {
      objectCount += 1;
      storageBytes += object.Size || 0;
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  await recordQuotaSnapshot({
    source: "r2_bucket_storage_bytes",
    period: PERIOD,
    count: storageBytes,
    details: {
      bucketName: config.bucketName,
      method: "s3-list-objects",
    },
  });

  await recordQuotaSnapshot({
    source: "r2_bucket_object_count",
    period: PERIOD,
    count: objectCount,
    details: {
      bucketName: config.bucketName,
      method: "s3-list-objects",
    },
  });
}

async function main(): Promise<void> {
  if (!isOpsLedgerEnabled()) {
    console.log("D1 ops ledger is not configured; skipping Cloudflare usage snapshot.");
    return;
  }

  await recordD1Snapshots();
  await recordR2Snapshots();
  await recordR2BucketSnapshot();
  console.log(`Cloudflare usage snapshot recorded for ${PERIOD}.`);
}

main().catch((error) => {
  console.error(`Cloudflare usage snapshot failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
