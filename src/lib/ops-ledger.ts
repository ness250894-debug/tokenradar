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

export interface SocialPostEvidence {
  platform: string;
  contentKey: string;
  externalId?: string;
  postedAt?: string;
  details?: JsonRecord;
}

export type SocialDeliveryStatus =
  | "planned"
  | "publishing"
  | "published"
  | "failed"
  | "outcome_unknown";

export type SocialPostLookupState =
  | "not_found"
  | SocialDeliveryStatus
  | "unavailable";

export interface SocialPostLookupResult {
  state: SocialPostLookupState;
  blocksPublish: boolean;
  externalId?: string;
  updatedAt?: string;
}

export interface SocialDeliveryAttemptRecord {
  platform: string;
  contentKey: string;
  attemptId?: string;
  details?: JsonRecord;
}

export interface SocialDeliveryStatusRecord extends SocialDeliveryAttemptRecord {
  status: SocialDeliveryStatus;
  externalId?: string | number;
  /** Public availability time when it differs from upload completion. */
  postedAt?: string;
  error?: string;
}

export interface SocialDeliveryReservation {
  acquired: boolean;
  state: SocialDeliveryStatus;
}

export interface SocialPostMetricsRecord {
  platform: string;
  contentKey: string;
  measuredAt?: string;
  horizonHours?: number;
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

interface SocialPostStateRow {
  delivery_status: SocialDeliveryStatus | null;
  delivery_external_id: string | null;
  delivery_updated_at: string | null;
  post_found: number;
  post_external_id: string | null;
  post_posted_at: string | null;
}

export interface AiUsageEventRecord {
  workflow?: string;
  contentKey?: string;
  operation?: string;
  attempt?: number;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  thoughtsTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cost: number;
  details?: JsonRecord;
}

const SOCIAL_METRIC_COUNT_FIELDS = [
  "impressions",
  "views",
  "likes",
  "replies",
  "comments",
  "reposts",
  "shares",
  "saves",
  "linkClicks",
  "profileClicks",
] as const satisfies ReadonlyArray<keyof SocialPostMetricsRecord>;
const SOCIAL_METRIC_WINDOWS = new Set([24, 168]);

export function validateSocialPostMetricsRecord(
  record: SocialPostMetricsRecord,
  now: Date = new Date(),
): void {
  if (!record.platform.trim() || !record.contentKey.trim()) {
    throw new Error("Social metrics require non-empty platform and contentKey values.");
  }
  if (record.horizonHours !== undefined
    && (!Number.isInteger(record.horizonHours) || !SOCIAL_METRIC_WINDOWS.has(record.horizonHours))) {
    throw new Error("Social metric horizonHours must be one of the configured decision windows: 24 or 168.");
  }
  if (record.measuredAt !== undefined) {
    const measuredAt = Date.parse(record.measuredAt);
    const tenYearsAgo = now.getTime() - 10 * 365.25 * 24 * 60 * 60 * 1000;
    const fiveMinutesFromNow = now.getTime() + 5 * 60 * 1000;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(record.measuredAt)
      || !Number.isFinite(measuredAt)
      || measuredAt < tenYearsAgo
      || measuredAt > fiveMinutesFromNow) {
      throw new Error("Social metric measuredAt must be a valid, bounded ISO timestamp that is not in the future.");
    }
  }
  for (const field of SOCIAL_METRIC_COUNT_FIELDS) {
    const value = record[field];
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
      throw new Error(`Social metric ${field} must be a non-negative integer when supplied.`);
    }
  }
  if (record.watchTimeSeconds !== undefined
    && (!Number.isFinite(record.watchTimeSeconds) || record.watchTimeSeconds < 0)) {
    throw new Error("Social metric watchTimeSeconds must be non-negative when supplied.");
  }
  if (record.completionRate !== undefined
    && (!Number.isFinite(record.completionRate) || record.completionRate < 0 || record.completionRate > 1)) {
    throw new Error("Social metric completionRate must be between 0 and 1 when supplied.");
  }
}

const DEFAULT_MEDIA_TTL_HOURS = 48;

