import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import path from "path";
import { pathToFileURL } from "url";

import { executeD1Query, loadD1Config } from "../src/lib/d1-client";
import { isOpsLedgerEnabled, recordQuotaSnapshot } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

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

interface CloudflareApiConfig {
  apiToken: string;
  apiBaseUrl: string;
}

export interface R2MetricsConfig extends CloudflareApiConfig {
  accountId: string;
}

type SnapshotStatus = "recorded" | "disabled" | "skipped" | "failed";

const PERIOD = new Date().toISOString().slice(0, 10);
const DEFAULT_CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

function requiredD1Config() {
  const config = loadD1Config({ required: true });
  if (!config) throw new Error("Missing D1 configuration.");
  return config;
}

async function cloudflareGet<T>(
  endpointPath: string,
  config: CloudflareApiConfig = requiredD1Config(),
  fetchImpl: typeof fetch = fetch,
): Promise<CloudflareResponse<T>> {
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}${endpointPath}`;
  const response = await fetchImpl(url, {
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

export function loadR2MetricsConfig(): R2MetricsConfig | null {
  const apiToken = process.env.CLOUDFLARE_R2_METRICS_API_TOKEN?.trim();
  if (!apiToken) return null;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error(
      "CLOUDFLARE_R2_METRICS_API_TOKEN is configured, but R2_ACCOUNT_ID is missing.",
    );
  }

  return {
    accountId,
    apiToken,
    apiBaseUrl: process.env.CLOUDFLARE_API_BASE_URL?.trim() || DEFAULT_CLOUDFLARE_API_BASE_URL,
  };
}

export async function fetchR2AccountMetrics(
  config: R2MetricsConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<JsonRecord> {
  const metrics = await cloudflareGet<JsonRecord>(
    `/accounts/${config.accountId}/r2/metrics`,
    config,
    fetchImpl,
  );
  if (!metrics.result || typeof metrics.result !== "object" || Array.isArray(metrics.result)) {
    throw new Error("Cloudflare R2 metrics response is missing a valid result object.");
  }
  return metrics.result;
}

export function formatR2AccountMetricsFailure(error: unknown): string {
  return [
    `R2 account metrics snapshot failed: ${formatErrorForLog(error)}.`,
    "Verify that CLOUDFLARE_R2_METRICS_API_TOKEN has account-scoped Workers R2 Storage Read permission",
    "and that R2_ACCOUNT_ID belongs to the same account.",
    "Bucket-level S3 metrics are handled separately.",
  ].join(" ");
}

function escapeWorkflowCommandValue(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function reportWorkflowWarning(title: string, message: string): void {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.warn(`::warning title=${title}::${escapeWorkflowCommandValue(message)}`);
  } else {
    console.warn(`  [warn] ${message}`);
  }
}

function reportR2AccountMetricsFailure(error: unknown): string {
  const message = formatR2AccountMetricsFailure(error);
  reportWorkflowWarning("R2 account metrics snapshot failed", message);
  return message;
}

function reportR2BucketSnapshotFailure(error: unknown): string {
  const message = [
    `R2 bucket snapshot failed: ${formatErrorForLog(error)}.`,
    "Account-level metrics will still be attempted independently.",
  ].join(" ");
  reportWorkflowWarning("R2 bucket snapshot failed", message);
  return message;
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

async function recordR2Snapshots(): Promise<SnapshotStatus> {
  const config = loadR2MetricsConfig();
  if (!config) {
    console.log(
      "R2 account metrics disabled (CLOUDFLARE_R2_METRICS_API_TOKEN is not configured); "
      + "bucket-level metrics will still be recorded when S3 credentials are available.",
    );
    return "disabled";
  }

  const result = await fetchR2AccountMetrics(config);
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
  return "recorded";
}

async function recordR2BucketSnapshot(): Promise<SnapshotStatus> {
  const config = loadR2Config();
  if (!config) {
    console.log("R2 S3 credentials are not configured; skipping bucket-level R2 usage snapshot.");
    return "skipped";
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
  return "recorded";
}

async function main(): Promise<void> {
  if (!isOpsLedgerEnabled()) {
    console.log("D1 ops ledger is not configured; skipping Cloudflare usage snapshot.");
    return;
  }

  await recordD1Snapshots();
  let bucketStatus: SnapshotStatus = "skipped";
  let accountStatus: SnapshotStatus = "disabled";
  const componentFailures: string[] = [];
  try {
    bucketStatus = await recordR2BucketSnapshot();
  } catch (error) {
    bucketStatus = "failed";
    componentFailures.push(reportR2BucketSnapshotFailure(error));
  }
  try {
    accountStatus = await recordR2Snapshots();
  } catch (error) {
    accountStatus = "failed";
    componentFailures.push(reportR2AccountMetricsFailure(error));
  }

  console.log(
    `Cloudflare usage snapshot for ${PERIOD}: D1=recorded; `
    + `R2 bucket=${bucketStatus}; R2 account=${accountStatus}.`,
  );
  if (componentFailures.length > 0) {
    throw new Error(`Cloudflare usage snapshot component failure(s): ${componentFailures.join(" | ")}`);
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  loadEnv();
  main().catch((error) => {
    console.error(`Cloudflare usage snapshot failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  });
}
