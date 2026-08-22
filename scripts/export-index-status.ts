/**
 * Exports Google Search Console URL Inspection status for sitemap URLs.
 * This is a read-only, deterministic SEO diagnostic. It does not call an AI service.
 */
import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { writeFileAtomicSync } from "../src/lib/utils";
import { buildGoogleAuth } from "./export-engagement-baseline";
import { acquireProcessLock } from "./process-lock";

interface IndexStatusRecord {
  url: string;
  inspectedAt: string;
  verdict: string;
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  crawledAs: string | null;
  referringUrlCount: number;
  sitemapCount: number;
  error?: string;
}

interface IndexStatusExport {
  exportedAt: string;
  siteUrl: string;
  source: string;
  totalSitemapUrls: number;
  inspectedUrlCount: number;
  records: IndexStatusRecord[];
}

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) || (index >= 0 ? process.argv[index + 1] : undefined);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readExisting(filePath: string): IndexStatusExport | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IndexStatusExport;
  } catch {
    return null;
  }
}

function writeExport(
  outputPath: string,
  siteUrl: string,
  source: string,
  totalSitemapUrls: number,
  records: IndexStatusRecord[],
): void {
  const payload: IndexStatusExport = {
    exportedAt: new Date().toISOString(),
    siteUrl,
    source,
    totalSitemapUrls,
    inspectedUrlCount: records.length,
    records: records.toSorted((a, b) => a.url.localeCompare(b.url)),
  };
  writeFileAtomicSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const siteUrl = process.env.GSC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL or NEXT_PUBLIC_SITE_URL is required.");

  const maxUrls = Math.min(parseNumberArg("max", 1_800), 1_950);
  const batchSize = Math.min(parseNumberArg("batch-size", 80), 100);
  const batchDelayMs = Math.max(parseNumberArg("batch-delay-ms", 10_000), 10_000);
  const publicDir = path.resolve(process.cwd(), "public");
  const source = path.join(publicDir, "sitemap.xml");
  const sitemapUrls = collectIndexNowUrlsFromPublicDir(publicDir).slice(0, maxUrls);
  const outputDir = path.resolve(process.cwd(), "data/analytics");
  const outputPath = path.join(outputDir, `index-status-${today()}.json`);
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = readExisting(outputPath);
  const recordsByUrl = new Map((existing?.records || []).map((record) => [record.url, record]));
  const pending = sitemapUrls.filter((url) => !recordsByUrl.has(url));
  const auth = await buildGoogleAuth();
  const searchConsole = google.searchconsole({ version: "v1", auth });

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    const records = await Promise.all(batch.map(async (url): Promise<IndexStatusRecord> => {
      const inspectedAt = new Date().toISOString();
      try {
        const response = await searchConsole.urlInspection.index.inspect({
          requestBody: { inspectionUrl: url, siteUrl, languageCode: "en-US" },
        });
        const status = response.data.inspectionResult?.indexStatusResult;
        return {
          url,
          inspectedAt,
          verdict: status?.verdict || "VERDICT_UNSPECIFIED",
          coverageState: status?.coverageState || "Unknown",
          robotsTxtState: status?.robotsTxtState || "ROBOTS_TXT_STATE_UNSPECIFIED",
          indexingState: status?.indexingState || "INDEXING_STATE_UNSPECIFIED",
          pageFetchState: status?.pageFetchState || "PAGE_FETCH_STATE_UNSPECIFIED",
          lastCrawlTime: status?.lastCrawlTime || null,
          googleCanonical: status?.googleCanonical || null,
          userCanonical: status?.userCanonical || null,
          crawledAs: status?.crawledAs || null,
          referringUrlCount: status?.referringUrls?.length || 0,
          sitemapCount: status?.sitemap?.length || 0,
        };
      } catch (error) {
        return {
          url,
          inspectedAt,
          verdict: "ERROR",
          coverageState: "Inspection request failed",
          robotsTxtState: "UNKNOWN",
          indexingState: "UNKNOWN",
          pageFetchState: "UNKNOWN",
          lastCrawlTime: null,
          googleCanonical: null,
          userCanonical: null,
          crawledAs: null,
          referringUrlCount: 0,
          sitemapCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));

    for (const record of records) recordsByUrl.set(record.url, record);
    if (start % (batchSize * 10) === 0 || start + batchSize >= pending.length) {
      writeExport(outputPath, siteUrl, path.relative(process.cwd(), source), sitemapUrls.length, Array.from(recordsByUrl.values()));
      console.log(`Inspected ${Math.min(start + batch.length, pending.length)}/${pending.length} pending URLs (${recordsByUrl.size} total cached).`);
    }
    if (start + batchSize < pending.length) await wait(batchDelayMs);
  }

  writeExport(outputPath, siteUrl, path.relative(process.cwd(), source), sitemapUrls.length, Array.from(recordsByUrl.values()));
  const records = Array.from(recordsByUrl.values());
  const verdictCounts = Object.fromEntries(Array.from(new Set(records.map((record) => record.verdict))).map((verdict) => [
    verdict,
    records.filter((record) => record.verdict === verdict).length,
  ]));
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    sitemapUrls: sitemapUrls.length,
    inspected: records.length,
    verdictCounts,
    aiCalls: 0,
  }, null, 2));
}

async function run(): Promise<void> {
  const lockPath = path.resolve(process.cwd(), "data/analytics/index-status.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let releaseLock: (() => void) | undefined;

  try {
    releaseLock = acquireProcessLock(lockPath);
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    releaseLock?.();
  }
}

void run();
