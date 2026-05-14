import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const DEFAULT_BASELINE_DIR = path.resolve(process.cwd(), "data/analytics");
const EXPECTED_ENGAGEMENT_EVENTS = [
  "recirculation_impression",
  "recirculation_click",
  "article_depth",
  "content_complete",
  "toc_interaction",
  "calculator_interaction",
  "directory_filter",
  "next_action_click",
];

interface FlatRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

interface BaselineRange {
  days: number;
  startDate: string;
  endDate: string;
  ga4: {
    landingPages: FlatRow[];
    trackedEvents: FlatRow[];
  };
  gsc: {
    pagesQueriesDevices: FlatRow[];
  };
}

export interface BaselineExport {
  exportedAt: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  ranges: BaselineRange[];
}

export interface EngagementMetricSummary {
  sessions: number;
  engagedSessions: number;
  screenPageViews: number;
  userEngagementDuration: number;
  eventCount: number;
  engagementRate: number;
  viewsPerSession: number;
  averageEngagementSecondsPerSession: number;
}

export interface EngagementGroupSummary extends EngagementMetricSummary {
  key: string;
}

export interface SearchMetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
}

export interface SearchGroupSummary extends SearchMetricSummary {
  key: string;
}

export interface EventSummary {
  eventName: string;
  eventCount: number;
  totalUsers: number;
}

export interface RangeSummary {
  days: number;
  startDate: string;
  endDate: string;
  ga4: EngagementMetricSummary;
  gsc: SearchMetricSummary;
  topChannels: EngagementGroupSummary[];
  topDevices: EngagementGroupSummary[];
  topPages: EngagementGroupSummary[];
  weakLandingPages: EngagementGroupSummary[];
  weakMobileSocialLandingPages: EngagementGroupSummary[];
  searchOpportunities: SearchGroupSummary[];
  trackedEvents: EventSummary[];
  missingEngagementEvents: string[];
}

export interface EngagementBaselineSummary {
  exportedAt: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  ranges: RangeSummary[];
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumEngagementRows(rows: FlatRow[]): EngagementMetricSummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.sessions += row.metrics.sessions || 0;
      acc.engagedSessions += row.metrics.engagedSessions || 0;
      acc.screenPageViews += row.metrics.screenPageViews || 0;
      acc.userEngagementDuration += row.metrics.userEngagementDuration || 0;
      acc.eventCount += row.metrics.eventCount || 0;
      return acc;
    },
    {
      sessions: 0,
      engagedSessions: 0,
      screenPageViews: 0,
      userEngagementDuration: 0,
      eventCount: 0,
      engagementRate: 0,
      viewsPerSession: 0,
      averageEngagementSecondsPerSession: 0,
    },
  );

  return {
    ...totals,
    engagementRate: totals.sessions ? round(totals.engagedSessions / totals.sessions, 4) : 0,
    viewsPerSession: totals.sessions ? round(totals.screenPageViews / totals.sessions, 2) : 0,
    averageEngagementSecondsPerSession: totals.sessions
      ? round(totals.userEngagementDuration / totals.sessions, 1)
      : 0,
  };
}

