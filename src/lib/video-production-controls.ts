import { SOCIAL_PLATFORM_LIMITS } from "./config";
import { CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS } from "./market-data-quality";

export type VideoPlatform = "telegram" | "x" | "youtube" | "instagram" | "threads" | "tiktok";

export type VideoPublishStatus =
  | "not_started"
  | "rendered"
  | "staged_to_r2"
  | "uploaded"
  | "processing"
  | "published"
  | "manual_handoff_sent"
  | "manual_published"
  | "outcome_unknown"
  | "failed"
  | "skipped_by_missing_credentials"
  | "skipped_by_platform_quota";

export type VideoTerminalPublishStatus = Extract<
  VideoPublishStatus,
  "published" | "manual_handoff_sent" | "manual_published" | "outcome_unknown"
>;

export type VideoMarketFreshnessIssue =
  | "missing-market"
  | "empty-market"
  | "invalid-market-value"
  | "missing-market-timestamp"
  | "future-market-timestamp"
  | "stale-market-data"
  | "missing-derived-metrics"
  | "missing-derived-metrics-timestamp"
  | "stale-derived-metrics";

export interface VideoMarketFreshnessInput {
  token: {
    id?: unknown;
    market?: {
      price?: unknown;
      priceChange24h?: unknown;
      marketCap?: unknown;
      marketCapRank?: unknown;
      volume24h?: unknown;
    } | null;
    fetchedAt?: unknown;
    lastMarketUpdate?: unknown;
  };
  metric?: {
    computedAt?: unknown;
    marketDataAsOf?: unknown;
    priceHistoryAsOf?: unknown;
    categoryDataAsOf?: unknown;
    inputDataAsOf?: unknown;
  } | null;
  now?: Date;
  marketDataMaxAgeMinutes?: number;
  derivedMetricsMaxAgeHours?: number;
  /** False only for the intentional token-market first pass. */
  requireDerivedMetrics?: boolean;
}

export interface VideoMarketFreshnessResult {
  ok: boolean;
  asOf: string | null;
  metricAsOf: string | null;
  issues: VideoMarketFreshnessIssue[];
}

export type VideoMarketFreshnessIssueCounts = Partial<Record<VideoMarketFreshnessIssue, number>>;

export interface PlatformCopyPackage {
  platform: VideoPlatform;
  title?: string;
  description?: string;
  caption?: string;
  topicTag?: string;
  privacyLevel?: string;
}

export interface PlatformCopyValidationResult {
  ok: boolean;
  issues: string[];
}

export interface PublishErrorClassification {
  status: Extract<VideoPublishStatus, "failed" | "skipped_by_missing_credentials" | "skipped_by_platform_quota">;
  retryable: boolean;
  failureClass: "missing_credentials" | "platform_quota" | "processing_failed" | "publish_failed";
  diagnostic: string;
}

export interface PlatformTrackerEvidence {
  status?: VideoPublishStatus;
  messageId?: number;
  tweetId?: string;
  replyId?: string;
  videoId?: string;
  postId?: string;
  publishId?: string;
  reportVideoMessageId?: number;
  reportSummaryMessageId?: number;
  manualPublishedAt?: string;
  tiktokUrl?: string;
}

export interface ReconcilePlatformStateOptions {
  platform: VideoPlatform;
  d1HasPublishedState: boolean;
  tracker?: PlatformTrackerEvidence | null;
  force?: boolean;
}

export interface ReconcilePlatformStateResult {
  shouldPublish: boolean;
  shouldBackfillD1: boolean;
  reason:
    | "force-mode"
    | "d1-terminal-state"
    | "tracker-terminal-with-evidence"
    | "tracker-outcome-unknown"
    | "tracker-non-terminal"
    | "no-terminal-state";
}

export interface VideoIdempotencyKeyOptions {
  date: string;
  format: string;
  tokenId: string;
  platform: VideoPlatform;
  forceId?: string;
}

export interface GeneratedFallbackAssetIdOptions {
  date: string;
  platform: VideoPlatform;
  tokenId: string;
  formatKey: string;
  recipeKey: string;
}

