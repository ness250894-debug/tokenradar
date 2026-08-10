/**
 * Builds a deterministic SEO work queue from Search Console, index inspection,
 * sitemap inventory, source freshness, and local content-quality checks.
 * No network requests or generative-AI services are used.
 */
import * as fs from "fs";
import * as path from "path";

import { evaluateArticleQuality } from "../src/lib/content-quality";
import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { writeFileAtomicSync } from "../src/lib/utils";
import { findLatestBaselineExport, normalizePagePath, readBaselineExport, type BaselineExport } from "./summarize-engagement-baseline";

interface FlatRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

interface SearchGroup {
  page: string;
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
}

interface SourceInfo {
  sourcePath: string | null;
  contentUpdatedAt: string | null;
  wordCount: number | null;
  qualityPassed: boolean | null;
  qualityWarnings: string[];
}

interface IndexRecord {
  url: string;
  verdict: string;
  coverageState: string;
  pageFetchState: string;
  indexingState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  referringUrlCount: number;
  error?: string;
}

interface IndexExport {
  exportedAt: string;
  records: IndexRecord[];
}

interface PageOpportunity extends SearchGroup, SourceInfo {
  ageDays: number | null;
  topQueries: SearchGroup[];
  reason: string;
}

interface CleanupCandidate extends SourceInfo {
  page: string;
  ageDays: number | null;
  impressions: number;
  clicks: number;
  verdict: string;
  coverageState: string;
  pageFetchState: string;
  lastCrawlTime: string | null;
  recommendedAction: "improve" | "merge-or-canonicalize" | "remove-or-redirect" | "strengthen-discovery" | "investigate";
  reason: string;
}

interface SeoOpportunityReport {
  generatedAt: string;
  baselinePath: string;
  baselineExportedAt: string;
  rangeDays: number;
  indexStatusPath: string | null;
  sitemapUrlCount: number;
  searchSummary: SearchGroup;
  strikingDistance: PageOpportunity[];
  highImpressionStale: PageOpportunity[];
  cleanupCandidates: CleanupCandidate[];
  localQualityFailures: Array<SourceInfo & { page: string; issues: string[] }>;
  guardrails: string[];
  usage: { aiCalls: 0; networkRequests: 0 };
}

