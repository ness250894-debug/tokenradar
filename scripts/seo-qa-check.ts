/**
 * Audit rendered static-export HTML for representative SEO checklist fields.
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { auditSeoHtml } from "../src/lib/seo-render-audit";

interface CliOptions {
  outDir: string;
  maxPages: number;
}

function parseArgs(argv: string[]): CliOptions {
  const outDir = argv.find((arg) => !arg.startsWith("--")) || "out";
  const maxIndex = argv.indexOf("--max");
  const maxPages = maxIndex >= 0 && argv[maxIndex + 1] ? Number(argv[maxIndex + 1]) : 50;
  return {
    outDir,
    maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 50,
  };
}

export function resolveHtmlPathForUrl(outDir: string, url: string): string {
  const pathname = new URL(url).pathname;
  if (pathname === "/") return path.join(outDir, "index.html");

  const relativePath = pathname.replace(/^\/+/, "");
  const candidates = [
    path.join(outDir, relativePath, "index.html"),
    path.join(outDir, `${relativePath}.html`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function findSitemapDir(outDir: string): string {
  return fs.existsSync(path.join(outDir, "sitemap.xml")) ? outDir : path.resolve(process.cwd(), "public");
}

export function runSeoQaCheck(options: CliOptions): string[] {
  const outDir = path.resolve(process.cwd(), options.outDir);
  if (!fs.existsSync(outDir)) {
    return [`Static export directory not found: ${outDir}`];
  }

  const sitemapDir = findSitemapDir(outDir);
  const sitemapUrls = new Set(collectIndexNowUrlsFromPublicDir(sitemapDir).map((url) => {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "")}`;
  }));
  const urlsToAudit = Array.from(sitemapUrls).slice(0, options.maxPages);
  const failures: string[] = [];

  for (const url of urlsToAudit) {
    const htmlPath = resolveHtmlPathForUrl(outDir, url);
    if (!fs.existsSync(htmlPath)) {
      failures.push(`${url}: missing rendered HTML at ${path.relative(process.cwd(), htmlPath)}`);
      continue;
    }

    const result = auditSeoHtml({
      html: fs.readFileSync(htmlPath, "utf-8"),
      url,
      sitemapUrls,
      expectedIndexable: true,
    });

    for (const check of result.checks) {
      if (!check.passed) failures.push(`${url}: ${check.id} failed - ${check.message}`);
    }
  }

  return failures;
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  const failures = runSeoQaCheck(parseArgs(process.argv.slice(2)));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }
  console.log("Rendered SEO QA checks passed.");
}
