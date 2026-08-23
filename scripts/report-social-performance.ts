import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { executeD1Query, hasD1Config } from "../src/lib/d1-client";
import { getSocialPublishingManifest } from "../src/lib/social-publishing-manifest";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

const MAX_WEB_ATTRIBUTION_AGE_HOURS = 72;

export interface SocialPerformanceRow {
  platform: string;
  contentKey: string;
  externalId: string | null;
  postedAt: string;
  postDetails: Record<string, unknown>;
  metricDetails: Record<string, unknown>;
  metricSource: string;
  measuredAt: string;
  horizonHours: number;
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
  reach?: number;
  averageViewPercentage?: number;
  webSessions?: number;
  webEngagedSessions?: number;
  webAttributionExportedAt?: string;
  webAttributionStale?: boolean;
}

export interface D1PerformanceRow {
  platform: string;
  content_key: string;
  external_id: string | null;
  posted_at: string;
  post_details_json: string | null;
  measured_at: string;
  window_hours: number | null;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  replies: number | null;
  comments: number | null;
  reposts: number | null;
  shares: number | null;
  saves: number | null;
  link_clicks: number | null;
  profile_clicks: number | null;
  watch_time_seconds: number | null;
  completion_rate: number | null;
  metric_details_json: string | null;
  web_sessions: number | null;
  web_engaged_sessions: number | null;
  web_attribution_exported_at: string | null;
}

export interface SocialPerformanceGroup {
  key: string;
  posts: number;
  exposure: number;
  interactions: number;
  linkClicks?: number;
  profileClicks?: number;
  engagementPerThousand: number;
  clickThroughRate?: number;
  profileVisitRate?: number;
  averageWatchTimeSeconds?: number;
  averageViewPercentage?: number;
  webSessions?: number;
  webEngagedSessions?: number;
}

export interface SocialPerformanceReport {
  generatedAt: string;
  lookbackDays: number;
  postsMeasured: number;
  horizonHours: number;
  platformSummary: SocialPerformanceGroup[];
  archetypeSummary: SocialPerformanceGroup[];
  surfaceSummary: SocialPerformanceGroup[];
  topPosts: SocialPerformanceRow[];
  missedWindows: number;
  retentionSummary: SocialPerformanceGroup[];
  webAttribution: {
    maxAgeHours: number;
    latestExportedAt?: string;
    freshRows: number;
    staleRows: number;
  };
  recommendations: string[];
}

