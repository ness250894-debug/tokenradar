/**
 * Sitemap Generator — Phase 4 (Index & Chunking)
 * Handles scaling to 30,000+ pages for Google Search Console.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { type UpcomingTge, getAllCategories, getTokenDetail, getArticle, getTokenIds } from "../src/lib/content-loader";
import { SEARCH_INTENT_LABELS, type SearchIntentType } from "../src/lib/search-intent";
import { getPilotTokenIds } from "../src/lib/token-technical-data";
import {
  choosePreferredTgeId,
  getSiteUrl,
  getTgeDuplicateKey,
  getTgeIndexDecision,
  isTokenChildArticleIndexable,
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
  lastmod?: string;
  images?: { loc: string; title: string; }[];
}

interface GlossaryItem {
  slug: string;
  updatedAt?: string;
}

/** Choose the newest dated content rendered on a page, ignoring absent or invalid inputs. */
export function latestContentDate(...values: (string | undefined | null)[]): string | undefined {
  const dates = values.filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .map((value) => new Date(value).toISOString().slice(0, 10));
  return dates.sort().at(-1);
}

export function getSourceDate(relativePath: string, repoRoot = path.resolve(__dirname, "..")): string | undefined {
  try {
    const runGit = (...args: string[]) => execFileSync("git", [
      "-c",
      `safe.directory=${repoRoot.replace(/\\/g, "/")}`,
      ...args,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // At a shallow boundary Git attributes every file to the checkout commit.
    if (runGit("rev-parse", "--is-shallow-repository") !== "false") return undefined;
    return latestContentDate(runGit("log", "-1", "--format=%cs", "--", relativePath));
  } catch {
    return undefined;
  }
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

export function escapeXml(unsafe: string): string {
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

export function generateXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      let imageTags = "";
      if (e.images && e.images.length > 0) {
        imageTags = "\n" + e.images.map((img) => `    <image:image>
      <image:loc>${escapeXml(img.loc)}</image:loc>
      <image:title>${escapeXml(img.title)}</image:title>
    </image:image>`).join("\n");
      }
      const lastmod = latestContentDate(e.lastmod);
      return `  <url>
    <loc>${escapeXml(`${SITE_URL}${e.url}`)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}${imageTags}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

function writeSitemap(filename: string, entries: SitemapEntry[]): string {
  const outPath = path.join(PUBLIC_DIR, filename);
  writeFileAtomicSync(outPath, generateXml(entries));
  console.log(`  ✓ Written ${filename} (${entries.length} URLs)`);
  return filename;
}

async function main() {
  const tokenIds = await getTokenIds();
  const pilotIds = new Set(getPilotTokenIds());
  const registryDate = getSourceDate("data/tokens.json");
  const upcomingDate = getSourceDate("data/upcoming-tges.json");
  const glossaryDate = getSourceDate("data/glossary.json");
  const intentDate = getSourceDate("data/search-intent.json");
  const sitemaps: string[] = [];

  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Sitemap Index Engine — Scaling 30k+   ║");
  console.log("╚══════════════════════════════════════════╝");

  // 1. Sitemap: Main (Static + Categories + TGEs)
  const mainEntries: SitemapEntry[] = [
    { url: "/", lastmod: latestContentDate(getSourceDate("src/app/page.tsx"), registryDate, upcomingDate, intentDate) },
    { url: "/tokens", lastmod: registryDate },
    { url: "/tokens/all", lastmod: registryDate },
    { url: "/search-intent", lastmod: intentDate },
    { url: "/upcoming", lastmod: upcomingDate },
    { url: "/learn", lastmod: glossaryDate },
    { url: "/research", lastmod: getSourceDate("data/metrics") },
    { url: "/best-crypto-hardware-wallets", lastmod: getSourceDate("src/app/best-crypto-hardware-wallets/page.tsx") },
    { url: "/crypto-tax-guide", lastmod: getSourceDate("src/app/crypto-tax-guide/page.tsx") },
    { url: "/about", lastmod: getSourceDate("src/app/about/page.tsx") },
    { url: "/authors/pavlo-nakonechnyi", lastmod: getSourceDate("src/app/authors/pavlo-nakonechnyi/page.tsx") },
    { url: "/contact", lastmod: getSourceDate("src/app/contact/page.tsx") },
    { url: "/privacy", lastmod: getSourceDate("src/app/privacy/page.tsx") },
    { url: "/terms", lastmod: getSourceDate("src/app/terms/page.tsx") },
    { url: "/disclaimer", lastmod: getSourceDate("src/app/disclaimer/page.tsx") },
  ];

  const categories = await getAllCategories();
  categories.forEach(cat => {
    mainEntries.push({ url: `/category/${cat.id}`, lastmod: registryDate });
  });

  (Object.keys(SEARCH_INTENT_LABELS) as SearchIntentType[]).forEach(intent => {
    mainEntries.push({ url: `/search-intent/${intent}`, lastmod: intentDate });
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

    const date = latestContentDate(candidate.tge.lastVerifiedAt, candidate.tge.discoveredAt, candidate.article?.generatedAt);
    mainEntries.push({ url: `/upcoming/${candidate.tge.id}`, lastmod: date });
  }

  const glossaryItems = await getGlossaryItemsLocal();
  glossaryItems.forEach(item => {
    mainEntries.push({
      url: `/learn/${item.slug}`,
      lastmod: latestContentDate(item.updatedAt),
    });
  });

  sitemaps.push(writeSitemap("sitemap-main.xml", mainEntries));

  // 2. Sitemap: Tokens (Overview, Prediction, Buy, Ledger)
  const tokenEntries: SitemapEntry[] = [];
  for (const id of tokenIds) {
    const detail = await getTokenDetail(id);
    if (!detail) continue;

    // Filter thin content (SEO safety)
    const overview = await getArticle(id, "overview");
    if (isTokenOverviewIndexable(detail, overview)) {
      const overviewDate = latestContentDate(overview.generatedAt, overview.updatedAt, detail.fetchedAt);
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
      if (isTokenChildArticleIndexable(detail, overview, art)) {
        const artDate = latestContentDate(art.generatedAt, art.updatedAt, detail.fetchedAt);
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
      tokenEntries.push({ url: `/${id}/transfer-to-ledger` });
    }
  }

  // Chunk tokens if we ever exceed limit, for now single file is fine for ~200-500 tokens
  sitemaps.push(writeSitemap("sitemap-tokens.xml", tokenEntries));

  // 4. Generate Sitemap Index
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(filename => `  <sitemap>
    <loc>${SITE_URL}/${filename}</loc>
  </sitemap>`).join("\n")}
</sitemapindex>`;

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  writeFileAtomicSync(path.join(PUBLIC_DIR, "sitemap.xml"), indexXml);
  console.log(`\n🏁 Sitemap Index generated: sitemap.xml (points to ${sitemaps.length} chunks)`);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  main().catch(err => {
    console.error("❌ Sitemap generation failed:", err);
    process.exit(1);
  });
}
