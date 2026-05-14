/**
 * Export GA4 and Google Search Console engagement baselines for TokenRadar.
 *
 * Required environment:
 *   GA4_PROPERTY_ID=123456789
 *   GSC_SITE_URL=https://tokenradar.co/
 *
 * Authentication uses Application Default Credentials unless
 * GOOGLE_SERVICE_ACCOUNT_JSON contains a service-account JSON object.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

const DATE_RANGES = [28, 90];
const OUTPUT_DIR = path.resolve(__dirname, "../data/analytics");
const GA4_EVENT_NAMES = [
  "recirculation_impression",
  "recirculation_click",
  "article_depth",
  "content_complete",
  "toc_interaction",
  "calculator_interaction",
  "directory_filter",
  "next_action_click",
  "ui_click",
  "scroll",
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

interface BaselineExport {
  exportedAt: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  ranges: BaselineRange[];
}

type GoogleAuthOptions = NonNullable<ConstructorParameters<typeof google.auth.GoogleAuth>[0]>;
type GoogleCredentials = GoogleAuthOptions["credentials"];

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

function normalizePropertyId(propertyId: string): string {
  const trimmed = propertyId.trim();
  return trimmed.startsWith("properties/") ? trimmed : `properties/${trimmed}`;
}

function readServiceAccountCredentials(): GoogleCredentials | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;

  const decoded = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  const parsed = JSON.parse(decoded) as { private_key?: string; [key: string]: unknown };
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed as GoogleCredentials;
}

function buildAuth() {
  const credentials = readServiceAccountCredentials();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
  });
}

function numberValue(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flattenGa4Rows(
  response: {
    data?: {
      dimensionHeaders?: Array<{ name?: string | null }>;
      metricHeaders?: Array<{ name?: string | null }>;
      rows?: Array<{
        dimensionValues?: Array<{ value?: string | null }>;
        metricValues?: Array<{ value?: string | null }>;
      }>;
    };
  },
): FlatRow[] {
  const dimensionNames = response.data?.dimensionHeaders?.map((header) => header.name || "dimension") || [];
  const metricNames = response.data?.metricHeaders?.map((header) => header.name || "metric") || [];

  return (response.data?.rows || []).map((row) => ({
    dimensions: Object.fromEntries(
      dimensionNames.map((name, index) => [name, row.dimensionValues?.[index]?.value || ""]),
    ),
    metrics: Object.fromEntries(
      metricNames.map((name, index) => [name, numberValue(row.metricValues?.[index]?.value)]),
    ),
  }));
}

function flattenGscRows(
  rows: Array<{
    keys?: string[] | null;
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
  }> | undefined,
): FlatRow[] {
  return (rows || []).map((row) => ({
    dimensions: {
      page: row.keys?.[0] || "",
      query: row.keys?.[1] || "",
      device: row.keys?.[2] || "",
    },
    metrics: {
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    },
  }));
}

async function fetchGa4LandingPages(
  analyticsData: ReturnType<typeof google.analyticsdata>,
  property: string,
  startDate: string,
  endDate: string,
): Promise<FlatRow[]> {
  const response = await analyticsData.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "landingPagePlusQueryString" },
        { name: "deviceCategory" },
        { name: "sessionDefaultChannelGroup" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "screenPageViews" },
        { name: "userEngagementDuration" },
        { name: "eventCount" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "10000",
    },
  });

  return flattenGa4Rows(response);
}

async function fetchGa4TrackedEvents(
  analyticsData: ReturnType<typeof google.analyticsdata>,
  property: string,
  startDate: string,
  endDate: string,
): Promise<FlatRow[]> {
  const response = await analyticsData.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "eventName" },
        { name: "pagePathPlusQueryString" },
        { name: "deviceCategory" },
      ],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: GA4_EVENT_NAMES },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: "10000",
    },
  });

  return flattenGa4Rows(response);
}

async function fetchGscRows(
  searchConsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<FlatRow[]> {
  const response = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page", "query", "device"],
      rowLimit: 25000,
      startRow: 0,
    },
  });

  return flattenGscRows(response.data.rows);
}

async function main() {
  const ga4PropertyId = process.env.GA4_PROPERTY_ID;
  const gscSiteUrl = process.env.GSC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

  if (!ga4PropertyId) {
    throw new Error("GA4_PROPERTY_ID is required to export the engagement baseline.");
  }
  if (!gscSiteUrl) {
    throw new Error("GSC_SITE_URL or NEXT_PUBLIC_SITE_URL is required to export the engagement baseline.");
  }

  const auth = buildAuth();
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });
  const searchConsole = google.searchconsole({ version: "v1", auth });
  const property = normalizePropertyId(ga4PropertyId);
  const endDate = formatDate(subtractDays(new Date(), 1));

  const ranges: BaselineRange[] = [];

  for (const days of DATE_RANGES) {
    const startDate = formatDate(subtractDays(new Date(`${endDate}T00:00:00.000Z`), days - 1));
    const [landingPages, trackedEvents, pagesQueriesDevices] = await Promise.all([
      fetchGa4LandingPages(analyticsData, property, startDate, endDate),
      fetchGa4TrackedEvents(analyticsData, property, startDate, endDate),
      fetchGscRows(searchConsole, gscSiteUrl, startDate, endDate),
    ]);

    ranges.push({
      days,
      startDate,
      endDate,
      ga4: {
        landingPages,
        trackedEvents,
      },
      gsc: {
        pagesQueriesDevices,
      },
    });
  }

  const payload: BaselineExport = {
    exportedAt: new Date().toISOString(),
    ga4PropertyId: property,
    gscSiteUrl,
    ranges,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `engagement-baseline-${formatDate(new Date())}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    ranges: payload.ranges.map((range) => ({
      days: range.days,
      ga4LandingRows: range.ga4.landingPages.length,
      ga4EventRows: range.ga4.trackedEvents.length,
      gscRows: range.gsc.pagesQueriesDevices.length,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
