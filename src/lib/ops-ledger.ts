import { executeD1Query, hasD1Config } from "./d1-client";
import { formatErrorForLog } from "./utils";

type JsonRecord = Record<string, unknown>;

export interface MediaStagingRecord {
  objectKey: string;
  bucket: string;
  platform: string;
  kind: string;
  bytes: number;
  publicUrl: string;
  contentType?: string;
  expiresAt?: string;
  workflow?: string;
  runId?: string;
  externalId?: string;
  details?: JsonRecord;
}

export interface ExpiredMediaStagingRow {
  object_key: string;
  bucket: string;
  platform: string;
  kind: string;
  public_url: string;
  expires_at: string;
}

export interface SocialPostRecord {
  platform: string;
  contentKey: string;
  externalId?: string | number;
  postedAt?: string;
  details?: JsonRecord;
}

export interface SocialPostMetricsRecord {
  platform: string;
  contentKey: string;
  measuredAt?: string;
  impressions?: number;
  views?: number;
  likes?: number;
  replies?: number;
  comments?: number;
  reposts?: number;
  shares?: number;
  saves?: number;
  linkClicks?: number;
  profileClicks?: number;
  watchTimeSeconds?: number;
  completionRate?: number;
  details?: JsonRecord;
}

export interface AutomationRunRecord {
  id: string;
  workflow: string;
  status: string;
  slot?: string;
  startedAt?: string;
  finishedAt?: string;
  details?: JsonRecord;
}

export interface QuotaSnapshotRecord {
  source: string;
  period: string;
  count: number;
  recordedAt?: string;
  details?: JsonRecord;
}

interface SocialPostKeyRow {
  content_key: string;
}

interface SocialPostExistsRow {
  found: number;
}

const DEFAULT_MEDIA_TTL_HOURS = 48;

export function isOpsLedgerEnabled(): boolean {
  return process.env.D1_OPS_LEDGER_DISABLED !== "true" && hasD1Config();
}

function toIsoDate(date: Date): string {
  return date.toISOString();
}

function defaultExpiry(now: Date): string {
  const rawHours = Number(process.env.D1_MEDIA_STAGING_TTL_HOURS || DEFAULT_MEDIA_TTL_HOURS);
  const ttlHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : DEFAULT_MEDIA_TTL_HOURS;
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
}

