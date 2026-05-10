import * as fs from "fs";
import * as path from "path";
import { MONTHLY_LIMIT, getApiQuota, sendTelegramAlert } from "../src/lib/reporter";
import { loadEnv } from "../src/lib/utils";

loadEnv();

const LOGS_DIR = path.resolve(__dirname, "../data/logs");
const ACTIVITIES_DIR = path.join(LOGS_DIR, "activities");
const ERRORS_DIR = path.join(LOGS_DIR, "errors");
const DATA_DIR = path.resolve(__dirname, "../data");
const OUT_DIR = path.resolve(__dirname, "../out");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PRICES_DIR = path.join(DATA_DIR, "prices");
const REFERENCES_DIR = path.join(DATA_DIR, "references");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
const PRICE_HISTORY_STALE_DAYS = 7;
const MARKET_DATA_STALE_HOURS = 36;

interface ActivityRecord {
  timestamp?: string;
  type: string;
  tokenId?: string;
  tokenName?: string;
  platform?: string;
  reason?: string;
  tokenCount?: number;
  tokensProcessed?: number;
  cost?: number;
  articles?: number;
}

interface ErrorRecord {
  timestamp?: string;
  source: string;
  message: string;
  isFatal: boolean;
}

interface TokenRecord {
  id?: string;
  name?: string;
  fetchedAt?: string;
  lastMarketUpdate?: string;
  market?: {
    price?: number;
    marketCap?: number;
    marketCapRank?: number;
    volume24h?: number;
  };
}

interface UpcomingTgeRecord {
  status?: string;
}

interface ErrorSummary {
  total: number;
  fatal: number;
  warning: number;
  latest?: ErrorRecord;
}

function safeReadJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        count += countFiles(path.join(dir, item.name));
      } else {
        count++;
      }
    }
  } catch {
    // Ignore transient filesystem errors in the report path.
  }
  return count;
}

function countJsonFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => file.endsWith(".json")).length;
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file));
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

function formatShortDate(timestamp: number | null): string {
  if (!timestamp) return "unknown";
  return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
}