type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface VideoProductionAlertOptions {
  failureClass:
    | "stateLockConflict"
    | "d1Unavailable"
    | "allPlatformsBlocked"
    | "secretLeakageSuspected"
    | "marketDataStale"
    | "renderFailed"
    | "allPublishAttemptsFailed"
    | "tiktokPackageFailed"
    | "platformPublishFailed"
    | "providerQuotaExhausted"
    | "r2StorageWarning"
    | "generatedOnlyFallback"
    | "noNewAssets";
  workflowRunId?: string;
  videoDate: string;
  format: string;
  platform?: VideoPlatform;
}

export interface VideoProductionAlert {
  severity: AlertSeverity;
  message: string;
  nextRunbookAction: string;
  workflowRunId?: string;
  videoDate: string;
  format: string;
  platform?: VideoPlatform;
}

const DEFAULT_MARKET_DATA_MAX_AGE_MINUTES = 45;
const DEFAULT_DERIVED_METRICS_MAX_AGE_HOURS = 36;
const VALID_TIKTOK_PRIVACY_LEVELS = new Set([
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
]);
const TERMINAL_STATUSES = new Set<VideoPublishStatus>([
  "published",
  "manual_handoff_sent",
  "manual_published",
  "outcome_unknown",
]);

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function hasRiskDisclaimer(text: string | undefined): boolean {
  const normalized = (text || "").toLowerCase();
  return (
    normalized.includes("not financial advice") ||
    normalized.includes("research signal") ||
    normalized.includes("confirm liquidity")
  );
}

function countHashtags(text: string | undefined): number {
  return (text || "").match(/#[a-z0-9_]+/gi)?.length || 0;
}

function getTrackerEvidenceId(
  platform: VideoPlatform,
  tracker: PlatformTrackerEvidence | null | undefined,
): string | number | undefined {
  if (platform === "tiktok" && tracker?.status !== "published" && tracker?.status !== "manual_published") {
    return undefined;
  }
  return tracker?.messageId ??
    tracker?.tweetId ??
    tracker?.replyId ??
    tracker?.videoId ??
    tracker?.postId ??
    tracker?.publishId ??
    tracker?.reportVideoMessageId ??
    tracker?.reportSummaryMessageId ??
    tracker?.tiktokUrl;
}

function sanitizeDiagnostic(input: string): string {
  return input
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|secret)=\S+/gi, "$1=[redacted]")
    .slice(0, 600);
}