function optionalNumber(value: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseDetails(raw: string | null): Record<string, unknown> {
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

export function normalizePerformanceRows(
  rows: D1PerformanceRow[],
  horizonHours = 24,
  options: { nowMs?: number; maxWebAttributionAgeHours?: number } = {},
): SocialPerformanceRow[] {
  const nowMs = options.nowMs ?? Date.now();
  const maxWebAttributionAgeMs = (options.maxWebAttributionAgeHours ?? MAX_WEB_ATTRIBUTION_AGE_HOURS)
    * 60 * 60 * 1000;
  const bestByPost = new Map<string, D1PerformanceRow>();
  for (const row of rows.filter((candidate) => {
    const details = parseDetails(candidate.metric_details_json);
    return candidate.window_hours === horizonHours && details.status !== "missed-window";
  })) {
    const key = `${row.platform}\n${row.content_key}`;
    const existing = bestByPost.get(key);
    if (!existing || row.measured_at > existing.measured_at) {
      bestByPost.set(key, row);
    }
  }

  return [...bestByPost.values()].map((row) => {
    const metricDetails = parseDetails(row.metric_details_json);
    const native = metricDetails.native && typeof metricDetails.native === "object"
      ? metricDetails.native as Record<string, unknown>
      : {};
    const source = typeof metricDetails.source === "string" ? metricDetails.source : "";
    const collector = typeof metricDetails.collector === "string" ? metricDetails.collector : "";
    const webAttributionExportedAt = row.web_attribution_exported_at?.trim() || undefined;
    const webAttributionExportedMs = Date.parse(webAttributionExportedAt || "");
    const hasWebAttribution = webAttributionExportedAt !== undefined
      || row.web_sessions !== null
      || row.web_engaged_sessions !== null;
    const webAttributionFresh = Number.isFinite(webAttributionExportedMs)
      && webAttributionExportedMs <= nowMs + 5 * 60 * 1000
      && nowMs - webAttributionExportedMs <= maxWebAttributionAgeMs;
    return {
    platform: row.platform,
    contentKey: row.content_key,
    externalId: row.external_id,
    postedAt: row.posted_at,
    postDetails: parseDetails(row.post_details_json),
    metricDetails,
    metricSource: source && collector ? `${source} (${collector})` : source || collector || "unknown",
    measuredAt: row.measured_at,
    horizonHours: row.window_hours || 0,
    impressions: optionalNumber(row.impressions),
    views: optionalNumber(row.views),
    likes: optionalNumber(row.likes),
    replies: optionalNumber(row.replies),
    comments: optionalNumber(row.comments),
    reposts: optionalNumber(row.reposts),
    shares: optionalNumber(row.shares),
    saves: optionalNumber(row.saves),
    linkClicks: optionalNumber(row.link_clicks),
    profileClicks: optionalNumber(row.profile_clicks),
    watchTimeSeconds: optionalNumber(row.watch_time_seconds),
    completionRate: optionalNumber(row.completion_rate),
    reach: optionalNumber(typeof native.reach === "number" ? native.reach : null),
    averageViewPercentage: optionalNumber(
      typeof native.averageViewPercentage === "number" ? native.averageViewPercentage : null,
    ),
    webSessions: webAttributionFresh ? optionalNumber(row.web_sessions) : undefined,
    webEngagedSessions: webAttributionFresh ? optionalNumber(row.web_engaged_sessions) : undefined,
    webAttributionExportedAt,
    webAttributionStale: hasWebAttribution && !webAttributionFresh,
  };
  });
}

function exposure(row: SocialPerformanceRow): number {
  return row.impressions ?? row.reach ?? row.views ?? 0;
}

function interactions(row: SocialPerformanceRow): number {
  return [row.likes, row.replies, row.comments, row.reposts, row.shares, row.saves]
    .reduce<number>((total, value) => total + (value || 0), 0);
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stringDetail(row: SocialPerformanceRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row.postDetails[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "unknown";
}

function groupRows(rows: SocialPerformanceRow[], keyFor: (row: SocialPerformanceRow) => string): SocialPerformanceGroup[] {
  const grouped = new Map<string, SocialPerformanceRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  return [...grouped.entries()].map(([key, group]) => {
    const totalExposure = group.reduce((total, row) => total + exposure(row), 0);
    const totalInteractions = group.reduce((total, row) => total + interactions(row), 0);
    const rowsWithLinkClicks = group.filter((row) => row.linkClicks !== undefined);
    const rowsWithProfileClicks = group.filter((row) => row.profileClicks !== undefined);
    const linkClicks = rowsWithLinkClicks.length > 0
      ? rowsWithLinkClicks.reduce((total, row) => total + (row.linkClicks || 0), 0)
      : undefined;
    const profileClicks = rowsWithProfileClicks.length > 0
      ? rowsWithProfileClicks.reduce((total, row) => total + (row.profileClicks || 0), 0)
      : undefined;
    const linkExposure = rowsWithLinkClicks.reduce((total, row) => total + exposure(row), 0);
    const profileExposure = rowsWithProfileClicks.reduce((total, row) => total + exposure(row), 0);
    const watchRows = group.filter((row) => row.watchTimeSeconds !== undefined);
    const viewedRows = group.filter((row) => row.averageViewPercentage !== undefined);
    const webRows = group.filter((row) => row.webSessions !== undefined);
    return {
      key,
      posts: group.length,
      exposure: totalExposure,
      interactions: totalInteractions,
      linkClicks,
      profileClicks,
      engagementPerThousand: totalExposure ? round(totalInteractions * 1000 / totalExposure) : 0,
      clickThroughRate: linkClicks !== undefined && linkExposure ? round(linkClicks / linkExposure, 4) : undefined,
      profileVisitRate: profileClicks !== undefined && profileExposure ? round(profileClicks / profileExposure, 4) : undefined,
      webSessions: webRows.length > 0
        ? webRows.reduce((total, row) => total + (row.webSessions || 0), 0)
        : undefined,
      webEngagedSessions: webRows.length > 0
        ? webRows.reduce((total, row) => total + (row.webEngagedSessions || 0), 0)
        : undefined,
      averageWatchTimeSeconds: watchRows.length > 0
        ? round(watchRows.reduce((total, row) => total + (row.watchTimeSeconds || 0), 0) / watchRows.length, 1)
        : undefined,
      averageViewPercentage: viewedRows.length > 0
        ? round(viewedRows.reduce((total, row) => total + (row.averageViewPercentage || 0), 0) / viewedRows.length, 1)
        : undefined,
    };
  }).sort((left, right) => right.engagementPerThousand - left.engagementPerThousand || right.exposure - left.exposure);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function buildRecommendations(rows: SocialPerformanceRow[], archetypes: SocialPerformanceGroup[]): string[] {
  const recommendations: string[] = [];
  const platformMedians = new Map<string, number>();
  for (const platform of new Set(rows.map((row) => row.platform))) {
    platformMedians.set(platform, median(
      rows.filter((row) => row.platform === platform && exposure(row) > 0)
        .map((row) => interactions(row) * 1000 / exposure(row)),
    ));
  }

  for (const archetype of archetypes) {
    const platform = archetype.key.split(" / ")[0];
    const platformMedian = platformMedians.get(platform) || 0;
    if (archetype.posts < 5) {
      recommendations.push(`${archetype.key}: keep testing (${archetype.posts}/5 measured posts).`);
    } else if (archetype.engagementPerThousand > platformMedian) {
      recommendations.push(`${archetype.key}: scale cautiously; ${archetype.engagementPerThousand} interactions/1k beats the ${round(platformMedian)} platform median.`);
    } else {
      recommendations.push(`${archetype.key}: rewrite or pause; ${archetype.engagementPerThousand} interactions/1k does not beat the ${round(platformMedian)} platform median.`);
    }
  }
  return recommendations;
}

export function buildSocialPerformanceReport(
  rows: SocialPerformanceRow[],
  options: {
    generatedAt?: string;
    lookbackDays: number;
    retentionRows?: SocialPerformanceRow[];
    missedWindows?: number;
  },
): SocialPerformanceReport {
  const horizonHours = rows[0]?.horizonHours || getSocialPublishingManifest().measurement.reportingHorizonHours;
  const platformSummary = groupRows(rows, (row) => row.platform);
  const archetypeSummary = groupRows(rows, (row) =>
    `${row.platform} / ${stringDetail(row, "archetypeKey")}`,
  );
  const surfaceSummary = groupRows(rows, (row) =>
    `${row.platform} / ${stringDetail(row, "variantSurface", "surface")}`,
  );
  const topPosts = [...rows]
    .filter((row) => exposure(row) > 0)
    .sort((left, right) => {
      const leftRate = interactions(left) * 1000 / exposure(left);
      const rightRate = interactions(right) * 1000 / exposure(right);
      return rightRate - leftRate || exposure(right) - exposure(left);
    })
    .slice(0, 10);
  const attributionTimestamps = rows
    .map((row) => row.webAttributionExportedAt)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    lookbackDays: options.lookbackDays,
    postsMeasured: rows.length,
    horizonHours,
    platformSummary,
    archetypeSummary,
    surfaceSummary,
    topPosts,
    missedWindows: options.missedWindows || 0,
    retentionSummary: groupRows(options.retentionRows || [], (row) => row.platform),
    webAttribution: {
      maxAgeHours: MAX_WEB_ATTRIBUTION_AGE_HOURS,
      latestExportedAt: attributionTimestamps.sort().at(-1),
      freshRows: rows.filter((row) => row.webAttributionExportedAt && !row.webAttributionStale).length,
      staleRows: rows.filter((row) => row.webAttributionStale).length,
    },
    recommendations: buildRecommendations(rows, archetypeSummary),
  };
}

function percent(value: number | undefined): string {
  return value === undefined ? "N/A" : `${round(value * 100, 1)}%`;
}

function renderGroups(title: string, groups: SocialPerformanceGroup[]): string[] {
  return [
    `## ${title}`,
    "",
    "| Segment | Posts | Impressions/views | Interactions/1k | Link CTR | Profile visit rate | GA4 sessions / engaged |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...(groups.length > 0
      ? groups.map((group) =>
          `| ${group.key} | ${group.posts} | ${group.exposure} | ${group.engagementPerThousand} | ${percent(group.clickThroughRate)} | ${percent(group.profileVisitRate)} | ${group.webSessions === undefined ? "N/A" : `${group.webSessions} / ${group.webEngagedSessions || 0}`} |`)
      : ["| No measured posts | 0 | 0 | 0 | N/A | N/A | N/A |"]),
    "",
  ];
}

export function renderSocialPerformanceMarkdown(report: SocialPerformanceReport): string {
  const lines = [
    "# Weekly Social Performance",
    "",
    `Generated: ${report.generatedAt}`,
    `Lookback: ${report.lookbackDays} days`,
    `Measured posts: ${report.postsMeasured}`,
    `Missed collection windows (excluded from decisions): ${report.missedWindows}`,
    `Comparison horizon: +${report.horizonHours}h`,
    report.webAttribution.latestExportedAt
      ? `GA4 attribution freshness: latest export ${report.webAttribution.latestExportedAt}; ${report.webAttribution.freshRows} fresh matched rows; ${report.webAttribution.staleRows} stale matched rows excluded (max age ${report.webAttribution.maxAgeHours}h).`
      : `GA4 attribution freshness: unavailable; no dated attribution export was joined.`,
    "",
    ...renderGroups("Platform Summary", report.platformSummary),
    ...renderGroups("Archetype Summary", report.archetypeSummary),
    ...renderGroups("Surface Summary", report.surfaceSummary),
    "## Retention sample collected at +168h",
    "",
    "YouTube Analytics values cover only complete Pacific-time calendar days available at collection; the exact start/end range is retained in metric provenance and is not presented as a full seven-day window.",
    "",
    "| Platform | Posts | Avg total watch time/post | Avg viewed |",
    "|---|---:|---:|---:|",
    ...(report.retentionSummary.length > 0
      ? report.retentionSummary.map((group) =>
          `| ${group.key} | ${group.posts} | ${group.averageWatchTimeSeconds === undefined ? "N/A" : `${group.averageWatchTimeSeconds}s`} | ${group.averageViewPercentage === undefined ? "N/A" : `${group.averageViewPercentage}%`} |`)
      : ["| No retention aggregates | 0 | N/A | N/A |"]),
    "",
    "## Top Posts by Normalized Engagement",
    "",
    ...(report.topPosts.length > 0
      ? report.topPosts.map((row) => {
          const rate = exposure(row) ? round(interactions(row) * 1000 / exposure(row)) : 0;
          const publishedUrl = stringDetail(row, "publishedUrl");
          return `- ${row.platform} / ${row.contentKey}: ${rate} interactions/1k at +${row.horizonHours}h [${row.metricSource}]${publishedUrl !== "unknown" ? ` — ${publishedUrl}` : ""}`;
        })
      : ["- No posts have native metric snapshots in the selected window."]),
    "",
    "## Decisions",
    "",
    ...(report.recommendations.length > 0 ? report.recommendations.map((item) => `- ${item}`) : ["- Collect at least five posts per archetype before scaling or pausing it."]),
    "",
  ];
  return lines.join("\n");
}

export async function readPerformanceRows(lookbackDays: number, horizonHours: number): Promise<SocialPerformanceRow[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const results = await executeD1Query<D1PerformanceRow>(
    `
    SELECT
      p.platform, p.content_key, p.external_id, p.posted_at,
      p.details_json AS post_details_json,
      m.measured_at, m.window_hours, m.impressions, m.views, m.likes,
      m.replies, m.comments, m.reposts, m.shares, m.saves, m.link_clicks,
      m.profile_clicks, m.watch_time_seconds, m.completion_rate,
      m.details_json AS metric_details_json,
      attribution.sessions AS web_sessions,
      attribution.engaged_sessions AS web_engaged_sessions,
      attribution.exported_at AS web_attribution_exported_at
    FROM social_posts p
    JOIN social_post_metrics m
      ON m.platform = p.platform AND m.content_key = p.content_key
    LEFT JOIN social_attribution_metrics attribution
      ON attribution.utm_content = json_extract(p.details_json, '$.utmContent')
      AND attribution.window_days = 28
      AND attribution.exported_at = (
        SELECT MAX(latest.exported_at)
        FROM social_attribution_metrics latest
        WHERE latest.utm_content = attribution.utm_content
          AND latest.window_days = attribution.window_days
      )
    WHERE p.posted_at >= ?
      AND m.window_hours = ?
      AND COALESCE(json_extract(m.details_json, '$.status'), '') != 'missed-window'
    ORDER BY p.posted_at DESC, m.window_hours DESC, m.measured_at DESC
    `,
    [since, horizonHours],
    { required: true },
  );
  return normalizePerformanceRows(
    results[0]?.results || [],
    horizonHours,
  );
}

async function readMissedWindowCount(lookbackDays: number): Promise<number> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const results = await executeD1Query<{ missed: number | string }>(
    `SELECT COUNT(*) AS missed
     FROM social_post_metrics
     WHERE measured_at >= ? AND json_extract(details_json, '$.status') = 'missed-window'`,
    [since],
    { required: true },
  );
  return Number(results[0]?.results?.[0]?.missed || 0);
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

async function main(): Promise<void> {
  if (!hasD1Config()) throw new Error("Social reporting requires D1 configuration.");
  const manifest = getSocialPublishingManifest();
  const rawDays = argValue(process.argv, "--days");
  const lookbackDays = rawDays ? Number(rawDays) : manifest.measurement.lookbackDays;
  if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) throw new Error("--days must be a positive integer.");
  const [rows, retentionRows, missedWindows] = await Promise.all([
    readPerformanceRows(lookbackDays, manifest.measurement.reportingHorizonHours),
    readPerformanceRows(lookbackDays, 168),
    readMissedWindowCount(lookbackDays),
  ]);
  const report = buildSocialPerformanceReport(rows, { lookbackDays, retentionRows, missedWindows });
  const output = process.argv.includes("--json")
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderSocialPerformanceMarkdown(report);
  const outputPath = argValue(process.argv, "--output");
  if (outputPath) {
    const resolved = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, output);
    console.log(`Wrote social performance report to ${path.relative(process.cwd(), resolved)}.`);
  } else {
    process.stdout.write(output);
  }
}

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Social performance report failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  });
}