function firstLine(value: string | undefined): string {
  return (value || "").split(/\r?\n/)[0]?.trim() || "Unknown error";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([_*[\]()`])/g, "\\$1");
}

function getRunUrl(): string | null {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!serverUrl || !repository || !runId) return null;
  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function summarizeDataHealth() {
  const tokenFiles = listJsonFiles(TOKENS_DIR);
  const tokens = tokenFiles
    .map((file) => safeReadJson<TokenRecord>(file))
    .filter((token): token is TokenRecord => Boolean(token));
  const tokenCount = tokens.length;
  const metricsCount = countJsonFiles(METRICS_DIR);
  const priceCount = countJsonFiles(PRICES_DIR);
  const referenceCount = countJsonFiles(REFERENCES_DIR);
  const tges = safeReadJson<UpcomingTgeRecord[]>(TGE_FILE) || [];
  const upcomingTges = tges.filter((item) => item.status !== "released").length;
  const releasedTges = tges.filter((item) => item.status === "released").length;

  const marketCutoff = Date.now() - MARKET_DATA_STALE_HOURS * 60 * 60 * 1000;
  const marketTimes = tokens
    .map((token) => parseTime(token.lastMarketUpdate || token.fetchedAt))
    .filter((time): time is number => time !== null);
  const latestMarketUpdate = marketTimes.length > 0 ? Math.max(...marketTimes) : null;
  const staleMarketTokens = tokens.filter((token) => {
    const timestamp = parseTime(token.lastMarketUpdate || token.fetchedAt);
    return timestamp === null || timestamp < marketCutoff;
  }).length;

  const priceCutoff = Date.now() - PRICE_HISTORY_STALE_DAYS * 24 * 60 * 60 * 1000;
  let stalePriceHistories = 0;
  for (const file of listJsonFiles(PRICES_DIR)) {
    try {
      if (fs.statSync(file).mtimeMs < priceCutoff) {
        stalePriceHistories++;
      }
    } catch {
      stalePriceHistories++;
    }
  }

  return {
    tokenCount,
    metricsCount,
    priceCount,
    referenceCount,
    upcomingTges,
    releasedTges,
    latestMarketUpdate,
    staleMarketTokens,
    stalePriceHistories,
    missingPriceHistories: Math.max(0, tokenCount - priceCount),
    metricsCoverage: formatPercent(metricsCount, tokenCount),
    priceCoverage: formatPercent(priceCount, tokenCount),
  };
}

function getQuotaSummary() {
  const quota = getApiQuota();
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);
  const projectedMonthly = dayOfMonth > 0 ? Math.round((quota.count / dayOfMonth) * daysInMonth) : quota.count;
  const remaining = Math.max(0, MONTHLY_LIMIT - quota.count);
  const dailyBudgetRemaining = daysRemaining > 0 ? Math.floor(remaining / daysRemaining) : remaining;
  const usagePercent = ((quota.count / MONTHLY_LIMIT) * 100).toFixed(1);

  const status =
    quota.count > MONTHLY_LIMIT * 0.9 || projectedMonthly > MONTHLY_LIMIT
      ? "CRITICAL"
      : quota.count > MONTHLY_LIMIT * 0.7 || projectedMonthly > MONTHLY_LIMIT * 0.85
        ? "HIGH"
        : "HEALTHY";

  return {
    ...quota,
    status,
    usagePercent,
    projectedMonthly,
    remaining,
    dailyBudgetRemaining,
  };
}

function collectLogSummaries(activityFiles: string[], errorFiles: string[]) {
  const socialPosts: Array<{ name: string; platform: string; reason: string }> = [];
  const publishedContent: Array<{ name: string; id: string; count: number }> = [];
  const errors: Record<string, ErrorSummary> = {};
  let totalDataRefreshed = 0;
  let metricsTokensCount = 0;
  let tgeCount = 0;
  let totalCost = 0;
  let invalidActivityLogs = 0;
  let invalidErrorLogs = 0;

  for (const file of activityFiles) {
    const data = safeReadJson<ActivityRecord>(path.join(ACTIVITIES_DIR, file));
    if (!data) {
      invalidActivityLogs++;
      continue;
    }

    if (data.type === "social-post") {
      socialPosts.push({
        name: data.tokenName || data.tokenId || "Unknown",
        platform: data.platform || "all",
        reason: data.reason || "spotlight",
      });
    } else if (data.type === "publish-from-queue") {
      publishedContent.push({
        name: data.tokenName || data.tokenId || "Unknown",
        id: data.tokenId || "",
        count: data.articles || 0,
      });
    } else if (data.type === "data-refresh") {
      totalDataRefreshed += data.tokenCount || 0;
    } else if (data.type === "metrics-calc") {
      metricsTokensCount = Math.max(metricsTokensCount, data.tokensProcessed || 0);
    } else if (data.type === "generate") {
      totalCost += data.cost || 0;
    } else if (data.type === "tge-discovery") {
      tgeCount += data.tokenCount || 0;
    }
  }

  for (const file of errorFiles) {
    const data = safeReadJson<ErrorRecord>(path.join(ERRORS_DIR, file));
    if (!data) {
      invalidErrorLogs++;
      continue;
    }

    const entry = errors[data.source] || { total: 0, fatal: 0, warning: 0 };
    entry.total++;
    if (data.isFatal) {
      entry.fatal++;
    } else {
      entry.warning++;
    }
    if (!entry.latest || (parseTime(data.timestamp) || 0) > (parseTime(entry.latest.timestamp) || 0)) {
      entry.latest = data;
    }
    errors[data.source] = entry;
  }

  return {
    socialPosts,
    publishedContent,
    errors,
    totalDataRefreshed,
    metricsTokensCount,
    tgeCount,
    totalCost,
    invalidActivityLogs,
    invalidErrorLogs,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const keepLogs = process.argv.includes("--keep-logs");
  const activityFiles = fs.existsSync(ACTIVITIES_DIR)
    ? fs.readdirSync(ACTIVITIES_DIR).filter((file) => file.endsWith(".json"))
    : [];
  const errorFiles = fs.existsSync(ERRORS_DIR)
    ? fs.readdirSync(ERRORS_DIR).filter((file) => file.endsWith(".json"))
    : [];

  const logSummary = collectLogSummaries(activityFiles, errorFiles);
  const dataHealth = summarizeDataHealth();
  const quota = getQuotaSummary();
  const fatalErrorCount = Object.values(logSummary.errors).reduce((sum, entry) => sum + entry.fatal, 0);
  const hasDataWarning =
    dataHealth.tokenCount === 0 ||
    dataHealth.staleMarketTokens > 100 ||
    dataHealth.missingPriceHistories > dataHealth.tokenCount * 0.5 ||
    Number(dataHealth.metricsCoverage) < 95;

  let systemStatus = "HEALTHY";
  if (fatalErrorCount > 0 || quota.status === "CRITICAL" || dataHealth.tokenCount === 0) {
    systemStatus = "CRITICAL";
  } else if (Object.keys(logSummary.errors).length > 0 || quota.status === "HIGH" || hasDataWarning) {
    systemStatus = "WARNING";
  }

  const runUrl = getRunUrl();
  const runLabel = process.env.GITHUB_RUN_NUMBER
    ? `${process.env.GITHUB_WORKFLOW || "workflow"} #${process.env.GITHUB_RUN_NUMBER}`
    : null;

  let message = "*Daily System Pulse*\n";
  message += `Status: \`${systemStatus}\`\n`;
  if (runUrl && runLabel) {
    message += `Run: [${escapeMarkdown(runLabel)}](${runUrl})\n`;
  }
  if (process.env.GITHUB_REF_NAME) {
    message += `Branch: \`${escapeMarkdown(process.env.GITHUB_REF_NAME)}\`\n`;
  }
  message += "\n";

  if (logSummary.publishedContent.length > 0) {
    message += "*Recently Published*\n";
    for (const item of logSummary.publishedContent.slice(0, 8)) {
      const tokenUrl = `${siteUrl.replace(/\/$/, "")}/${encodeURIComponent(item.id)}`;
      message += `- [${escapeMarkdown(item.name)}](${tokenUrl}) (${item.count} articles)\n`;
    }
    message += "\n";
  }

  if (logSummary.socialPosts.length > 0) {
    message += "*Social Activity*\n";
    for (const post of logSummary.socialPosts.slice(0, 8)) {
      message += `- ${escapeMarkdown(post.platform.toUpperCase())}: *${escapeMarkdown(post.name)}* (${escapeMarkdown(post.reason)})\n`;
    }
    message += "\n";
  }

  const dataFileCount = countFiles(DATA_DIR);
  const outDirFileCount = countFiles(OUT_DIR);
  const contentFileCount = countFiles(CONTENT_DIR);
  const cfLimit = 20000;
  const outDirPercent = ((outDirFileCount / cfLimit) * 100).toFixed(1);

  message += "*Data Health*\n";
  message += `- Tokens: \`${dataHealth.tokenCount}\`\n`;
  message += `- Metrics: \`${dataHealth.metricsCount}\` (${dataHealth.metricsCoverage}% coverage)\n`;
  message += `- Price histories: \`${dataHealth.priceCount}\` (${dataHealth.priceCoverage}% coverage)\n`;
  if (dataHealth.missingPriceHistories > 0 || dataHealth.stalePriceHistories > 0) {
    message += `- Price history gaps: \`${dataHealth.missingPriceHistories}\` missing, \`${dataHealth.stalePriceHistories}\` stale > ${PRICE_HISTORY_STALE_DAYS}d\n`;
  }
  message += `- Market freshness: latest ${formatShortDate(dataHealth.latestMarketUpdate)} UTC, \`${dataHealth.staleMarketTokens}\` stale > ${MARKET_DATA_STALE_HOURS}h\n`;
  message += `- TGEs: \`${dataHealth.upcomingTges}\` upcoming, \`${dataHealth.releasedTges}\` released\n`;
  message += `- References: \`${dataHealth.referenceCount}\`\n`;
  message += `- Raw data files: \`${dataFileCount}\`\n`;
  message += `- Content articles: \`${contentFileCount}\`\n`;
  if (outDirFileCount > 0) {
    message += `- Build output: \`${outDirFileCount}\` / ${cfLimit} (${outDirPercent}% CF limit)\n`;
  }
  message += `- Refreshed this run: \`${logSummary.totalDataRefreshed}\` token updates\n`;
  message += `- Analyzed this run: \`${logSummary.metricsTokensCount}\` proprietary scores\n`;
  if (logSummary.tgeCount > 0) {
    message += `- TGE discovery activity: \`${logSummary.tgeCount}\`\n`;
  }
  message += "\n";

  message += "*API Quota Tracking*\n";
  message += `- Used: \`${quota.count}\` / ${MONTHLY_LIMIT} requests\n`;
  message += `- Monthly usage: \`${quota.usagePercent}%\` (${quota.status})\n`;
  message += `- Projected month-end: \`${quota.projectedMonthly}\`\n`;
  message += `- Remaining budget: \`${quota.remaining}\` total, about \`${quota.dailyBudgetRemaining}\`/day\n`;
  if (logSummary.totalCost > 0) {
    message += `- Estimated AI cost: \`$${logSummary.totalCost.toFixed(4)}\`\n`;
  }
  message += "\n";

  if (Object.keys(logSummary.errors).length > 0) {
    message += "*System Errors Detected*\n";
    for (const [source, entry] of Object.entries(logSummary.errors)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 8)) {
      const severity = entry.fatal > 0 ? "fatal" : "warning";
      const latest = truncate(firstLine(entry.latest?.message), 120);
      message += `- ${escapeMarkdown(source)}: \`${entry.total}\` ${severity}; ${escapeMarkdown(latest)}\n`;
    }
    message += "\n";
  }

  if (logSummary.invalidActivityLogs > 0 || logSummary.invalidErrorLogs > 0) {
    message += "*Log Hygiene*\n";
    message += `- Unreadable activity logs: \`${logSummary.invalidActivityLogs}\`\n`;
    message += `- Unreadable error logs: \`${logSummary.invalidErrorLogs}\`\n\n`;
  }

  if (activityFiles.length === 0 && errorFiles.length === 0) {
    message += "_No major activities logged today._\n";
  }

  if (dryRun) {
    console.log(message);
    return;
  }

  const delivered = await sendTelegramAlert(message);
  if (!delivered) {
    console.error("System pulse was not delivered. Preserving logs for the next run.");
    process.exit(1);
  }

  console.log("Successfully dispatched system pulse.");

  if (!keepLogs) {
    activityFiles.forEach((file) => fs.unlinkSync(path.join(ACTIVITIES_DIR, file)));
    errorFiles.forEach((file) => fs.unlinkSync(path.join(ERRORS_DIR, file)));
    console.log(`Cleaned up ${activityFiles.length + errorFiles.length} logs.`);
  }
}

main().catch((error) => {
  console.error("Failed to send system pulse:", error);
  process.exit(1);
});