const ANALYTICS_DIR = path.resolve(process.cwd(), "data/analytics");
const CONTENT_DIR = path.resolve(process.cwd(), "content/tokens");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const DAY_MS = 86_400_000;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latestMatchingFile(pattern: RegExp): string | null {
  if (!fs.existsSync(ANALYTICS_DIR)) return null;
  return fs.readdirSync(ANALYTICS_DIR)
    .filter((file) => pattern.test(file))
    .map((file) => path.join(ANALYTICS_DIR, file))
    .toSorted((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function aggregateRows(rows: FlatRow[], keyForRow: (row: FlatRow) => string): SearchGroup[] {
  const groups = new Map<string, { page: string; query?: string; clicks: number; impressions: number; weightedPosition: number }>();
  for (const row of rows) {
    const key = keyForRow(row);
    const page = normalizePagePath(row.dimensions.page || "(not set)");
    const query = row.dimensions.query?.trim() || undefined;
    const impressions = row.metrics.impressions || 0;
    const current = groups.get(key) || { page, query, clicks: 0, impressions: 0, weightedPosition: 0 };
    current.clicks += row.metrics.clicks || 0;
    current.impressions += impressions;
    current.weightedPosition += (row.metrics.position || 0) * impressions;
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((group) => ({
    page: group.page,
    query: group.query,
    clicks: group.clicks,
    impressions: group.impressions,
    ctr: group.impressions > 0 ? round(group.clicks / group.impressions, 4) : 0,
    averagePosition: group.impressions > 0 ? round(group.weightedPosition / group.impressions, 1) : 0,
  }));
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function ageInDays(value: string | null, now: number): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / DAY_MS)) : null;
}

function articleSourceForPage(page: string): string | null {
  const segments = page.split("/").filter(Boolean);
  if (segments.length === 1) return path.join(CONTENT_DIR, segments[0], "overview.json");
  if (segments.length === 2 && ["overview", "price-prediction", "how-to-buy"].includes(segments[1])) {
    return path.join(CONTENT_DIR, segments[0], `${segments[1]}.json`);
  }
  if (segments.length === 2 && segments[0] === "upcoming") {
    return path.join(CONTENT_DIR, segments[1], "tge-preview.json");
  }
  return null;
}

function staticSourceForPage(page: string): string | null {
  const known: Record<string, string> = {
    "/": "src/app/page.tsx",
    "/about": "src/app/about/page.tsx",
    "/best-crypto-hardware-wallets": "src/app/best-crypto-hardware-wallets/page.tsx",
    "/crypto-tax-guide": "src/app/crypto-tax-guide/page.tsx",
    "/learn": "data/glossary.json",
    "/research": "data/_metrics_blob.json",
    "/search-intent": "data/search-intent.json",
    "/tokens": "data/_registry.json",
    "/tokens/all": "data/_registry.json",
    "/upcoming": "data/upcoming-tges.json",
  };
  if (known[page]) return path.resolve(process.cwd(), known[page]);
  if (page.startsWith("/category/")) return path.resolve(process.cwd(), "data/_registry.json");
  if (page.startsWith("/search-intent/")) return path.resolve(process.cwd(), "data/search-intent.json");
  return null;
}

function sourceInfoForPage(page: string): SourceInfo {
  const articlePath = articleSourceForPage(page);
  if (articlePath && fs.existsSync(articlePath)) {
    try {
      const article = JSON.parse(fs.readFileSync(articlePath, "utf-8")) as {
        type?: string;
        slug?: string;
        title?: string;
        content?: string;
        generatedAt?: string;
      };
      const quality = evaluateArticleQuality(article);
      return {
        sourcePath: path.relative(process.cwd(), articlePath),
        contentUpdatedAt: parseDate(article.generatedAt),
        wordCount: quality.stats.wordCount,
        qualityPassed: quality.passed,
        qualityWarnings: quality.warnings,
      };
    } catch {
      return { sourcePath: path.relative(process.cwd(), articlePath), contentUpdatedAt: null, wordCount: null, qualityPassed: false, qualityWarnings: ["Article JSON could not be parsed"] };
    }
  }

  const staticPath = staticSourceForPage(page);
  if (!staticPath || !fs.existsSync(staticPath)) {
    return { sourcePath: null, contentUpdatedAt: null, wordCount: null, qualityPassed: null, qualityWarnings: [] };
  }
  const text = fs.readFileSync(staticPath, "utf-8");
  const embeddedDate = /(?:LAST_UPDATED|LAST_REVIEWED)\s*=\s*["'](\d{4}-\d{2}-\d{2})["']/.exec(text)?.[1];
  const jsonDate = /"(?:generatedAt|updatedAt|computedAt|fetchedAt)"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  return {
    sourcePath: path.relative(process.cwd(), staticPath),
    contentUpdatedAt: parseDate(embeddedDate || jsonDate) || fs.statSync(staticPath).mtime.toISOString(),
    wordCount: null,
    qualityPassed: null,
    qualityWarnings: [],
  };
}

function readLatestIndexExport(): { path: string; data: IndexExport } | null {
  const filePath = latestMatchingFile(/^index-status-\d{4}-\d{2}-\d{2}\.json$/);
  if (!filePath) return null;
  try {
    return { path: filePath, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) as IndexExport };
  } catch {
    return null;
  }
}

function recommendCleanup(record: IndexRecord): CleanupCandidate["recommendedAction"] {
  const state = `${record.coverageState} ${record.pageFetchState}`.toLowerCase();
  if (/duplicate|alternate page|canonical/.test(state)) return "merge-or-canonicalize";
  if (/soft 404|not found|redirect error/.test(state)) return "remove-or-redirect";
  if (/discovered|unknown to google/.test(state)) return "strengthen-discovery";
  if (/crawled|not indexed/.test(state)) return "improve";
  return "investigate";
}

function collectLocalQualityFailures(sitemapPaths: Set<string>): SeoOpportunityReport["localQualityFailures"] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const failures: SeoOpportunityReport["localQualityFailures"] = [];
  for (const tokenId of fs.readdirSync(CONTENT_DIR)) {
    const tokenDir = path.join(CONTENT_DIR, tokenId);
    if (!fs.statSync(tokenDir).isDirectory()) continue;
    for (const file of fs.readdirSync(tokenDir).filter((name) => name.endsWith(".json"))) {
      const sourcePath = path.join(tokenDir, file);
      try {
        const article = JSON.parse(fs.readFileSync(sourcePath, "utf-8")) as { type?: string; slug?: string; title?: string; content?: string; generatedAt?: string };
        const quality = evaluateArticleQuality(article);
        if (quality.passed) continue;
        const slug = file.replace(/\.json$/, "");
        const page = slug === "overview" ? `/${tokenId}` : slug === "tge-preview" ? `/upcoming/${tokenId}` : `/${tokenId}/${slug}`;
        if (sitemapPaths.has(page)) continue;
        failures.push({
          page,
          sourcePath: path.relative(process.cwd(), sourcePath),
          contentUpdatedAt: parseDate(article.generatedAt),
          wordCount: quality.stats.wordCount,
          qualityPassed: false,
          qualityWarnings: quality.warnings,
          issues: quality.issues,
        });
      } catch {
        failures.push({
          page: `/${tokenId}/${file.replace(/\.json$/, "")}`,
          sourcePath: path.relative(process.cwd(), sourcePath),
          contentUpdatedAt: null,
          wordCount: null,
          qualityPassed: false,
          qualityWarnings: [],
          issues: ["Invalid article JSON"],
        });
      }
    }
  }
  return failures.toSorted((a, b) => (a.wordCount || 0) - (b.wordCount || 0));
}

function selectRange(baseline: BaselineExport): BaselineExport["ranges"][number] {
  return baseline.ranges.toSorted((a, b) => b.days - a.days)[0];
}

function buildReport(baselinePath: string, baseline: BaselineExport): SeoOpportunityReport {
  const range = selectRange(baseline);
  const now = Date.now();
  const queryGroups = aggregateRows(range.gsc.pagesQueriesDevices, (row) => `${normalizePagePath(row.dimensions.page || "")}\u0000${row.dimensions.query || ""}`);
  const pageGroups = aggregateRows(range.gsc.pagesQueriesDevices, (row) => normalizePagePath(row.dimensions.page || ""));
  const pageByPath = new Map(pageGroups.map((page) => [page.page, page]));
  const topQueriesByPage = new Map<string, SearchGroup[]>();
  for (const group of queryGroups.toSorted((a, b) => b.impressions - a.impressions)) {
    const current = topQueriesByPage.get(group.page) || [];
    if (current.length < 5) current.push(group);
    topQueriesByPage.set(group.page, current);
  }
  const sourceByPage = new Map(pageGroups.map((page) => [page.page, sourceInfoForPage(page.page)]));

  const strikingDistance = pageGroups
    .filter((page) => page.averagePosition >= 4 && page.averagePosition <= 20 && page.impressions >= 2)
    .map((page): PageOpportunity => {
      const source = sourceByPage.get(page.page) || sourceInfoForPage(page.page);
      return {
        ...page,
        ...source,
        ageDays: ageInDays(source.contentUpdatedAt, now),
        topQueries: (topQueriesByPage.get(page.page) || []).filter((query) => query.averagePosition >= 4 && query.averagePosition <= 20),
        reason: "Average position is within the 4–20 striking-distance range.",
      };
    })
    .toSorted((a, b) => b.impressions - a.impressions || a.averagePosition - b.averagePosition);

  const highImpressionStale = pageGroups
    .filter((page) => page.impressions >= 3)
    .flatMap((page): PageOpportunity[] => {
      const source = sourceByPage.get(page.page) || sourceInfoForPage(page.page);
      const ageDays = ageInDays(source.contentUpdatedAt, now);
      if (ageDays === null || ageDays < 45) return [];
      return [{
        ...page,
        ...source,
        ageDays,
        topQueries: topQueriesByPage.get(page.page) || [],
        reason: `${page.impressions} impressions with content evidence ${ageDays} days old.`,
      }];
    })
    .toSorted((a, b) => b.impressions - a.impressions || (b.ageDays || 0) - (a.ageDays || 0));

  const sitemapUrls = collectIndexNowUrlsFromPublicDir(PUBLIC_DIR);
  const sitemapPaths = new Set(sitemapUrls.map((url) => normalizePagePath(url)));
  const indexExport = readLatestIndexExport();
  const cleanupCandidates = (indexExport?.data.records || []).flatMap((record): CleanupCandidate[] => {
    if (record.verdict === "PASS" || record.verdict === "ERROR") return [];
    const page = normalizePagePath(record.url);
    const search = pageByPath.get(page) || { page, clicks: 0, impressions: 0, ctr: 0, averagePosition: 0 };
    if (search.impressions > 0 || search.clicks > 0) return [];
    const source = sourceInfoForPage(page);
    const ageDays = ageInDays(source.contentUpdatedAt, now);
    if (ageDays !== null && ageDays < 45) return [];
    const action = recommendCleanup(record);
    return [{
      page,
      ...source,
      ageDays,
      impressions: search.impressions,
      clicks: search.clicks,
      verdict: record.verdict,
      coverageState: record.coverageState,
      pageFetchState: record.pageFetchState,
      lastCrawlTime: record.lastCrawlTime,
      recommendedAction: action,
      reason: `No measured search demand; index state is "${record.coverageState}". Review before applying ${action}.`,
    }];
  }).toSorted((a, b) => (b.ageDays || 0) - (a.ageDays || 0));

  const totals = aggregateRows(range.gsc.pagesQueriesDevices, () => "all")[0] || { page: "all", clicks: 0, impressions: 0, ctr: 0, averagePosition: 0 };
  return {
    generatedAt: new Date().toISOString(),
    baselinePath: path.relative(process.cwd(), baselinePath),
    baselineExportedAt: baseline.exportedAt,
    rangeDays: range.days,
    indexStatusPath: indexExport ? path.relative(process.cwd(), indexExport.path) : null,
    sitemapUrlCount: sitemapUrls.length,
    searchSummary: totals,
    strikingDistance,
    highImpressionStale,
    cleanupCandidates,
    localQualityFailures: collectLocalQualityFailures(sitemapPaths),
    guardrails: [
      "Do not delete a URL solely because it has zero impressions.",
      "Require URL Inspection evidence plus at least 45 days of age before cleanup review.",
      "Preserve URLs with clicks, impressions, backlinks, or a unique research purpose.",
      "Use a relevant redirect only when a genuinely equivalent destination exists.",
      "Do not change published or modified dates unless page content changed materially.",
    ],
    usage: { aiCalls: 0, networkRequests: 0 },
  };
}

function formatGroup(group: SearchGroup): string {
  return `${group.page}: ${group.impressions} impressions, ${group.clicks} clicks, position ${group.averagePosition}`;
}

function renderMarkdown(report: SeoOpportunityReport): string {
  const lines = [
    "# Zero-AI SEO Opportunity Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: ${report.baselinePath} (${report.rangeDays} days)`,
    `Index status: ${report.indexStatusPath || "not exported yet"}`,
    `Sitemap URLs: ${report.sitemapUrlCount}`,
    `AI calls: ${report.usage.aiCalls}`,
    "",
    "## Striking-Distance Pages (Positions 4–20)",
    "",
    ...(report.strikingDistance.length ? report.strikingDistance.map((page) => `- ${formatGroup(page)}${page.ageDays !== null ? `; content age ${page.ageDays} days` : ""}`) : ["- None above the evidence threshold"]),
    "",
    "## High-Impression Stale Pages",
    "",
    ...(report.highImpressionStale.length ? report.highImpressionStale.map((page) => `- ${formatGroup(page)}; content age ${page.ageDays} days; source ${page.sourcePath || "unknown"}`) : ["- None above the evidence threshold"]),
    "",
    "## Unindexed Cleanup Review",
    "",
    ...(report.cleanupCandidates.length ? report.cleanupCandidates.map((page) => `- ${page.page}: ${page.recommendedAction}; ${page.coverageState}; content age ${page.ageDays ?? "unknown"} days`) : ["- No evidence-backed candidates, or index status has not been exported"]),
    "",
    "## Local Quality Failures Already Excluded from Sitemap",
    "",
    `- ${report.localQualityFailures.length} local article artifacts fail the current indexability gate.`,
    "",
    "## Guardrails",
    "",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
  ];
  return lines.join("\n");
}

function main(): void {
  const explicitPath = process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]);
  const baselinePath = explicitPath ? path.resolve(explicitPath) : findLatestBaselineExport();
  if (!baselinePath) throw new Error("No analytics baseline found. Run `npm run analytics:baseline` first.");
  const report = buildReport(baselinePath, readBaselineExport(baselinePath));
  fs.mkdirSync(ANALYTICS_DIR, { recursive: true });
  const date = report.generatedAt.slice(0, 10);
  const jsonPath = path.join(ANALYTICS_DIR, `seo-opportunities-${date}.json`);
  const markdownPath = path.join(ANALYTICS_DIR, `seo-opportunities-${date}.md`);
  writeFileAtomicSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileAtomicSync(markdownPath, `${renderMarkdown(report)}\n`);
  console.log(renderMarkdown(report));
  console.log(`Reports: ${path.relative(process.cwd(), jsonPath)}, ${path.relative(process.cwd(), markdownPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