export function normalizePagePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(not set)") return trimmed || "(not set)";

  try {
    const url = new URL(trimmed, "https://tokenradar.co");
    const pathname = url.pathname || "/";
    return pathname.length > 1 ? pathname.replace(/\/$/g, "") : pathname;
  } catch {
    const withoutQuery = trimmed.split(/[?#]/)[0] || trimmed;
    return withoutQuery.length > 1 ? withoutQuery.replace(/\/$/g, "") : withoutQuery;
  }
}

function groupEngagementRows(rows: FlatRow[], keyForRow: (row: FlatRow) => string): EngagementGroupSummary[] {
  const grouped = new Map<string, FlatRow[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  return Array.from(grouped.entries())
    .map(([key, groupRows]) => ({ key, ...sumEngagementRows(groupRows) }))
    .sort((a, b) => b.sessions - a.sessions || b.screenPageViews - a.screenPageViews);
}

function summarizeSearchRows(rows: FlatRow[]): SearchMetricSummary {
  const totals = rows.reduce(
    (acc, row) => {
      const impressions = row.metrics.impressions || 0;
      acc.clicks += row.metrics.clicks || 0;
      acc.impressions += impressions;
      acc.positionWeight += (row.metrics.position || 0) * impressions;
      return acc;
    },
    { clicks: 0, impressions: 0, positionWeight: 0 },
  );

  return {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions ? round(totals.clicks / totals.impressions, 4) : 0,
    averagePosition: totals.impressions ? round(totals.positionWeight / totals.impressions, 1) : 0,
  };
}

function groupSearchRows(rows: FlatRow[], keyForRow: (row: FlatRow) => string): SearchGroupSummary[] {
  const grouped = new Map<string, FlatRow[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  return Array.from(grouped.entries())
    .map(([key, groupRows]) => ({ key, ...summarizeSearchRows(groupRows) }))
    .sort((a, b) => b.impressions - a.impressions || a.averagePosition - b.averagePosition);
}

function summarizeTrackedEvents(rows: FlatRow[]): EventSummary[] {
  const grouped = new Map<string, EventSummary>();

  for (const row of rows) {
    const eventName = row.dimensions.eventName || "(not set)";
    const existing = grouped.get(eventName) || { eventName, eventCount: 0, totalUsers: 0 };
    existing.eventCount += row.metrics.eventCount || 0;
    existing.totalUsers += row.metrics.totalUsers || 0;
    grouped.set(eventName, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.eventCount - a.eventCount);
}

function getWeakLandingPages(pageGroups: EngagementGroupSummary[]): EngagementGroupSummary[] {
  return pageGroups
    .filter((page) => page.key !== "(not set)")
    .filter((page) => page.sessions >= 3)
    .filter(
      (page) =>
        page.engagementRate < 0.25 ||
        page.viewsPerSession < 1.35 ||
        page.averageEngagementSecondsPerSession < 20,
    )
    .sort((a, b) => b.sessions - a.sessions || a.engagementRate - b.engagementRate)
    .slice(0, 8);
}

function getSearchOpportunities(pageGroups: SearchGroupSummary[]): SearchGroupSummary[] {
  return pageGroups
    .filter((page) => page.clicks === 0)
    .filter((page) => page.impressions >= 3)
    .sort((a, b) => {
      const scoreA = a.impressions / Math.max(a.averagePosition, 1);
      const scoreB = b.impressions / Math.max(b.averagePosition, 1);
      return scoreB - scoreA;
    })
    .slice(0, 8);
}

export function summarizeBaselineExport(baseline: BaselineExport): EngagementBaselineSummary {
  return {
    exportedAt: baseline.exportedAt,
    ga4PropertyId: baseline.ga4PropertyId,
    gscSiteUrl: baseline.gscSiteUrl,
    ranges: baseline.ranges.map((range) => {
      const pageGroups = groupEngagementRows(range.ga4.landingPages, (row) =>
        normalizePagePath(row.dimensions.landingPagePlusQueryString || "(not set)"),
      );
      const mobileSocialPageGroups = groupEngagementRows(
        range.ga4.landingPages.filter(
          (row) =>
            row.dimensions.deviceCategory === "mobile" &&
            row.dimensions.sessionDefaultChannelGroup === "Organic Social",
        ),
        (row) => normalizePagePath(row.dimensions.landingPagePlusQueryString || "(not set)"),
      );
      const searchPageGroups = groupSearchRows(range.gsc.pagesQueriesDevices, (row) =>
        normalizePagePath(row.dimensions.page || "(not set)"),
      );
      const trackedEvents = summarizeTrackedEvents(range.ga4.trackedEvents);
      const eventNames = new Set(trackedEvents.map((event) => event.eventName));

      return {
        days: range.days,
        startDate: range.startDate,
        endDate: range.endDate,
        ga4: sumEngagementRows(range.ga4.landingPages),
        gsc: summarizeSearchRows(range.gsc.pagesQueriesDevices),
        topChannels: groupEngagementRows(range.ga4.landingPages, (row) =>
          row.dimensions.sessionDefaultChannelGroup || "(not set)",
        ).slice(0, 6),
        topDevices: groupEngagementRows(range.ga4.landingPages, (row) =>
          row.dimensions.deviceCategory || "(not set)",
        ).slice(0, 4),
        topPages: pageGroups.slice(0, 10),
        weakLandingPages: getWeakLandingPages(pageGroups),
        weakMobileSocialLandingPages: getWeakLandingPages(mobileSocialPageGroups),
        searchOpportunities: getSearchOpportunities(searchPageGroups),
        trackedEvents: trackedEvents.slice(0, 10),
        missingEngagementEvents: EXPECTED_ENGAGEMENT_EVENTS.filter((eventName) => !eventNames.has(eventName)),
      };
    }),
  };
}

export function findLatestBaselineExport(dir = DEFAULT_BASELINE_DIR): string | null {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((file) => /^engagement-baseline-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return files[0] || null;
}

function formatPercent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

function formatDuration(seconds: number): string {
  return `${round(seconds, 1)}s`;
}

function formatEngagement(group: EngagementGroupSummary): string {
  return `${group.key}: ${group.sessions} sessions, ${formatPercent(group.engagementRate)}, ${group.viewsPerSession} views/session, ${formatDuration(group.averageEngagementSecondsPerSession)}`;
}

function formatSearch(group: SearchGroupSummary): string {
  return `${group.key}: ${group.impressions} impressions, ${group.clicks} clicks, avg position ${group.averagePosition}`;
}

export function renderSummaryMarkdown(summary: EngagementBaselineSummary, sourcePath?: string): string {
  const lines: string[] = [
    "# Engagement Baseline Summary",
    "",
    `Exported: ${summary.exportedAt}`,
    `GA4: ${summary.ga4PropertyId}`,
    `GSC: ${summary.gscSiteUrl}`,
  ];

  if (sourcePath) {
    lines.push(`Source: ${path.relative(process.cwd(), sourcePath)}`);
  }

  for (const range of summary.ranges) {
    lines.push(
      "",
      `## Last ${range.days} Days (${range.startDate} to ${range.endDate})`,
      "",
      `- Sessions: ${range.ga4.sessions}`,
      `- Engagement rate: ${formatPercent(range.ga4.engagementRate)}`,
      `- Views/session: ${range.ga4.viewsPerSession}`,
      `- Avg engagement/session: ${formatDuration(range.ga4.averageEngagementSecondsPerSession)}`,
      `- Search clicks/impressions: ${range.gsc.clicks}/${range.gsc.impressions}`,
      `- Search CTR / avg position: ${formatPercent(range.gsc.ctr)} / ${range.gsc.averagePosition}`,
      "",
      "Top channels:",
      ...range.topChannels.slice(0, 5).map((channel) => `- ${formatEngagement(channel)}`),
      "",
      "Device split:",
      ...range.topDevices.map((device) => `- ${formatEngagement(device)}`),
      "",
      "Weak landing pages:",
      ...(range.weakLandingPages.length
        ? range.weakLandingPages.map((page) => `- ${formatEngagement(page)}`)
        : ["- None above the minimum volume threshold"]),
      "",
      "Weak mobile/social landing pages:",
      ...(range.weakMobileSocialLandingPages.length
        ? range.weakMobileSocialLandingPages.map((page) => `- ${formatEngagement(page)}`)
        : ["- None above the minimum volume threshold"]),
      "",
      "Search opportunities:",
      ...(range.searchOpportunities.length
        ? range.searchOpportunities.map((page) => `- ${formatSearch(page)}`)
        : ["- None above the minimum impression threshold"]),
      "",
      "Tracked events:",
      ...(range.trackedEvents.length
        ? range.trackedEvents.map((event) => `- ${event.eventName}: ${event.eventCount} events, ${event.totalUsers} users`)
        : ["- No tracked events returned"]),
      "",
      "Missing new engagement events:",
      ...(range.missingEngagementEvents.length
        ? range.missingEngagementEvents.map((eventName) => `- ${eventName}`)
        : ["- None"]),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function readBaselineExport(filePath: string): BaselineExport {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as BaselineExport;
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const explicitPath = args.find((arg) => !arg.startsWith("--"));
  const baselinePath = explicitPath ? path.resolve(explicitPath) : findLatestBaselineExport();

  if (!baselinePath) {
    throw new Error("No engagement baseline export found. Run `npm run analytics:baseline` first.");
  }

  const summary = summarizeBaselineExport(readBaselineExport(baselinePath));
  process.stdout.write(jsonOutput ? `${JSON.stringify(summary, null, 2)}\n` : renderSummaryMarkdown(summary, baselinePath));
}

const currentModulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentModulePath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
