import { pathToFileURL } from "url";

import { executeD1Query, hasD1Config } from "../src/lib/d1-client";
import { recordSocialPostMetrics, type SocialPostMetricsRecord } from "../src/lib/ops-ledger";
import { getSocialPublishingManifest } from "../src/lib/social-publishing-manifest";
import {
  collectNativeSocialMetrics,
  isNativeMetricsPlatformSupported,
  type NativeMetricCollectionResult,
  type NativeMetricsTarget,
} from "../src/lib/social-metrics-collectors";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

interface SocialPostRow {
  platform: string;
  content_key: string;
  external_id: string | null;
  posted_at: string;
  details_json: string | null;
}

export interface DueSocialMetricTarget extends NativeMetricsTarget {
  horizonHours: number;
  details: Record<string, unknown>;
}

export interface SocialMetricCollectionSummary {
  considered: number;
  collected: number;
  skipped: number;
  failed: number;
  rows: Array<{
    platform: string;
    contentKey: string;
    horizonHours: number;
    status: "collected" | "skipped" | "failed";
    reason?: string;
  }>;
}

interface CollectorOptions {
  windows: number[];
  limit: number;
  dryRun: boolean;
  strict: boolean;
}

interface CollectorDependencies {
  now?: Date;
  listDueTargets?: (horizonHours: number, limit: number, now: Date) => Promise<DueSocialMetricTarget[]>;
  collect?: (target: NativeMetricsTarget) => Promise<NativeMetricCollectionResult>;
  record?: (record: SocialPostMetricsRecord) => Promise<void>;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function parseCollectorOptions(args: string[]): CollectorOptions {
  const manifest = getSocialPublishingManifest();
  const windowIndex = args.indexOf("--window");
  const requestedWindow = windowIndex >= 0 ? args[windowIndex + 1] : "all";
  if (windowIndex >= 0 && (!requestedWindow || requestedWindow.startsWith("--"))) {
    throw new Error("--window requires a supported hour value or all.");
  }
  const windows = requestedWindow === "all"
    ? [...new Set(manifest.measurement.windowsHours)]
    : [parsePositiveInteger(requestedWindow, "--window")];
  for (const windowHours of windows) {
    if (!manifest.measurement.windowsHours.includes(windowHours)) {
      throw new Error(`Unsupported --window ${windowHours}. Expected ${manifest.measurement.windowsHours.join(", ")}, or all.`);
    }
  }

  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? parsePositiveInteger(args[limitIndex + 1], "--limit") : 100;
  return {
    windows,
    limit: Math.min(limit, 500),
    dryRun: args.includes("--dry-run"),
    strict: args.includes("--strict"),
  };
}

function safeDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function metricWindowDueAt(postedAt: string, horizonHours: number): Date {
  const timestamp = new Date(postedAt).getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid social post timestamp: ${postedAt}`);
  return new Date(timestamp + horizonHours * 60 * 60 * 1000);
}

export async function listDueSocialMetricTargets(
  horizonHours: number,
  limit: number,
  now = new Date(),
): Promise<DueSocialMetricTarget[]> {
  const manifest = getSocialPublishingManifest();
  const dueBefore = new Date(now.getTime() - horizonHours * 60 * 60 * 1000).toISOString();
  const postedAfter = new Date(now.getTime() - manifest.measurement.lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
  const results = await executeD1Query<SocialPostRow>(
    `
    SELECT p.platform, p.content_key, p.external_id, p.posted_at, p.details_json
    FROM social_posts p
    WHERE p.platform IN ('x', 'instagram', 'threads', 'youtube')
      AND p.external_id IS NOT NULL
      AND p.external_id != ''
      AND p.posted_at <= ?
      AND p.posted_at >= ?
      AND NOT EXISTS (
        SELECT 1
        FROM social_post_metrics m
        WHERE m.platform = p.platform
          AND m.content_key = p.content_key
          AND m.window_hours = ?
          AND (
            json_extract(m.details_json, '$.collector') = 'native-api'
            OR json_extract(m.details_json, '$.status') = 'missed-window'
          )
      )
    ORDER BY p.posted_at ASC
    LIMIT ${safeLimit}
    `,
    [dueBefore, postedAfter, horizonHours],
    { required: true },
  );

  return (results[0]?.results || []).flatMap((row) => {
    if (!row.external_id || !isNativeMetricsPlatformSupported(row.platform)) return [];
    return [{
      platform: row.platform,
      contentKey: row.content_key,
      externalId: row.external_id,
      postedAt: row.posted_at,
      horizonHours,
      details: safeDetails(row.details_json),
    }];
  });
}

export async function collectDueSocialMetrics(
  options: CollectorOptions,
  dependencies: CollectorDependencies = {},
): Promise<SocialMetricCollectionSummary> {
  const now = dependencies.now || new Date();
  const listDue = dependencies.listDueTargets || listDueSocialMetricTargets;
  const collect = dependencies.collect || ((target) => collectNativeSocialMetrics(target));
  const record = dependencies.record || recordSocialPostMetrics;
  const uniqueWindows = [...new Set(options.windows)];
  const targets = (await Promise.all(
    uniqueWindows.map((horizonHours) => listDue(horizonHours, options.limit, now)),
  )).flat();
  const summary: SocialMetricCollectionSummary = {
    considered: targets.length,
    collected: 0,
    skipped: 0,
    failed: 0,
    rows: [],
  };

  for (const target of targets) {
    try {
      const dueAt = metricWindowDueAt(target.postedAt, target.horizonHours);
      const latenessHours = (now.getTime() - dueAt.getTime()) / (60 * 60 * 1000);
      const maxLatenessHours = getSocialPublishingManifest().measurement.maxLatenessHours;
      if (latenessHours > maxLatenessHours) {
        if (!options.dryRun) {
          await record({
            platform: target.platform,
            contentKey: target.contentKey,
            measuredAt: now.toISOString(),
            horizonHours: target.horizonHours,
            details: {
              collector: "window-monitor",
              status: "missed-window",
              targetDueAt: dueAt.toISOString(),
              latenessHours: Math.round(latenessHours * 100) / 100,
              maxLatenessHours,
              externalId: target.externalId,
            },
          });
        }
        summary.skipped += 1;
        summary.rows.push({
          platform: target.platform,
          contentKey: target.contentKey,
          horizonHours: target.horizonHours,
          status: "skipped",
          reason: `missed measurement window by ${latenessHours.toFixed(2)}h`,
        });
        continue;
      }
      const result = await collect(target);
      if (result.status === "skipped") {
        summary.skipped += 1;
        summary.rows.push({
          platform: target.platform,
          contentKey: target.contentKey,
          horizonHours: target.horizonHours,
          status: "skipped",
          reason: result.reason,
        });
        continue;
      }

      if (!options.dryRun) {
        const collectedAt = now.toISOString();
        const snapshot = result.snapshot;
        await record({
          platform: target.platform,
          contentKey: target.contentKey,
          measuredAt: collectedAt,
          horizonHours: target.horizonHours,
          impressions: snapshot.impressions,
          views: snapshot.views,
          likes: snapshot.likes,
          replies: snapshot.replies,
          comments: snapshot.comments,
          reposts: snapshot.reposts,
          shares: snapshot.shares,
          saves: snapshot.saves,
          linkClicks: snapshot.linkClicks,
          profileClicks: snapshot.profileClicks,
          watchTimeSeconds: snapshot.watchTimeSeconds,
          completionRate: snapshot.completionRate,
          details: {
            source: snapshot.source,
            collector: "native-api",
            horizonHours: target.horizonHours,
            targetDueAt: dueAt.toISOString(),
            collectedAt,
            externalId: target.externalId,
            unavailableMetrics: snapshot.unavailableMetrics,
            plannedUrl: target.details.plannedUrl,
            publishedUrl: target.details.publishedUrl,
            utmContent: target.details.utmContent,
            native: snapshot.raw,
          },
        });
      }

      summary.collected += 1;
      summary.rows.push({
        platform: target.platform,
        contentKey: target.contentKey,
        horizonHours: target.horizonHours,
        status: "collected",
      });
    } catch (error) {
      summary.failed += 1;
      summary.rows.push({
        platform: target.platform,
        contentKey: target.contentKey,
        horizonHours: target.horizonHours,
        status: "failed",
        reason: formatErrorForLog(error),
      });
    }
  }
  return summary;
}

async function main(): Promise<void> {
  const options = parseCollectorOptions(process.argv.slice(2));
  if (!hasD1Config()) {
    throw new Error("Social metrics collection requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and D1_DATABASE_ID.");
  }
  const summary = await collectDueSocialMetrics(options);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0 || (options.strict && summary.skipped > 0)) process.exitCode = 1;
}

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Social metrics collection failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  });
}