function stringifyDetails(details: JsonRecord | undefined): string | null {
  if (!details) return null;
  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function workflowName(): string | undefined {
  return process.env.GITHUB_WORKFLOW || process.env.TOKENRADAR_WORKFLOW;
}

function workflowRunId(): string | undefined {
  return process.env.GITHUB_RUN_ID || process.env.TOKENRADAR_RUN_ID;
}

async function writeLedger(description: string, task: () => Promise<void>): Promise<void> {
  if (!isOpsLedgerEnabled()) return;

  try {
    await task();
  } catch (error) {
    console.warn(`  [d1] ${description} failed: ${formatErrorForLog(error)}`);
  }
}

export async function recordMediaStagingUpload(record: MediaStagingRecord): Promise<void> {
  const now = new Date();
  await writeLedger(`record media staging upload for ${record.objectKey}`, async () => {
    await executeD1Query(
      `
      INSERT INTO media_staging (
        object_key, bucket, platform, kind, content_type, bytes, public_url,
        status, workflow, run_id, created_at, expires_at, deleted_at, external_id, details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(object_key) DO UPDATE SET
        bucket = excluded.bucket,
        platform = excluded.platform,
        kind = excluded.kind,
        content_type = excluded.content_type,
        bytes = excluded.bytes,
        public_url = excluded.public_url,
        status = 'uploaded',
        workflow = excluded.workflow,
        run_id = excluded.run_id,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        deleted_at = NULL,
        external_id = excluded.external_id,
        details_json = excluded.details_json
      `,
      [
        record.objectKey,
        record.bucket,
        record.platform,
        record.kind,
        record.contentType || null,
        record.bytes,
        record.publicUrl,
        record.workflow || workflowName() || null,
        record.runId || workflowRunId() || null,
        toIsoDate(now),
        record.expiresAt || defaultExpiry(now),
        record.externalId || null,
        stringifyDetails(record.details),
      ],
    );
  });
}

export async function markMediaStagingDeleted(objectKey: string, status = "deleted"): Promise<void> {
  await writeLedger(`mark media staging deleted for ${objectKey}`, async () => {
    await executeD1Query(
      `
      UPDATE media_staging
      SET status = ?, deleted_at = ?
      WHERE object_key = ?
      `,
      [status, toIsoDate(new Date()), objectKey],
    );
  });
}

export async function listExpiredMediaStaging(limit = 100): Promise<ExpiredMediaStagingRow[]> {
  if (!isOpsLedgerEnabled()) return [];

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
  const results = await executeD1Query<ExpiredMediaStagingRow>(
    `
    SELECT object_key, bucket, platform, kind, public_url, expires_at
    FROM media_staging
    WHERE status = 'uploaded' AND expires_at <= ?
    ORDER BY expires_at ASC
    LIMIT ${safeLimit}
    `,
    [toIsoDate(new Date())],
  );

  return results[0]?.results || [];
}

async function readLedger<T>(description: string, task: () => Promise<T>, fallback: T): Promise<T> {
  if (!isOpsLedgerEnabled()) return fallback;

  try {
    return await task();
  } catch (error) {
    console.warn(`  [d1] ${description} failed: ${formatErrorForLog(error)}`);
    return fallback;
  }
}

export async function recordSocialPost(record: SocialPostRecord): Promise<void> {
  await writeLedger(`record social post ${record.platform}/${record.contentKey}`, async () => {
    await executeD1Query(
      `
      INSERT INTO social_posts (platform, content_key, external_id, posted_at, details_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(platform, content_key) DO UPDATE SET
        external_id = COALESCE(excluded.external_id, social_posts.external_id),
        posted_at = excluded.posted_at,
        details_json = excluded.details_json
      `,
      [
        record.platform,
        record.contentKey,
        record.externalId === undefined || record.externalId === null ? null : String(record.externalId),
        record.postedAt || toIsoDate(new Date()),
        stringifyDetails(record.details),
      ],
    );
  });
}

export async function hasSocialPost(platform: string, contentKey: string): Promise<boolean> {
  return readLedger(
    `check social post ${platform}/${contentKey}`,
    async () => {
      const results = await executeD1Query<SocialPostExistsRow>(
        "SELECT 1 AS found FROM social_posts WHERE platform = ? AND content_key = ? LIMIT 1",
        [platform, contentKey],
      );
      return (results[0]?.results || []).length > 0;
    },
    false,
  );
}

export async function listSocialPostContentKeys(platform: string, prefix: string): Promise<string[]> {
  return readLedger(
    `list social posts ${platform}/${prefix}`,
    async () => {
      const results = await executeD1Query<SocialPostKeyRow>(
        "SELECT content_key FROM social_posts WHERE platform = ? AND content_key LIKE ? ORDER BY posted_at DESC",
        [platform, `${prefix}%`],
      );
      return (results[0]?.results || []).map((row) => row.content_key);
    },
    [],
  );
}

export async function recordAutomationRun(record: AutomationRunRecord): Promise<void> {
  const now = toIsoDate(new Date());
  const startedAt = record.startedAt || now;
  const finishedAt = record.finishedAt || null;

  await writeLedger(`record automation run ${record.id}`, async () => {
    await executeD1Query(
      `
      INSERT INTO automation_runs (id, workflow, slot, status, started_at, finished_at, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workflow = excluded.workflow,
        slot = excluded.slot,
        status = excluded.status,
        started_at = CASE
          WHEN excluded.status = 'started' THEN excluded.started_at
          ELSE automation_runs.started_at
        END,
        finished_at = excluded.finished_at,
        details_json = excluded.details_json
      `,
      [
        record.id,
        record.workflow,
        record.slot || null,
        record.status,
        startedAt,
        finishedAt,
        stringifyDetails(record.details),
      ],
    );
  });
}

function metricValue(value: number | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

export async function recordSocialPostMetrics(record: SocialPostMetricsRecord): Promise<void> {
  await writeLedger(`record social post metrics ${record.platform}/${record.contentKey}`, async () => {
    await executeD1Query(
      `
      INSERT INTO social_post_metrics (
        platform, content_key, measured_at, impressions, views, likes, replies,
        comments, reposts, shares, saves, link_clicks, profile_clicks,
        watch_time_seconds, completion_rate, details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, content_key, measured_at) DO UPDATE SET
        impressions = excluded.impressions,
        views = excluded.views,
        likes = excluded.likes,
        replies = excluded.replies,
        comments = excluded.comments,
        reposts = excluded.reposts,
        shares = excluded.shares,
        saves = excluded.saves,
        link_clicks = excluded.link_clicks,
        profile_clicks = excluded.profile_clicks,
        watch_time_seconds = excluded.watch_time_seconds,
        completion_rate = excluded.completion_rate,
        details_json = excluded.details_json
      `,
      [
        record.platform,
        record.contentKey,
        record.measuredAt || toIsoDate(new Date()),
        metricValue(record.impressions),
        metricValue(record.views),
        metricValue(record.likes),
        metricValue(record.replies),
        metricValue(record.comments),
        metricValue(record.reposts),
        metricValue(record.shares),
        metricValue(record.saves),
        metricValue(record.linkClicks),
        metricValue(record.profileClicks),
        metricValue(record.watchTimeSeconds),
        metricValue(record.completionRate),
        stringifyDetails(record.details),
      ],
    );
  });
}

export async function recordQuotaSnapshot(record: QuotaSnapshotRecord): Promise<void> {
  const safeCount = Number.isFinite(record.count) ? Math.trunc(record.count) : 0;

  await writeLedger(`record quota snapshot ${record.source}/${record.period}`, async () => {
    await executeD1Query(
      `
      INSERT INTO quota_snapshots (source, period, count, recorded_at, details_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source, period) DO UPDATE SET
        count = excluded.count,
        recorded_at = excluded.recorded_at,
        details_json = excluded.details_json
      `,
      [
        record.source,
        record.period,
        safeCount,
        record.recordedAt || toIsoDate(new Date()),
        stringifyDetails(record.details),
      ],
    );
  });
}
