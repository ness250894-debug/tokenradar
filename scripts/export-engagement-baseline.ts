/**
 * Export GA4 and Google Search Console engagement baselines for TokenRadar.
 *
 * Required environment:
 *   GA4_PROPERTY_ID=123456789
 *   GSC_SITE_URL=sc-domain:tokenradar.co
 *
 * Recommended authentication uses your Google account:
 *   GOOGLE_AUTH_MODE=oauth
 *   GOOGLE_OAUTH_CLIENT_ID=...
 *   GOOGLE_OAUTH_CLIENT_SECRET=...
 *
 * Run `npm run analytics:auth` once to save a local OAuth token, then run
 * `npm run analytics:baseline` whenever you need a fresh export.
 *
 * Service-account JSON is still supported for accounts where Google accepts
 * adding the service account to GA4/GSC access management.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { pathToFileURL } from "url";
import { google } from "googleapis";

const DATE_RANGES = [28, 90];
const OUTPUT_DIR = path.resolve(__dirname, "../data/analytics");
const DEFAULT_OAUTH_TOKEN_PATH = path.resolve(process.cwd(), "data/analytics/google-oauth-token.json");
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];
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
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type OAuthCredentials = Parameters<OAuth2Client["setCredentials"]>[0];

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

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

function decodeJsonEnv(raw: string): unknown {
  const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(decoded) as unknown;
}

function readOAuthClientConfig(): OAuthClientConfig | undefined {
  const rawJson = process.env.GOOGLE_OAUTH_CLIENT_JSON?.trim();
  const parsedJson = rawJson ? decodeJsonEnv(rawJson) : undefined;
  const clientConfig =
    typeof parsedJson === "object" && parsedJson !== null && "installed" in parsedJson
      ? (parsedJson.installed as Record<string, unknown>)
      : typeof parsedJson === "object" && parsedJson !== null && "web" in parsedJson
        ? (parsedJson.web as Record<string, unknown>)
        : typeof parsedJson === "object" && parsedJson !== null
          ? (parsedJson as Record<string, unknown>)
          : {};

  const redirectUris = Array.isArray(clientConfig.redirect_uris) ? clientConfig.redirect_uris : [];
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    (typeof clientConfig.client_id === "string" ? clientConfig.client_id : "");
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    (typeof clientConfig.client_secret === "string" ? clientConfig.client_secret : "");
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    redirectUris.find((value): value is string => typeof value === "string" && value.startsWith("http://")) ||
    "http://127.0.0.1:53682/oauth2callback";

  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret, redirectUri };
}

function getOAuthTokenPath(): string {
  return path.resolve(process.cwd(), process.env.GOOGLE_OAUTH_TOKEN_PATH || DEFAULT_OAUTH_TOKEN_PATH);
}

function readOAuthEnvToken(): OAuthCredentials | undefined {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!refreshToken) return undefined;
  return {
    refresh_token: refreshToken,
    access_token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() || undefined,
  };
}

function readStoredOAuthToken(tokenPath: string): OAuthCredentials | undefined {
  if (!fs.existsSync(tokenPath)) return undefined;
  return JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as OAuthCredentials;
}

function writeStoredOAuthToken(tokenPath: string, token: OAuthCredentials): void {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`);
}

function shouldRunInteractiveOAuth(): boolean {
  return process.argv.includes("--auth") || process.env.GOOGLE_OAUTH_INTERACTIVE === "1";
}

function waitForOAuthCode(redirectUri: string): Promise<string> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || 80);

  if (redirect.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(redirect.hostname)) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI must be a localhost http URL, for example http://127.0.0.1:53682/oauth2callback.");
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", `${redirect.protocol}//${redirect.host}`);
      if (requestUrl.pathname !== redirect.pathname) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      if (error || !code) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("Google authorization failed. You can close this tab.");
        server.close();
        reject(new Error(error || "Google did not return an OAuth code."));
        return;
      }

      response.writeHead(200, { "content-type": "text/plain" });
      response.end("TokenRadar analytics access is saved. You can close this tab.");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(port, redirect.hostname);
  });
}

async function runInteractiveOAuth(
  oauth2Client: OAuth2Client,
  tokenPath: string,
  redirectUri: string,
): Promise<OAuthCredentials> {
  const codePromise = waitForOAuthCode(redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });

  console.log([
    "Open this URL in the Google account that owns GA4 and Search Console:",
    authUrl,
    "",
    "After approval, the browser will return to localhost and this script will save the token locally.",
  ].join("\n"));

  const code = await codePromise;
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google did not return an OAuth token. Re-run analytics:auth and approve the requested access.");
  }
  writeStoredOAuthToken(tokenPath, tokens);
  return tokens;
}

async function readOAuthCredentials(oauth2Client: OAuth2Client, redirectUri: string): Promise<OAuthCredentials> {
  const tokenPath = getOAuthTokenPath();
  const token = readOAuthEnvToken() || readStoredOAuthToken(tokenPath);
  if (token) return token;

  if (shouldRunInteractiveOAuth()) {
    return runInteractiveOAuth(oauth2Client, tokenPath, redirectUri);
  }

  throw new Error([
    "Google user OAuth is configured but no local token was found.",
    "Run `npm run analytics:auth` once, sign in with Garrosh94@gmail.com, then run `npm run analytics:baseline`.",
    "Token path:",
    path.relative(process.cwd(), tokenPath),
  ].join("\n"));
}

export async function buildGoogleAuth() {
  const authMode = process.env.GOOGLE_AUTH_MODE?.trim().toLowerCase();
  const oauthConfig = readOAuthClientConfig();

  if (authMode === "oauth" || (!authMode && oauthConfig)) {
    if (!oauthConfig) {
      throw new Error("GOOGLE_AUTH_MODE=oauth requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
    }
    const oauth2Client = new google.auth.OAuth2(
      oauthConfig.clientId,
      oauthConfig.clientSecret,
      oauthConfig.redirectUri,
    );
    oauth2Client.setCredentials(await readOAuthCredentials(oauth2Client, oauthConfig.redirectUri));
    return oauth2Client;
  }

  const credentials = readServiceAccountCredentials();
  if (authMode === "service_account" && !credentials) {
    throw new Error("GOOGLE_AUTH_MODE=service_account requires GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: GOOGLE_SCOPES,
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

  const auth = await buildGoogleAuth();
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

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