export function validateVideoMarketDataFreshness(
  options: VideoMarketFreshnessInput,
): VideoMarketFreshnessResult {
  const now = options.now || new Date();
  const marketDataMaxAgeMs = (options.marketDataMaxAgeMinutes ?? DEFAULT_MARKET_DATA_MAX_AGE_MINUTES) * 60 * 1000;
  const derivedMetricsMaxAgeMs = (options.derivedMetricsMaxAgeHours ?? DEFAULT_DERIVED_METRICS_MAX_AGE_HOURS) *
    60 *
    60 *
    1000;
  const issues: VideoMarketFreshnessIssue[] = [];
  const market = options.token.market;

  if (!market || typeof market !== "object") {
    return {
      ok: false,
      asOf: null,
      metricAsOf: null,
      issues: ["missing-market"],
    };
  }

  const price = finiteNumber(market.price);
  const priceChange24h = finiteNumber(market.priceChange24h);
  const marketCap = finiteNumber(market.marketCap);
  const volume24h = finiteNumber(market.volume24h);

  if (
    (market.price !== undefined && price === null) ||
    (market.priceChange24h !== undefined && priceChange24h === null) ||
    (market.marketCap !== undefined && marketCap === null) ||
    (market.volume24h !== undefined && volume24h === null)
  ) {
    issues.push("invalid-market-value");
  }

  if ((price ?? 0) <= 0 && (marketCap ?? 0) <= 0 && (volume24h ?? 0) <= 0) {
    issues.push("empty-market");
  }

  const asOf = parseTimestamp(options.token.lastMarketUpdate) || parseTimestamp(options.token.fetchedAt);
  if (!asOf) {
    issues.push("missing-market-timestamp");
  } else {
    const marketAgeMs = now.getTime() - Date.parse(asOf);
    if (marketAgeMs < -60_000) issues.push("future-market-timestamp");
    if (marketAgeMs > marketDataMaxAgeMs) issues.push("stale-market-data");
  }

  let metricAsOf: string | null = null;
  if (!options.metric) {
    if (options.requireDerivedMetrics !== false) issues.push("missing-derived-metrics");
  } else {
    const metricComputedAt = parseTimestamp(options.metric.computedAt);
    metricAsOf = parseTimestamp(options.metric.marketDataAsOf);
    const priceHistoryAsOf = parseTimestamp(options.metric.priceHistoryAsOf);
    const categoryDataAsOf = parseTimestamp(options.metric.categoryDataAsOf);
    const inputDataAsOf = parseTimestamp(options.metric.inputDataAsOf);
    if (!metricComputedAt || !metricAsOf || !priceHistoryAsOf || !categoryDataAsOf || !inputDataAsOf) {
      issues.push("missing-derived-metrics-timestamp");
    } else {
      const computedAgeMs = now.getTime() - Date.parse(metricComputedAt);
      const inputAgeMs = now.getTime() - Date.parse(metricAsOf);
      const priceHistoryAgeMs = now.getTime() - Date.parse(priceHistoryAsOf);
      const categoryInputAgeMs = now.getTime() - Date.parse(categoryDataAsOf);
      const oldestExpectedMs = Math.min(
        Date.parse(metricAsOf),
        Date.parse(priceHistoryAsOf),
        Date.parse(categoryDataAsOf),
      );
      if (
        computedAgeMs < -60_000 ||
        inputAgeMs < -60_000 ||
        priceHistoryAgeMs < -60_000 ||
        categoryInputAgeMs < -60_000 ||
        computedAgeMs > derivedMetricsMaxAgeMs ||
        inputAgeMs > derivedMetricsMaxAgeMs ||
        priceHistoryAgeMs > 8 * 24 * 60 * 60 * 1000 ||
        categoryInputAgeMs >= CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS ||
        Date.parse(inputDataAsOf) !== oldestExpectedMs
      ) {
        issues.push("stale-derived-metrics");
      }
      if (asOf
        && Math.abs(Date.parse(metricAsOf) - Date.parse(asOf)) > 30 * 60 * 1000
        && !issues.includes("stale-derived-metrics")) {
        issues.push("stale-derived-metrics");
      }
    }
  }

  return {
    ok: issues.length === 0,
    asOf,
    metricAsOf,
    issues,
  };
}

export function filterVideoCandidatesByFreshness<T extends VideoMarketFreshnessInput["token"]>(
  candidates: T[],
  options: Omit<VideoMarketFreshnessInput, "token"> = {},
): T[] {
  return candidates.filter((token) => validateVideoMarketDataFreshness({
    ...options,
    token,
    requireDerivedMetrics: options.requireDerivedMetrics ?? false,
  }).ok);
}

export function formatVideoMarketFreshnessIssueCounts(issueCounts: VideoMarketFreshnessIssueCounts): string {
  const parts = Object.entries(issueCounts)
    .filter(([, count]) => Number(count) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([issue, count]) => `${issue}=${count}`);
  return parts.length ? parts.join(", ") : "none";
}

export function shouldRefreshDerivedMetricsForVideo(
  issueCounts: VideoMarketFreshnessIssueCounts,
  checkedCandidates: number,
): boolean {
  if (checkedCandidates <= 0) return false;
  const nonZeroIssues = Object.entries(issueCounts).filter(([, count]) => Number(count) > 0);
  const refreshableIssues = new Set<VideoMarketFreshnessIssue>([
    "missing-derived-metrics",
    "missing-derived-metrics-timestamp",
    "stale-derived-metrics",
  ]);
  return nonZeroIssues.length > 0
    && nonZeroIssues.every(([issue]) => refreshableIssues.has(issue as VideoMarketFreshnessIssue))
    && nonZeroIssues.reduce((total, [, count]) => total + Number(count), 0) >= checkedCandidates;
}