export function isOpsLedgerEnabled(): boolean {
  return process.env.D1_OPS_LEDGER_DISABLED !== "true" && hasD1Config();
}

export function isSocialDeliveryLedgerRequired(): boolean {
  // Live social writes are fail-closed by default, including direct/manual
  // CLI runs. Only controlled local testing may explicitly opt out.
  return process.env.SOCIAL_DELIVERY_LEDGER_REQUIRED !== "false";
}

function missingRequiredLedgerError(description: string): SocialLedgerUnavailableError {
  return new SocialLedgerUnavailableError(
    description,
    new Error("The durable social delivery ledger is required but D1 is disabled or not configured."),
  );
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
  const runId = process.env.GITHUB_RUN_ID || process.env.TOKENRADAR_RUN_ID;
  if (!runId) return undefined;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || process.env.TOKENRADAR_RUN_ATTEMPT || "1";
  return `${runId}:attempt-${runAttempt}`;
}

async function writeLedger(description: string, task: () => Promise<void>): Promise<void> {
  if (!isOpsLedgerEnabled()) return;

  try {
    await task();
  } catch (error) {
    console.warn(`  [d1] ${description} failed: ${formatErrorForLog(error)}`);
  }
}

async function writeLedgerRequired(description: string, task: () => Promise<void>): Promise<void> {
  if (!isOpsLedgerEnabled()) {
    if (isSocialDeliveryLedgerRequired()) throw missingRequiredLedgerError(description);
    return;
  }

  try {
    await task();
  } catch (error) {
    if (error instanceof SocialDeliveryOwnershipLostError) throw error;
    if (error instanceof SocialDeliveryReconciliationConflictError) throw error;
    if (error instanceof SocialLedgerStateError) throw error;
    throw new SocialLedgerUnavailableError(description, error);
  }
}

