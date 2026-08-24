/**
 * Fail-fast readiness check for social routes that publish derived metrics.
 * Run after the market/history refresh and metrics computation, before any
 * platform API call or expensive video render.
 */

import * as path from "path";
import { pathToFileURL } from "url";

import {
  isEligibleToken,
  selectTokenComparisonPair,
  type TokenComparisonPair,
  type TokenComparisonToken,
} from "../src/lib/token-comparison";
import {
  formatVideoMarketFreshnessIssueCounts,
  validateVideoMarketDataFreshness,
  type VideoMarketFreshnessIssueCounts,
} from "../src/lib/video-production-controls";
import { loadEnv, safeReadJson } from "../src/lib/utils";
import {
  getMetricDataFreshnessIssues,
  loadCandidateTokens,
  type MetricData,
  type MetricDataFreshnessIssue,
  type TokenData,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");

export type SocialMarketReadinessMode = "comparison" | "video";

export interface ComparisonReadinessResult {
  totalCandidates: number;
  metricReadyCandidates: number;
  eligibleCandidates: number;
  metricIssueCounts: Partial<Record<MetricDataFreshnessIssue, number>>;
  pair?: TokenComparisonPair;
}

export interface VideoReadinessResult {
  totalCandidates: number;
  readyCandidates: number;
  issueCounts: VideoMarketFreshnessIssueCounts;
}

function incrementIssue<T extends string>(counts: Partial<Record<T, number>>, issue: T): void {
  counts[issue] = (counts[issue] || 0) + 1;
}

function toComparisonToken(token: TokenData, metric: MetricData): TokenComparisonToken {
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    imageUrl: token.imageUrl,
    categories: token.categories,
    price: token.market.price,
    change24h: token.market.priceChange24h,
    change7d: token.market.priceChange7d,
    marketCap: token.market.marketCap,
    volume24h: token.market.volume24h,
    rank: token.market.marketCapRank || token.rank,
    marketDataSource: token.marketDataSource,
    marketDataAsOf: token.lastMarketUpdate || token.fetchedAt,
    metrics: metric,
  };
}

export function evaluateComparisonReadiness(
  candidates: TokenData[],
  readMetric: (tokenId: string) => MetricData | undefined,
  now: Date = new Date(),
): ComparisonReadinessResult {
  const metricIssueCounts: Partial<Record<MetricDataFreshnessIssue, number>> = {};
  const metricReady: TokenComparisonToken[] = [];

  for (const token of candidates) {
    const metric = readMetric(token.id);
    const issues = getMetricDataFreshnessIssues(
      metric,
      token.lastMarketUpdate || token.fetchedAt,
      now,
    );
    if (issues.length > 0 || !metric) {
      for (const issue of issues) incrementIssue(metricIssueCounts, issue);
      continue;
    }
    metricReady.push(toComparisonToken(token, metric));
  }

  const eligible = metricReady.filter(isEligibleToken);
  return {
    totalCandidates: candidates.length,
    metricReadyCandidates: metricReady.length,
    eligibleCandidates: eligible.length,
    metricIssueCounts,
    pair: eligible.length >= 2
      ? selectTokenComparisonPair(eligible, { recentlyPosted: [], dateKey: now.toISOString().slice(0, 10) })
      : undefined,
  };
}

export function evaluateVideoReadiness(
  candidates: TokenData[],
  readMetric: (tokenId: string) => MetricData | undefined,
  now: Date = new Date(),
): VideoReadinessResult {
  const issueCounts: VideoMarketFreshnessIssueCounts = {};
  let readyCandidates = 0;
  for (const token of candidates) {
    const result = validateVideoMarketDataFreshness({
      token,
      metric: readMetric(token.id),
      now,
    });
    if (result.ok) {
      readyCandidates += 1;
      continue;
    }
    for (const issue of result.issues) incrementIssue(issueCounts, issue);
  }
  return { totalCandidates: candidates.length, readyCandidates, issueCounts };
}

function formatIssueCounts(counts: Record<string, number | undefined>): string {
  const entries = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([issue, count]) => `${issue}=${count}`).join(", ")
    : "none";
}

function readMetric(tokenId: string): MetricData | undefined {
  return safeReadJson<MetricData | undefined>(
    path.join(DATA_DIR, "metrics", `${tokenId}.json`),
    undefined,
  );
}

function readMode(args: string[]): SocialMarketReadinessMode {
  const index = args.indexOf("--mode");
  const mode = index >= 0 ? args[index + 1] : undefined;
  if (mode !== "comparison" && mode !== "video") {
    throw new Error("Missing or invalid --mode. Expected comparison or video.");
  }
  return mode;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const mode = readMode(args);
  const endRank = mode === "comparison" ? 250 : 50;
  const { candidates } = await loadCandidateTokens(DATA_DIR, 1, endRank);

  if (mode === "comparison") {
    const result = evaluateComparisonReadiness(candidates, readMetric);
    console.log(
      `Comparison readiness: eligible=${result.eligibleCandidates}, ` +
      `metric-ready=${result.metricReadyCandidates}/${result.totalCandidates}; ` +
      `rejections: ${formatIssueCounts(result.metricIssueCounts)}`,
    );
    if (!result.pair) {
      throw new Error(
        `Comparison readiness requires at least 2 eligible candidates; found ${result.eligibleCandidates}.`,
      );
    }
    console.log(
      `Comparison readiness passed: ${result.pair.left.symbol.toUpperCase()} vs ` +
      `${result.pair.right.symbol.toUpperCase()}.`,
    );
    return;
  }

  const result = evaluateVideoReadiness(candidates, readMetric);
  console.log(
    `Video readiness: ready=${result.readyCandidates}/${result.totalCandidates}; ` +
    `rejections: ${formatVideoMarketFreshnessIssueCounts(result.issueCounts) || "none"}`,
  );
  if (result.readyCandidates < 1) {
    throw new Error("Video readiness requires at least 1 publishable candidate; found 0.");
  }
  console.log("Video readiness passed.");
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(`Social market readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