export function validatePlatformCopyPackage(input: PlatformCopyPackage): PlatformCopyValidationResult {
  const issues: string[] = [];
  const caption = input.caption || "";

  if (input.platform === "youtube") {
    if (!input.title?.trim()) issues.push("youtube-title-missing");
    if ((input.title || "").length > 60) issues.push("youtube-title-too-long");
    if (!input.description?.trim()) issues.push("youtube-description-missing");
    if ((input.description || "").length > 5_000) issues.push("youtube-description-too-long");
    if (!hasRiskDisclaimer(input.description)) issues.push("missing-risk-disclaimer");
  }

  if (input.platform === "instagram") {
    if (!caption.trim()) issues.push("caption-missing");
    if (caption.length > SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT) issues.push("caption-too-long");
    if (countHashtags(caption) > SOCIAL_PLATFORM_LIMITS.INSTAGRAM.HASHTAG_LIMIT) issues.push("instagram-too-many-hashtags");
  }

  if (input.platform === "threads") {
    if (!caption.trim()) issues.push("caption-missing");
    if (caption.length > SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT) issues.push("caption-too-long");
    if (input.topicTag && !/^[A-Za-z0-9_]{1,50}$/.test(input.topicTag)) issues.push("threads-topic-invalid");
  }

  if (input.platform === "tiktok") {
    if (!caption.trim()) issues.push("caption-missing");
    if (caption.length > SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT) issues.push("caption-too-long");
    if (input.privacyLevel !== undefined && !VALID_TIKTOK_PRIVACY_LEVELS.has(input.privacyLevel)) {
      issues.push("tiktok-privacy-invalid");
    }
    if (!hasRiskDisclaimer(caption)) issues.push("missing-risk-disclaimer");
  }

  if (input.platform === "telegram") {
    if (!caption.trim()) issues.push("caption-missing");
    if (caption.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT) issues.push("caption-too-long");
  }

  if (input.platform === "x") {
    if (!caption.trim()) issues.push("caption-missing");
    if (caption.length > SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT) issues.push("caption-too-long");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function classifyVideoPublishError(error: unknown): PublishErrorClassification {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const diagnostic = sanitizeDiagnostic(raw);

  if (lower.includes("missing") && (lower.includes("credential") || lower.includes("token"))) {
    return {
      status: "skipped_by_missing_credentials",
      retryable: false,
      failureClass: "missing_credentials",
      diagnostic,
    };
  }

  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("too many requests")
  ) {
    return {
      status: "skipped_by_platform_quota",
      retryable: true,
      failureClass: "platform_quota",
      diagnostic,
    };
  }

  if (lower.includes("processing_failed") || lower.includes("processing failed") || lower.includes("container")) {
    return {
      status: "failed",
      retryable: false,
      failureClass: "processing_failed",
      diagnostic,
    };
  }

  return {
    status: "failed",
    retryable: true,
    failureClass: "publish_failed",
    diagnostic,
  };
}

export function buildVideoIdempotencyKey(options: VideoIdempotencyKeyOptions): string {
  return [
    options.date,
    options.format,
    options.tokenId,
    options.platform,
    options.forceId ? `force-${options.forceId}` : "normal",
  ].join(":");
}

export function buildGeneratedFallbackAssetId(options: GeneratedFallbackAssetIdOptions): string {
  return [
    "generated-stage",
    options.date,
    options.platform,
    options.tokenId,
    options.formatKey,
    options.recipeKey,
  ].join(":");
}

export function reconcilePlatformPublishState(
  options: ReconcilePlatformStateOptions,
): ReconcilePlatformStateResult {
  if (options.force) {
    return { shouldPublish: true, shouldBackfillD1: false, reason: "force-mode" };
  }

  if (options.d1HasPublishedState) {
    return { shouldPublish: false, shouldBackfillD1: false, reason: "d1-terminal-state" };
  }

  const tracker = options.tracker;
  if (!tracker) {
    return { shouldPublish: true, shouldBackfillD1: false, reason: "no-terminal-state" };
  }

  if (
    options.platform === "tiktok"
    && !tracker.status
    && typeof tracker.tiktokUrl === "string"
    && tracker.tiktokUrl.trim()
  ) {
    return {
      shouldPublish: false,
      shouldBackfillD1: false,
      reason: "tracker-outcome-unknown",
    };
  }

  const evidenceId = getTrackerEvidenceId(options.platform, tracker);
  const status = tracker.status || (evidenceId ? "published" : "not_started");

  if (status === "outcome_unknown") {
    return {
      shouldPublish: false,
      shouldBackfillD1: false,
      reason: "tracker-outcome-unknown",
    };
  }

  if (TERMINAL_STATUSES.has(status) && evidenceId) {
    return {
      shouldPublish: false,
      shouldBackfillD1: true,
      reason: "tracker-terminal-with-evidence",
    };
  }

  return { shouldPublish: true, shouldBackfillD1: false, reason: "tracker-non-terminal" };
}

export function isTerminalVideoPublishStatus(status: VideoPublishStatus | undefined): status is VideoTerminalPublishStatus {
  return Boolean(status && TERMINAL_STATUSES.has(status));
}

export function buildVideoProductionAlert(options: VideoProductionAlertOptions): VideoProductionAlert {
  const severityByFailure: Record<VideoProductionAlertOptions["failureClass"], AlertSeverity> = {
    stateLockConflict: "critical",
    d1Unavailable: "critical",
    allPlatformsBlocked: "critical",
    secretLeakageSuspected: "critical",
    marketDataStale: "high",
    renderFailed: "high",
    allPublishAttemptsFailed: "high",
    tiktokPackageFailed: "high",
    platformPublishFailed: "medium",
    providerQuotaExhausted: "medium",
    r2StorageWarning: "medium",
    generatedOnlyFallback: "medium",
    noNewAssets: "low",
  };
  const runbookByFailure: Record<VideoProductionAlertOptions["failureClass"], string> = {
    stateLockConflict: "Inspect the active workflow lock and wait for or cancel the older run before retrying.",
    d1Unavailable: "Check D1 availability and retry only after publish-state reconciliation can run.",
    allPlatformsBlocked: "Inspect platform credentials and account status before rerunning the video workflow.",
    secretLeakageSuspected: "Rotate the affected secret and inspect logs before rerunning automation.",
    marketDataStale: "Inspect the metrics job, rerun metrics generation if appropriate, then rerun video posting without force mode.",
    renderFailed: "Check selected assets, audio availability, and Remotion logs; retry with the same persisted creative after fixing the cause.",
    allPublishAttemptsFailed: "Review every platform error class and rerun only after the common blocker is fixed.",
    tiktokPackageFailed: "Check Telegram reporting credentials and retry the TikTok handoff without regenerating creative.",
    platformPublishFailed: "Check platform error class, retry only the failed platform if retryable, and preserve successful platform states.",
    providerQuotaExhausted: "Keep posting from the existing R2 library and retry asset refresh later.",
    r2StorageWarning: "Run pruning before the next asset refresh uploads new clips.",
    generatedOnlyFallback: "Inspect R2 b-roll hydration and asset manifest health before the next run.",
    noNewAssets: "Treat the refresh as a no-op unless the library is below the minimum target.",
  };

  const severity = severityByFailure[options.failureClass];
  const scope = [options.videoDate, options.format, options.platform].filter(Boolean).join("/");

  return {
    severity,
    message: `[${severity}] ${options.failureClass} during video production (${scope})`,
    nextRunbookAction: runbookByFailure[options.failureClass],
    workflowRunId: options.workflowRunId,
    videoDate: options.videoDate,
    format: options.format,
    platform: options.platform,
  };
}