export class SocialLedgerUnavailableError extends Error {
  override readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Social delivery ledger unavailable while attempting to ${operation}. Publishing stopped to avoid duplicates.`);
    this.name = "SocialLedgerUnavailableError";
    this.cause = cause;
  }
}

export class SocialDeliveryOwnershipLostError extends Error {
  constructor(platform: string, contentKey: string) {
    super(
      `Delivery transition was rejected because the reservation attempt no longer owns ${platform}/${contentKey}.`,
    );
    this.name = "SocialDeliveryOwnershipLostError";
  }
}

export class SocialDeliveryReconciliationConflictError extends Error {
  constructor(platform: string, contentKey: string) {
    super(
      `Delivery reconciliation conflicted with newer ledger evidence for ${platform}/${contentKey}; reload the public and ledger state before retrying.`,
    );
    this.name = "SocialDeliveryReconciliationConflictError";
  }
}

export class SocialLedgerStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialLedgerStateError";
  }
}

export class SocialDeliveryBlockedError extends Error {
  readonly state: SocialPostLookupState;

  constructor(platform: string, contentKey: string, state: SocialPostLookupState) {
    super(
      `Social delivery ${platform}/${contentKey} is ${state}; reconcile that attempt before publishing again.`,
    );
    this.name = "SocialDeliveryBlockedError";
    this.state = state;
  }
}

function deliveryAttemptId(record: SocialDeliveryAttemptRecord): string {
  return record.attemptId || [
    workflowRunId() || `local-${process.pid}`,
    record.platform,
    record.contentKey,
  ].join(":");
}

function sanitizeDeliveryError(error: string | undefined): string | null {
  if (!error) return null;
  return error
    .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|secret)=\S+/gi, "$1=[redacted]")
    .slice(0, 1000);
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
  await writeLedgerRequired(`record social post ${record.platform}/${record.contentKey}`, async () => {
    const postedAt = record.postedAt || toIsoDate(new Date());
    await executeD1Query(
      `
      INSERT INTO social_posts (platform, content_key, external_id, posted_at, details_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(platform, content_key) DO UPDATE SET
        external_id = COALESCE(social_posts.external_id, excluded.external_id),
        posted_at = COALESCE(social_posts.posted_at, excluded.posted_at),
        details_json = json_patch(
          COALESCE(social_posts.details_json, '{}'),
          COALESCE(excluded.details_json, '{}')
        )
      `,
      [
        record.platform,
        record.contentKey,
        record.externalId === undefined || record.externalId === null ? null : String(record.externalId),
        postedAt,
        stringifyDetails(record.details),
      ],
    );

    await executeD1Query(
      `
      INSERT INTO social_delivery_attempts (
        platform, content_key, status, attempt_id, attempt_count, external_id,
        last_error, workflow, run_id, planned_at, started_at, updated_at,
        completed_at, details_json
      )
      VALUES (?, ?, 'published', ?, 1, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, content_key) DO UPDATE SET
        status = 'published',
        external_id = COALESCE(
          social_delivery_attempts.external_id,
          (
            SELECT published.external_id
            FROM social_posts published
            WHERE published.platform = social_delivery_attempts.platform
              AND published.content_key = social_delivery_attempts.content_key
          ),
          excluded.external_id
        ),
        last_error = NULL,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        details_json = json_patch(
          COALESCE(social_delivery_attempts.details_json, '{}'),
          COALESCE(excluded.details_json, '{}')
        )
      `,
      [
        record.platform,
        record.contentKey,
        `published:${record.platform}:${record.contentKey}`,
        record.externalId === undefined || record.externalId === null ? null : String(record.externalId),
        workflowName() || null,
        workflowRunId() || null,
        postedAt,
        postedAt,
        postedAt,
        postedAt,
        stringifyDetails(record.details),
      ],
    );
  });
}

export async function updateSocialPostDetails(record: {
  platform: string;
  contentKey: string;
  details: JsonRecord;
}): Promise<void> {
  await writeLedgerRequired(
    `update social post details ${record.platform}/${record.contentKey}`,
    async () => {
      const results = await executeD1Query<{ content_key: string }>(
        `
        UPDATE social_posts
        SET details_json = json_patch(
          COALESCE(details_json, '{}'),
          COALESCE(?, '{}')
        )
        WHERE platform = ? AND content_key = ?
        RETURNING content_key
        `,
        [stringifyDetails(record.details), record.platform, record.contentKey],
      );
      if ((results[0]?.results || []).length !== 1) {
        throw new SocialLedgerStateError(
          `No published social post exists for ${record.platform}/${record.contentKey}.`,
        );
      }
    },
  );
}

export async function getSocialPostLookup(
  platform: string,
  contentKey: string,
): Promise<SocialPostLookupResult> {
  if (!isOpsLedgerEnabled()) {
    if (isSocialDeliveryLedgerRequired()) {
      throw missingRequiredLedgerError(`check social delivery ${platform}/${contentKey}`);
    }
    return { state: "unavailable", blocksPublish: false };
  }

  try {
    const results = await executeD1Query<SocialPostStateRow>(
      `
      SELECT
        delivery.status AS delivery_status,
        delivery.external_id AS delivery_external_id,
        delivery.updated_at AS delivery_updated_at,
        CASE WHEN post.content_key IS NULL THEN 0 ELSE 1 END AS post_found,
        post.external_id AS post_external_id,
        post.posted_at AS post_posted_at
      FROM (SELECT 1) AS seed
      LEFT JOIN social_delivery_attempts AS delivery
        ON delivery.platform = ? AND delivery.content_key = ?
      LEFT JOIN social_posts AS post
        ON post.platform = ? AND post.content_key = ?
      LIMIT 1
      `,
      [platform, contentKey, platform, contentKey],
    );
    const row = results[0]?.results?.[0];
    if (!row) return { state: "not_found", blocksPublish: false };

    if (Number(row.post_found) === 1 || row.delivery_status === "published") {
      return {
        state: "published",
        blocksPublish: true,
        externalId: row.post_external_id || row.delivery_external_id || undefined,
        updatedAt: row.post_posted_at || row.delivery_updated_at || undefined,
      };
    }

    if (row.delivery_status) {
      return {
        state: row.delivery_status,
        blocksPublish: row.delivery_status !== "failed",
        externalId: row.delivery_external_id || undefined,
        updatedAt: row.delivery_updated_at || undefined,
      };
    }

    return { state: "not_found", blocksPublish: false };
  } catch (error) {
    console.warn(
      `  [d1] check social delivery ${platform}/${contentKey} failed: ${formatErrorForLog(error)}`,
    );
    return { state: "unavailable", blocksPublish: true };
  }
}

export async function hasSocialPost(platform: string, contentKey: string): Promise<boolean> {
  const lookup = await getSocialPostLookup(platform, contentKey);
  if (lookup.state === "unavailable") {
    if (!isOpsLedgerEnabled() && !isSocialDeliveryLedgerRequired()) return false;
    throw new SocialLedgerUnavailableError(`check social delivery ${platform}/${contentKey}`, undefined);
  }
  if (lookup.state === "published") return true;
  if (lookup.blocksPublish) {
    throw new SocialDeliveryBlockedError(platform, contentKey, lookup.state);
  }
  return false;
}

export async function reserveSocialDelivery(
  record: SocialDeliveryAttemptRecord,
): Promise<SocialDeliveryReservation> {
  if (!isOpsLedgerEnabled()) {
    if (isSocialDeliveryLedgerRequired()) {
      throw missingRequiredLedgerError(`reserve social delivery ${record.platform}/${record.contentKey}`);
    }
    return { acquired: true, state: "publishing" };
  }

  const now = toIsoDate(new Date());
  const attemptId = deliveryAttemptId(record);
  try {
    const results = await executeD1Query<{ status: SocialDeliveryStatus }>(
      `
      INSERT INTO social_delivery_attempts (
        platform, content_key, status, attempt_id, attempt_count, external_id,
        last_error, workflow, run_id, planned_at, started_at, updated_at,
        completed_at, details_json
      )
      SELECT ?, ?, 'publishing', ?, 1, NULL, NULL, ?, ?, ?, ?, ?, NULL, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM social_posts WHERE platform = ? AND content_key = ?
      )
      ON CONFLICT(platform, content_key) DO UPDATE SET
        status = 'publishing',
        attempt_id = excluded.attempt_id,
        attempt_count = CASE
          WHEN social_delivery_attempts.status = 'publishing'
            AND social_delivery_attempts.attempt_id = excluded.attempt_id
          THEN social_delivery_attempts.attempt_count
          ELSE social_delivery_attempts.attempt_count + 1
        END,
        external_id = NULL,
        last_error = NULL,
        workflow = excluded.workflow,
        run_id = excluded.run_id,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        completed_at = NULL,
        details_json = excluded.details_json
      WHERE social_delivery_attempts.status IN ('planned', 'failed')
        OR (
          social_delivery_attempts.status = 'publishing'
          AND social_delivery_attempts.attempt_id = excluded.attempt_id
        )
      RETURNING status
      `,
      [
        record.platform,
        record.contentKey,
        attemptId,
        workflowName() || null,
        workflowRunId() || null,
        now,
        now,
        now,
        stringifyDetails(record.details),
        record.platform,
        record.contentKey,
      ],
    );

    if ((results[0]?.results || []).length > 0) {
      return { acquired: true, state: "publishing" };
    }

    const lookup = await getSocialPostLookup(record.platform, record.contentKey);
    if (lookup.state === "unavailable" || lookup.state === "not_found") {
      throw new Error(`Could not reconcile an unacquired delivery reservation (${lookup.state}).`);
    }
    return { acquired: false, state: lookup.state };
  } catch (error) {
    if (error instanceof SocialLedgerUnavailableError) throw error;
    throw new SocialLedgerUnavailableError(
      `reserve social delivery ${record.platform}/${record.contentKey}`,
      error,
    );
  }
}

export async function markSocialDeliveryStatus(record: SocialDeliveryStatusRecord): Promise<void> {
  if (record.status === "published" && (record.externalId === undefined || record.externalId === null || String(record.externalId).trim() === "")) {
    throw new Error(
      `A published delivery transition requires an external ID (${record.platform}/${record.contentKey}).`,
    );
  }
  if (record.status === "published") {
    // Persist public evidence first. If the process dies before the delivery
    // row is updated, social_posts still blocks a duplicate and remains
    // available to metric collection; recordSocialPost then finalizes delivery.
    await recordSocialPost({
      platform: record.platform,
      contentKey: record.contentKey,
      externalId: record.externalId,
      postedAt: record.postedAt,
      details: record.details,
    });
    return;
  }
  await writeLedgerRequired(
    `mark social delivery ${record.platform}/${record.contentKey} as ${record.status}`,
    async () => {
      const now = toIsoDate(new Date());
      const completedAt = record.status === "publishing" || record.status === "planned" ? null : now;
      const results = await executeD1Query(
        `
        INSERT INTO social_delivery_attempts (
          platform, content_key, status, attempt_id, attempt_count, external_id,
          last_error, workflow, run_id, planned_at, started_at, updated_at,
          completed_at, details_json
        )
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, content_key) DO UPDATE SET
          status = excluded.status,
          attempt_id = excluded.attempt_id,
          external_id = COALESCE(excluded.external_id, social_delivery_attempts.external_id),
          last_error = excluded.last_error,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at,
          details_json = excluded.details_json
        WHERE social_delivery_attempts.attempt_id = excluded.attempt_id
          AND (
            social_delivery_attempts.status NOT IN ('published', 'outcome_unknown')
            OR social_delivery_attempts.status = excluded.status
          )
        `,
        [
          record.platform,
          record.contentKey,
          record.status,
          deliveryAttemptId(record),
          record.externalId === undefined || record.externalId === null ? null : String(record.externalId),
          sanitizeDeliveryError(record.error),
          workflowName() || null,
          workflowRunId() || null,
          now,
          record.status === "planned" ? null : now,
          now,
          completedAt,
          stringifyDetails(record.details),
        ],
      );
      const mutationMeta = results.find((result) => result.meta)?.meta;
      if (mutationMeta && (mutationMeta.changes ?? mutationMeta.rows_written ?? 0) === 0) {
        throw new SocialDeliveryOwnershipLostError(record.platform, record.contentKey);
      }
    },
  );
}

export async function reconcileSocialDeliveryAsPublished(record: {
  platform: string;
  contentKey: string;
  externalId: string;
}): Promise<void> {
  const externalId = record.externalId.trim();
  if (!externalId) throw new Error("A public external ID is required for delivery reconciliation.");

  await writeLedgerRequired(
    `reconcile social delivery ${record.platform}/${record.contentKey} as published`,
    async () => {
      const now = toIsoDate(new Date());
      const details = stringifyDetails({
        operatorReconciled: true,
        reconciliationMode: "public-id",
        reconciledAt: now,
      });
      type CurrentReconciliationState = {
        status: string | null;
        delivery_external_id: string | null;
        post_found: number;
        post_external_id: string | null;
      };
      const readCurrent = async (): Promise<CurrentReconciliationState | undefined> => {
        const current = await executeD1Query<CurrentReconciliationState>(
          `
          SELECT
            delivery.status,
            delivery.external_id AS delivery_external_id,
            CASE WHEN published.content_key IS NULL THEN 0 ELSE 1 END AS post_found,
            published.external_id AS post_external_id
          FROM (SELECT 1) seed
          LEFT JOIN social_delivery_attempts delivery
            ON delivery.platform = ? AND delivery.content_key = ?
          LEFT JOIN social_posts published
            ON published.platform = ? AND published.content_key = ?
          LIMIT 1
          `,
          [record.platform, record.contentKey, record.platform, record.contentKey],
        );
        return current[0]?.results?.[0];
      };
      const isMatchingPost = (state: CurrentReconciliationState | undefined): boolean =>
        Number(state?.post_found) === 1 && state?.post_external_id === externalId;
      const isFinalized = (state: CurrentReconciliationState | undefined): boolean =>
        state?.status === "published"
        && state.delivery_external_id === externalId
        && isMatchingPost(state);
      const isSafeUnresolved = (state: CurrentReconciliationState | undefined): boolean =>
        state?.status === "planned"
        // A publishing row is healable only after the matching social_posts
        // evidence check above proves the platform call already returned.
        || state?.status === "publishing"
        || state?.status === "failed"
        || state?.status === "outcome_unknown";

      await executeD1Query(
        `
        INSERT INTO social_posts (platform, content_key, external_id, posted_at, details_json)
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM social_delivery_attempts unresolved
          WHERE unresolved.platform = ?
            AND unresolved.content_key = ?
            AND (
              (
                unresolved.status IN ('planned', 'failed', 'outcome_unknown')
                AND (unresolved.external_id IS NULL OR unresolved.external_id = ?)
              )
              OR (unresolved.status = 'published' AND unresolved.external_id = ?)
            )
        )
          AND NOT EXISTS (
            SELECT 1 FROM social_posts published
            WHERE published.platform = ? AND published.content_key = ?
          )
        `,
        [
          record.platform,
          record.contentKey,
          externalId,
          now,
          details,
          record.platform,
          record.contentKey,
          externalId,
          externalId,
          record.platform,
          record.contentKey,
        ],
      );

      const current = await readCurrent();
      if (isFinalized(current)) return;
      // A social_posts row is the durable duplicate-prevention evidence. If
      // an older deployment wrote that row without a delivery attempt, it is
      // already authoritative and there is no attempt to finalize.
      if (isMatchingPost(current) && !current?.status) return;
      if (
        !isMatchingPost(current)
        || !isSafeUnresolved(current)
        || Boolean(current?.delivery_external_id && current.delivery_external_id !== externalId)
      ) {
        throw new SocialDeliveryReconciliationConflictError(record.platform, record.contentKey);
      }

      await executeD1Query(
        `
        UPDATE social_delivery_attempts
        SET status = 'published',
            external_id = ?,
            last_error = NULL,
            updated_at = ?,
            completed_at = ?,
            details_json = json_patch(COALESCE(details_json, '{}'), COALESCE(?, '{}'))
        WHERE platform = ?
          AND content_key = ?
          AND status IN ('planned', 'publishing', 'failed', 'outcome_unknown')
          AND (external_id IS NULL OR external_id = ?)
          AND EXISTS (
            SELECT 1 FROM social_posts published
            WHERE published.platform = social_delivery_attempts.platform
              AND published.content_key = social_delivery_attempts.content_key
              AND published.external_id = ?
          )
        `,
        [
          externalId,
          now,
          now,
          details,
          record.platform,
          record.contentKey,
          externalId,
          externalId,
        ],
      );
      if (!isFinalized(await readCurrent())) {
        throw new SocialDeliveryReconciliationConflictError(record.platform, record.contentKey);
      }
    },
  );
}

export async function releaseSocialDeliveryForVerifiedRetry(record: {
  platform: string;
  contentKey: string;
  verificationNote: string;
}): Promise<void> {
  const verificationNote = record.verificationNote.trim();
  if (verificationNote.length < 12) {
    throw new Error("A specific verification note is required before releasing a delivery for retry.");
  }
  await writeLedgerRequired(
    `release verified social delivery ${record.platform}/${record.contentKey}`,
    async () => {
      const now = toIsoDate(new Date());
      const results = await executeD1Query(
        `
        UPDATE social_delivery_attempts
        SET status = 'failed',
            last_error = ?,
            updated_at = ?,
            completed_at = ?,
            details_json = json_patch(
              COALESCE(details_json, '{}'),
              json_object('operatorReconciled', 1, 'verificationNote', ?, 'reconciledAt', ?)
            )
        WHERE platform = ?
          AND content_key = ?
          AND status IN ('planned', 'outcome_unknown')
          AND NOT EXISTS (
            SELECT 1 FROM social_posts published
            WHERE published.platform = social_delivery_attempts.platform
              AND published.content_key = social_delivery_attempts.content_key
          )
        `,
        [
          `Operator verified no public post: ${verificationNote}`,
          now,
          now,
          verificationNote,
          now,
          record.platform,
          record.contentKey,
        ],
      );
      const meta = results.find((result) => result.meta)?.meta;
      if (meta && (meta.changes ?? meta.rows_written ?? 0) === 0) {
        throw new SocialLedgerStateError(
          `No releasable unresolved delivery exists for ${record.platform}/${record.contentKey}; published evidence may already exist.`,
        );
      }
    },
  );
}

export async function listSocialPostContentKeys(platform: string, prefix: string): Promise<string[]> {
  return readLedger(
    `list social posts ${platform}/${prefix}`,
    async () => {
      const results = await executeD1Query<SocialPostKeyRow>(
        "SELECT content_key FROM social_posts WHERE platform = ? AND content_key LIKE ? ESCAPE '\\' ORDER BY posted_at DESC",
        [platform, `${escapeSqlLikeLiteral(prefix)}%`],
      );
      return (results[0]?.results || []).map((row) => row.content_key);
    },
    [],
  );
}

function escapeSqlLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Strict evidence lookup for reconciliation paths that must fail closed. */
export async function listSocialPostEvidence(
  platform: string,
  prefix: string,
): Promise<SocialPostEvidence[]> {
  if (!isOpsLedgerEnabled()) {
    if (isSocialDeliveryLedgerRequired()) {
      throw missingRequiredLedgerError(`list social post evidence ${platform}/${prefix}`);
    }
    return [];
  }

  try {
    const results = await executeD1Query<{
      platform: string;
      content_key: string;
      external_id?: string | null;
      posted_at?: string | null;
      details_json?: string | null;
    }>(
      `SELECT platform, content_key, external_id, posted_at, details_json
       FROM social_posts
       WHERE platform = ? AND content_key LIKE ? ESCAPE '\\'
       ORDER BY posted_at DESC`,
      [platform, `${escapeSqlLikeLiteral(prefix)}%`],
    );
    return (results[0]?.results || []).map((row) => {
      let details: JsonRecord | undefined;
      if (row.details_json) {
        try {
          const parsed = JSON.parse(row.details_json) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            details = parsed as JsonRecord;
          }
        } catch {
          // Malformed legacy details remain absent and therefore ambiguous.
        }
      }
      return {
        platform: row.platform,
        contentKey: row.content_key,
        externalId: row.external_id || undefined,
        postedAt: row.posted_at || undefined,
        details,
      };
    });
  } catch (error) {
    throw new SocialLedgerUnavailableError(`list social post evidence ${platform}/${prefix}`, error);
  }
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
  validateSocialPostMetricsRecord(record);
  await writeLedgerRequired(`record social post metrics ${record.platform}/${record.contentKey}`, async () => {
    await executeD1Query(
      `
      INSERT INTO social_post_metrics (
        platform, content_key, measured_at, window_hours, impressions, views, likes, replies,
        comments, reposts, shares, saves, link_clicks, profile_clicks,
        watch_time_seconds, completion_rate, details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, content_key, window_hours) WHERE window_hours IS NOT NULL DO UPDATE SET
        measured_at = excluded.measured_at,
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
      WHERE json_extract(excluded.details_json, '$.collector') = 'native-api'
         OR COALESCE(json_extract(social_post_metrics.details_json, '$.collector'), '') != 'native-api'
      ON CONFLICT(platform, content_key, measured_at) DO UPDATE SET
        window_hours = excluded.window_hours,
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
        metricValue(record.horizonHours),
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

export async function recordAiUsageEvent(record: AiUsageEventRecord): Promise<void> {
  const recordedAt = toIsoDate(new Date());
  const id = [
    recordedAt,
    workflowRunId() || `local-${process.pid}`,
    record.provider,
    Math.random().toString(36).slice(2, 10),
  ].join(":");

  await writeLedger(`record AI usage ${record.provider}/${record.model}`, async () => {
    await executeD1Query(
      `
      INSERT INTO ai_usage_events (
        id, recorded_at, workflow, content_key, operation, attempt,
        provider, model, prompt_tokens, completion_tokens, thoughts_tokens,
        cache_creation_tokens, cache_read_tokens, cost_usd, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        recordedAt,
        record.workflow || workflowName() || null,
        record.contentKey || null,
        record.operation || null,
        metricValue(record.attempt),
        record.provider,
        record.model,
        metricValue(record.promptTokens) || 0,
        metricValue(record.completionTokens) || 0,
        metricValue(record.thoughtsTokens) || 0,
        metricValue(record.cacheCreationTokens) || 0,
        metricValue(record.cacheReadTokens) || 0,
        metricValue(record.cost) || 0,
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
