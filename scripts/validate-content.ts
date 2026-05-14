/**
 * Content Validation Script
 * 
 * Scans data/ and content/ directories to:
 * 1. Ensure all .json files are valid JSON.
 * 2. Detect Git conflict markers (<<<<<<<, =======, >>>>>>>).
 * 
 * This script is run during 'npm run prebuild' to prevent broken builds.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { evaluateArticleQuality } from "../src/lib/content-quality";
import { normalizeTge, type UpcomingTge } from "../src/lib/tge";

const SCAN_DIRS = [
  path.resolve(__dirname, "../data"),
  path.resolve(__dirname, "../content")
];

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_TOKENS_DIR = path.resolve(__dirname, "../content/tokens");
const QUEUE_DIR = path.join(DATA_DIR, "queue");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const CONFLICT_MARKERS = ["<<<<<<<", "=======", ">>>>>>>"];
const PLACEHOLDER_PATTERN = /\{\{[A-Z0-9_]+\}\}/g;
const OUTBOUND_URL_PATTERN = /https?:\/\/[^\s)\]>"']+/g;
const GENERATED_ARTICLE_SLUGS = new Set(["overview", "price-prediction", "how-to-buy", "tge-preview"]);
const BASE_ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "etherscan.io",
  "basescan.org",
  "bscscan.com",
  "polygonscan.com",
  "arbiscan.io",
  "optimistic.etherscan.io",
  "solscan.io",
  "runescan.io",
  "taostats.io",
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function trimUrlToken(value: string): string {
  return value.replace(/[.,;:!?]+$/g, "");
}

function collectUrlHosts(value: unknown, hosts: Set<string>): void {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        hosts.add(normalizeHost(url.hostname));
      }
    } catch {
      // Ignore non-URL strings.
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlHosts(item, hosts));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectUrlHosts(item, hosts));
  }
}

function getConfiguredAllowedHosts(): Set<string> {
  const configured = process.env.TOKENRADAR_ALLOWED_OUTBOUND_HOSTS || "";
  return new Set(
    configured
      .split(",")
      .map((host) => normalizeHost(host.trim()))
      .filter(Boolean),
  );
}

function getTokenIdForArticlePath(filePath: string): string | null {
  const normalized = path.resolve(filePath);
  for (const root of [CONTENT_TOKENS_DIR, QUEUE_DIR]) {
    const relative = path.relative(root, normalized);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      const [tokenId] = relative.split(path.sep);
      return tokenId || null;
    }
  }
  return null;
}

function getAllowedHostsForToken(tokenId: string | null): Set<string> {
  const hosts = new Set<string>([...BASE_ALLOWED_EXTERNAL_HOSTS, ...getConfiguredAllowedHosts()]);
  if (!tokenId) return hosts;

  const tokenPath = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
  if (!fs.existsSync(tokenPath)) return hosts;

  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
    collectUrlHosts(token?.links, hosts);
  } catch {
    // JSON validity is checked separately; keep link validation focused on policy.
  }

  return hosts;
}

function isAllowedExternalUrl(value: string, allowedHosts: Set<string>): boolean {
  try {
    const url = new URL(trimUrlToken(value));
    const host = normalizeHost(url.hostname);
    if (host === "tokenradar.co") return true;
    if (url.protocol !== "https:") return false;
    return allowedHosts.has(host);
  } catch {
    return false;
  }
}

export function findUnapprovedOutboundUrls(content: string, allowedHosts: Set<string>): string[] {
  const matches = Array.from(content.matchAll(OUTBOUND_URL_PATTERN), (match) => trimUrlToken(match[0]));
  const uniqueUrls = Array.from(new Set(matches));
  return uniqueUrls.filter((url) => !isAllowedExternalUrl(url, allowedHosts));
}

export function validateGeneratedArticleIntegrity(filePath: string, parsed: unknown): string[] {
  const slug = path.basename(filePath, ".json");
  if (!GENERATED_ARTICLE_SLUGS.has(slug)) return [];

  const tokenId = getTokenIdForArticlePath(filePath);
  if (!tokenId) return [];

  if (!parsed || typeof parsed !== "object") {
    return ["Generated article must be a JSON object"];
  }

  const article = parsed as {
    tokenId?: unknown;
    type?: unknown;
    slug?: unknown;
    title?: unknown;
    content?: unknown;
    wordCount?: unknown;
    generatedAt?: unknown;
  };
  const errors: string[] = [];

  if (typeof article.tokenId === "string" && article.tokenId !== tokenId) {
    errors.push(`Article tokenId "${article.tokenId}" does not match path token "${tokenId}"`);
  }

  if (typeof article.type === "string" && article.type !== slug) {
    errors.push(`Article type "${article.type}" does not match filename "${slug}.json"`);
  }

  if (typeof article.slug === "string" && article.slug !== slug) {
    errors.push(`Article slug "${article.slug}" does not match filename "${slug}.json"`);
  }

  if (typeof article.title !== "string" || article.title.trim().length === 0) {
    errors.push("Generated article title is empty");
  }

  if (typeof article.content !== "string" || article.content.trim().length === 0) {
    errors.push("Generated article content is empty");
  } else {
    const quality = evaluateArticleQuality({
      type: typeof article.type === "string" ? article.type : undefined,
      slug: typeof article.slug === "string" ? article.slug : slug,
      title: typeof article.title === "string" ? article.title : undefined,
      content: article.content,
    });
    const blockingQualityIssues = quality.issues.filter((issue) =>
      issue.startsWith("Repeated filler paragraphs") || issue.startsWith("Malformed Markdown table"),
    );
    errors.push(...blockingQualityIssues);
  }

  if (
    article.wordCount !== undefined &&
    (typeof article.wordCount !== "number" || !Number.isFinite(article.wordCount) || article.wordCount < 1)
  ) {
    errors.push("Generated article wordCount must be a positive number when present");
  }

  if (
    article.generatedAt !== undefined &&
    (typeof article.generatedAt !== "string" || Number.isNaN(Date.parse(article.generatedAt)))
  ) {
    errors.push("Generated article generatedAt must be a valid ISO date when present");
  }

  return errors;
}

function validateArticleOutboundUrls(filePath: string, parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { content?: unknown }).content !== "string") {
    return [];
  }

  const tokenId = getTokenIdForArticlePath(filePath);
  const allowedHosts = getAllowedHostsForToken(tokenId);
  return findUnapprovedOutboundUrls((parsed as { content: string }).content, allowedHosts)
    .map((url) => `Unapproved outbound URL: ${url}`);
}

function validateFile(filePath: string): { success: boolean; error?: string } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    
    // 1. Check for conflict markers
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      for (const marker of CONFLICT_MARKERS) {
        if (line.startsWith(marker)) {
          return {
            success: false,
            error: `Git conflict marker "${marker}" found at line ${i + 1}`
          };
        }
      }
    }

    // 2. Check for valid JSON
    if (filePath.endsWith(".json")) {
      const parsed = JSON.parse(content);
      const articleErrors = validateGeneratedArticleIntegrity(filePath, parsed);
      const outboundErrors = validateArticleOutboundUrls(filePath, parsed);
      const errors = [...articleErrors, ...outboundErrors];
      if (errors.length > 0) {
        return {
          success: false,
          error: errors.join("; ")
        };
      }
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

function getFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (path.basename(file) !== "logs") {
        results = results.concat(getFiles(file));
      }
    } else if (file.endsWith(".json")) {
      results.push(file);
    }
  });
  return results;
}

function validateTgePreviews(): string[] {
  const errors: string[] = [];
  const tgeIds = new Set<string>();

  if (fs.existsSync(TGE_FILE)) {
    const tges = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as { id?: string }[];
    for (const tge of tges) {
      if (tge.id) tgeIds.add(tge.id);
    }
  }

  const checkDir = (baseDir: string) => {
    if (!fs.existsSync(baseDir)) return;
    for (const tokenId of fs.readdirSync(baseDir)) {
      const previewPath = path.join(baseDir, tokenId, "tge-preview.json");
      if (fs.existsSync(previewPath) && !tgeIds.has(tokenId)) {
        errors.push(`${path.relative(process.cwd(), previewPath)} has no matching data/upcoming-tges.json entry`);
        continue;
      }

      if (fs.existsSync(previewPath)) {
        const raw = fs.readFileSync(previewPath, "utf-8");
        const placeholders = Array.from(new Set(raw.match(PLACEHOLDER_PATTERN) || []));
        if (placeholders.length > 0) {
          errors.push(`${path.relative(process.cwd(), previewPath)} contains unresolved TGE placeholders: ${placeholders.join(", ")}`);
        }
      }
    }
  };

  checkDir(CONTENT_TOKENS_DIR);
  checkDir(QUEUE_DIR);

  return errors;
}

function validateTgeDataset(): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(TGE_FILE)) return errors;

  let tges: UpcomingTge[] = [];
  try {
    tges = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as UpcomingTge[];
  } catch (e) {
    return [`data/upcoming-tges.json is invalid JSON: ${e instanceof Error ? e.message : String(e)}`];
  }

  const seenIds = new Set<string>();
  const seenNonGenericSymbols = new Map<string, string>();

  for (const rawTge of tges) {
    const tge = normalizeTge(rawTge);
    const label = rawTge.id || rawTge.name || "unknown TGE";

    if (!rawTge.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawTge.id)) {
      errors.push(`data/upcoming-tges.json has invalid id for ${label}`);
    }

    if (seenIds.has(rawTge.id)) {
      errors.push(`data/upcoming-tges.json has duplicate TGE id: ${rawTge.id}`);
    }
    seenIds.add(rawTge.id);

    if (!rawTge.name || !rawTge.category || !rawTge.expectedTge || !rawTge.dataSource) {
      errors.push(`data/upcoming-tges.json missing required fields for ${label}`);
    }

    if ((rawTge.narrativeStrength ?? -1) < 0 || (rawTge.narrativeStrength ?? 101) > 100) {
      errors.push(`data/upcoming-tges.json has invalid narrativeStrength for ${label}`);
    }

    if ((tge.confidence ?? -1) < 0 || (tge.confidence ?? 101) > 100) {
      errors.push(`data/upcoming-tges.json has invalid confidence for ${label}`);
    }

    if (!tge.signals || tge.signals.length === 0) {
      errors.push(`data/upcoming-tges.json has no evidence signals for ${label}`);
    }

    const symbol = (tge.symbol || "").toUpperCase();
    if (symbol && !["TBD", "TBA", "N/A", "NA", "UNKNOWN"].includes(symbol)) {
      const existing = seenNonGenericSymbols.get(symbol);
      if (existing && existing !== tge.id) {
        errors.push(`data/upcoming-tges.json reuses symbol ${symbol} for ${existing} and ${tge.id}`);
      }
      seenNonGenericSymbols.set(symbol, tge.id);
    }
  }

  return errors;
}

function main() {
  console.log("Checking content integrity...");
  let failCount = 0;
  let totalCount = 0;

  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = getFiles(dir);
    for (const file of files) {
      totalCount++;
      const result = validateFile(file);
      if (!result.success) {
        failCount++;
        console.error(`\u274C ${path.relative(process.cwd(), file)}: ${result.error}`);
      }
    }
  }

  const tgeErrors = validateTgePreviews();
  for (const error of tgeErrors) {
    failCount++;
    console.error(`\u274C ${error}`);
  }

  const tgeDatasetErrors = validateTgeDataset();
  for (const error of tgeDatasetErrors) {
    failCount++;
    console.error(`\u274C ${error}`);
  }

  if (failCount > 0) {
    console.error(`\nValidation failed: Found ${failCount} corrupted files among ${totalCount} checked.`);
    process.exit(1);
  } else {
    console.log(`\u2705 Content integrity verified successfully (${totalCount} files).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
