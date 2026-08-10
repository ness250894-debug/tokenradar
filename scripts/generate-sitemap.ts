/**
 * Sitemap Generator — Phase 4 (Index & Chunking)
 * Handles scaling to 30,000+ pages for Google Search Console.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { type UpcomingTge, getAllCategories, getTokenDetail, getArticle, getTokenIds } from "../src/lib/content-loader";
import { SEARCH_INTENT_LABELS, type SearchIntentType } from "../src/lib/search-intent";
import { getPilotTokenIds } from "../src/lib/token-technical-data";
import {
  choosePreferredTgeId,
  getSiteUrl,
  getTgeDuplicateKey,
  getTgeIndexDecision,
  isArticleIndexable,
  isTokenOverviewIndexable,
  type TgeRouteCandidate,
} from "../src/lib/seo";
import { writeFileAtomicSync } from "../src/lib/utils";

const DATA_DIR = path.resolve(__dirname, "../data");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const GLOSSARY_FILE = path.join(DATA_DIR, "glossary.json");
const SITE_URL = getSiteUrl();

interface SitemapEntry {
  url: string;
  lastmod: string;
  images?: { loc: string; title: string; }[];
}

interface GlossaryItem {
  slug: string;
  updatedAt?: string;
}

interface SitemapFile {
  filename: string;
  lastmod: string;
}

const FALLBACK_LASTMOD = "2026-01-01";

function toDateOnly(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString().split("T")[0];
}

function getGitSourceDate(relativePath: string): string | null {
  const repoRoot = path.resolve(__dirname, "..");
  try {
    const output = execFileSync("git", [
      "-c",
      `safe.directory=${repoRoot.replace(/\\/g, "/")}`,
      "log",
      "-1",
      "--format=%cs",
      "--",
      relativePath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(output) ? output : null;
  } catch {
    return null;
  }
}

function getSourceDate(relativePath: string, fallback: string): string {
  const gitDate = getGitSourceDate(relativePath);
  if (gitDate) return gitDate;

  const filePath = path.resolve(__dirname, "..", relativePath);
  try {
    return fs.statSync(filePath).mtime.toISOString().split("T")[0];
  } catch {
    return fallback;
  }
}

function getLatestLastmod(entries: SitemapEntry[], fallback: string): string {
  return entries.reduce((latest, entry) => entry.lastmod > latest ? entry.lastmod : latest, fallback);
}

async function getTokenDate(tokenId: string): Promise<string | null> {
  const detail = await getTokenDetail(tokenId);
  if (!detail) return null;
  const dateStr = detail.fetchedAt;
  return dateStr ? new Date(dateStr).toISOString().split("T")[0] : null;
}

async function getUpcomingTGEsLocal(): Promise<UpcomingTge[]> {
  if (!fs.existsSync(TGE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function getGlossaryItemsLocal(): Promise<GlossaryItem[]> {
  if (!fs.existsSync(GLOSSARY_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(GLOSSARY_FILE, "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is GlossaryItem => typeof item?.slug === "string" && item.slug.length > 0);
  } catch {
    return [];
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}

function generateXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      let imageTags = "";
      if (e.images && e.images.length > 0) {
        imageTags = "\n" + e.images.map((img) => `    <image:image>
      <image:loc>${img.loc}</image:loc>
      <image:title>${escapeXml(img.title)}</image:title>
    </image:image>`).join("\n");
      }
      return `  <url>
    <loc>${SITE_URL}${e.url}</loc>
    <lastmod>${e.lastmod}</lastmod>${imageTags}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

function writeSitemap(filename: string, entries: SitemapEntry[]): SitemapFile {
  const outPath = path.join(PUBLIC_DIR, filename);
  writeFileAtomicSync(outPath, generateXml(entries));
  console.log(`  ✓ Written ${filename} (${entries.length} URLs)`);
  return { filename, lastmod: getLatestLastmod(entries, FALLBACK_LASTMOD) };
}

async function main() {
  const tokenIds = await getTokenIds();
  const pilotIds = new Set(getPilotTokenIds());
  const fallbackDate = getSourceDate("package-lock.json", FALLBACK_LASTMOD);
  const registryDate = getSourceDate("data/_registry.json", fallbackDate);
  const upcomingDate = getSourceDate("data/upcoming-tges.json", fallbackDate);
  const glossaryDate = getSourceDate("data/glossary.json", fallbackDate);
  const sitemaps: SitemapFile[] = [];

  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Sitemap Index Engine — Scaling 30k+   ║");
  console.log("╚══════════════════════════════════════════╝");

  // 1. Sitemap: Main (Static + Categories + TGEs)
  const mainEntries: SitemapEntry[] = [
    { url: "/", lastmod: getSourceDate("src/app/page.tsx", fallbackDate) },
    { url: "/tokens", lastmod: registryDate },
    { url: "/tokens/all", lastmod: registryDate },
    { url: "/search-intent", lastmod: getSourceDate("data/search-intent.json", registryDate) },
    { url: "/upcoming", lastmod: upcomingDate },
    { url: "/learn", lastmod: glossaryDate },
    { url: "/research", lastmod: getSourceDate("data/_metrics_blob.json", registryDate) },
    { url: "/best-crypto-hardware-wallets", lastmod: getSourceDate("src/app/best-crypto-hardware-wallets/page.tsx", fallbackDate) },
    { url: "/crypto-tax-guide", lastmod: getSourceDate("src/app/crypto-tax-guide/page.tsx", fallbackDate) },
    { url: "/about", lastmod: getSourceDate("src/app/about/page.tsx", fallbackDate) },
    { url: "/authors/pavlo-nakonechnyi", lastmod: getSourceDate("src/app/authors/pavlo-nakonechnyi/page.tsx", fallbackDate) },
    { url: "/contact", lastmod: getSourceDate("src/app/contact/page.tsx", fallbackDate) },
    { url: "/privacy", lastmod: getSourceDate("src/app/privacy/page.tsx", fallbackDate) },
    { url: "/terms", lastmod: getSourceDate("src/app/terms/page.tsx", fallbackDate) },
    { url: "/disclaimer", lastmod: getSourceDate("src/app/disclaimer/page.tsx", fallbackDate) },
  ];

  const categories = await getAllCategories();
  categories.forEach(cat => {
    mainEntries.push({ url: `/category/${cat.id}`, lastmod: registryDate });
  });

  (Object.keys(SEARCH_INTENT_LABELS) as SearchIntentType[]).forEach(intent => {
    mainEntries.push({ url: `/search-intent/${intent}`, lastmod: getSourceDate("data/search-intent.json", registryDate) });
  });

  const tges = await getUpcomingTGEsLocal();
  const tgeCandidates: TgeRouteCandidate[] = await Promise.all(tges.map(async (tge) => ({
    tge,
    article: await getArticle(tge.id, "tge-preview"),
    hasLiveToken: tge.status === "released" && Boolean(await getTokenDetail(tge.id)),
  })));
  const tgeGroups = new Map<string, TgeRouteCandidate[]>();
  for (const candidate of tgeCandidates) {
    const duplicateKey = getTgeDuplicateKey(candidate.tge);
    const group = tgeGroups.get(duplicateKey) || [];
    group.push(candidate);
    tgeGroups.set(duplicateKey, group);
  }

  for (const candidate of tgeCandidates) {
    const duplicateKey = getTgeDuplicateKey(candidate.tge);
    const preferredTgeId = choosePreferredTgeId(tgeGroups.get(duplicateKey) || [candidate]) || candidate.tge.id;
    const decision = getTgeIndexDecision(candidate, preferredTgeId);
    if (!decision.indexable) continue;

    const date = toDateOnly(candidate.tge.lastVerifiedAt || candidate.tge.discoveredAt, upcomingDate);
    mainEntries.push({ url: `/upcoming/${candidate.tge.id}`, lastmod: date });
  }

  const glossaryItems = await getGlossaryItemsLocal();
  glossaryItems.forEach(item => {
    mainEntries.push({
      url: `/learn/${item.slug}`,
      lastmod: toDateOnly(item.updatedAt, glossaryDate),
    });
  });

  sitemaps.push(writeSitemap("sitemap-main.xml", mainEntries));

  // 2. Sitemap: Tokens (Overview, Prediction, Buy, Ledger)
  const tokenEntries: SitemapEntry[] = [];
  for (const id of tokenIds) {
    const tokenDate = (await getTokenDate(id)) || registryDate;
    const detail = await getTokenDetail(id);
    if (!detail) continue;

    // Filter thin content (SEO safety)
    const overview = await getArticle(id, "overview");
    if (isTokenOverviewIndexable(detail, overview)) {
      const overviewDate = toDateOnly(overview.generatedAt, tokenDate);
      const images: { loc: string; title: string; }[] = [];
      const cgImage = detail.imageUrl;
      if (cgImage) {
        const isAbsolute = cgImage.startsWith("http://") || cgImage.startsWith("https://");
        images.push({
          loc: isAbsolute ? cgImage : `${SITE_URL}${cgImage.startsWith("/") ? "" : "/"}${cgImage}`,
          title: `${detail.name} Logo`,
        });
      }
      images.push({
        loc: `${SITE_URL}/og/token/${id}.png`,
        title: `${detail.name} Price Analysis and Risk Chart`,
      });
      tokenEntries.push({ url: `/${id}`, lastmod: overviewDate, images });
    }

    const types = ["price-prediction", "how-to-buy"];
    for (const type of types) {
      const art = await getArticle(id, type);
      if (isArticleIndexable(art)) {
        const artDate = art.generatedAt ? new Date(art.generatedAt).toISOString().split("T")[0] : tokenDate;
        const artImages = [
          {
            loc: `${SITE_URL}/og/token/${id}.png`,
            title: `${detail.name} ${type === "price-prediction" ? "Price Prediction" : "How to Buy"} Chart`,
          }
        ];
        tokenEntries.push({ url: `/${id}/${type}`, lastmod: artDate, images: artImages });
      }
    }

    // Static Technical Guides (no .json artifact needed)
    if (pilotIds.has(id)) {
      tokenEntries.push({ url: `/${id}/transfer-to-ledger`, lastmod: tokenDate });
    }
  }

  // Chunk tokens if we ever exceed limit, for now single file is fine for ~200-500 tokens
  sitemaps.push(writeSitemap("sitemap-tokens.xml", tokenEntries));

  // 4. Generate Sitemap Index
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => `  <sitemap>
    <loc>${SITE_URL}/${s.filename}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>`).join("\n")}
</sitemapindex>`;

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  writeFileAtomicSync(path.join(PUBLIC_DIR, "sitemap.xml"), indexXml);
  console.log(`\n🏁 Sitemap Index generated: sitemap.xml (points to ${sitemaps.length} chunks)`);
}

main().catch(err => {
  console.error("❌ Sitemap generation failed:", err);
  process.exit(1);
});
