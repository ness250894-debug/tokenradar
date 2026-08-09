/**
 * Audit rendered static-export HTML for representative SEO checklist fields.
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { getSiteUrl } from "../src/lib/seo";
import { auditSeoHtml, decodeHtmlEntities } from "../src/lib/seo-render-audit";

interface CliOptions {
  outDir: string;
  maxPages: number;
}

function parseArgs(argv: string[]): CliOptions {
  const outDir = argv.find((arg) => !arg.startsWith("--")) || "out";
  const maxIndex = argv.indexOf("--max");
  const maxPages = maxIndex >= 0 && argv[maxIndex + 1] ? Number(argv[maxIndex + 1]) : Number.POSITIVE_INFINITY;
  return {
    outDir,
    maxPages: maxPages > 0 ? maxPages : Number.POSITIVE_INFINITY,
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

function normalizeUrl(value: string): string {
  const parsed = new URL(value);
  const pathname = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

function isIgnoredPublicArtifact(outDir: string, htmlPath: string): boolean {
  const relative = path.relative(outDir, htmlPath);
  const publicPath = path.join("public", relative);
  if (!fs.existsSync(path.resolve(process.cwd(), publicPath))) return false;

  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", publicPath], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function routeFromHtmlPath(outDir: string, htmlPath: string): string | null {
  const relative = path.relative(outDir, htmlPath).replace(/\\/g, "/");
  if (/^(?:404|500|_not-found)(?:\/index)?\.html$/i.test(relative)) return null;
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"/index.html".length)}`;
  if (relative.endsWith(".html")) return `/${relative.slice(0, -".html".length)}`;
  return null;
}

export function collectRenderedHtmlPages(outDir: string): Map<string, string> {
  const pages = new Map<string, string>();
  const pending = [outDir];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
      if (isIgnoredPublicArtifact(outDir, entryPath)) continue;
      const route = routeFromHtmlPath(outDir, entryPath);
      if (route) pages.set(route, entryPath);
    }
  }

  return pages;
}

function readTagContent(html: string, tag: "title" | "description" | "canonical"): string | null {
  if (tag === "title") {
    const value = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
    return value ? decodeHtmlEntities(value) : null;
  }
  const attr = tag === "description" ? "name=[\"']description[\"']" : "rel=[\"']canonical[\"']";
  const element = new RegExp(`<${tag === "canonical" ? "link" : "meta"}\\b[^>]*${attr}[^>]*>`, "i").exec(html)?.[0];
  if (!element) return null;
  const valueAttr = tag === "canonical" ? "href" : "content";
  const value = new RegExp(`${valueAttr}\\s*=\\s*[\"']([^\"']+)[\"']`, "i").exec(element)?.[1]?.trim();
  return value ? decodeHtmlEntities(value) : null;
}

function addDuplicateFailures(
  values: Map<string, string[]>,
  label: "title" | "description" | "canonical",
  failures: string[],
): void {
  for (const [value, urls] of values) {
    if (urls.length <= 1) continue;
    failures.push(`duplicate ${label} across ${urls.length} indexable pages: ${urls.join(", ")} (${value})`);
  }
}

export function runSeoQaCheck(options: CliOptions): string[] {
  const outDir = path.resolve(process.cwd(), options.outDir);
  if (!fs.existsSync(outDir)) {
    return [`Static export directory not found: ${outDir}`];
  }

  const sitemapDir = findSitemapDir(outDir);
  const sitemapUrls = new Set(collectIndexNowUrlsFromPublicDir(sitemapDir).map(normalizeUrl));
  const renderedPages = collectRenderedHtmlPages(outDir);
  const siteUrl = getSiteUrl();
  const renderedByUrl = new Map(Array.from(renderedPages, ([route, htmlPath]) => [normalizeUrl(`${siteUrl}${route === "/" ? "/" : route}`), htmlPath]));
  const urlsToAudit = Array.from(new Set([...sitemapUrls, ...renderedByUrl.keys()])).slice(0, options.maxPages);
  const failures: string[] = [];
  const duplicateTitles = new Map<string, string[]>();
  const duplicateDescriptions = new Map<string, string[]>();
  const duplicateCanonicals = new Map<string, string[]>();

  for (const url of urlsToAudit) {
    const htmlPath = renderedByUrl.get(url) || resolveHtmlPathForUrl(outDir, url);
    if (!fs.existsSync(htmlPath)) {
      failures.push(`${url}: missing rendered HTML at ${path.relative(process.cwd(), htmlPath)}`);
      continue;
    }

    const expectedIndexable = sitemapUrls.has(url);
    const html = fs.readFileSync(htmlPath, "utf-8");

    const result = auditSeoHtml({
      html,
      url,
      sitemapUrls,
      expectedIndexable,
    });

    for (const check of result.checks) {
      if (!check.passed) failures.push(`${url}: ${check.id} failed - ${check.message}`);
    }

    if (expectedIndexable) {
      for (const [label, values] of [
        ["title", duplicateTitles],
        ["description", duplicateDescriptions],
        ["canonical", duplicateCanonicals],
      ] as const) {
        const value = readTagContent(html, label);
        if (!value) continue;
        const urls = values.get(value) || [];
        urls.push(url);
        values.set(value, urls);
      }
    }
  }

  addDuplicateFailures(duplicateTitles, "title", failures);
  addDuplicateFailures(duplicateDescriptions, "description", failures);
  addDuplicateFailures(duplicateCanonicals, "canonical", failures);

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
