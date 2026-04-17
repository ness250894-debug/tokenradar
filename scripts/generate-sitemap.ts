/**
 * Sitemap Generator — Phase 4 (Index & Chunking)
 * Handles scaling to 30,000+ pages for Google Search Console.
 */

import * as fs from "fs";
import * as path from "path";
import { type UpcomingTge, getAllCategories, getTokenDetail, getArticle, getAllTokens } from "../src/lib/content-loader";

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

interface SitemapEntry {
  url: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

/** Load token IDs from the consolidated registry. */
async function getTokenIds(): Promise<string[]> {
  const tokens = await getAllTokens();
  return tokens.map(t => t.id);
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

function generateXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => `  <url>
    <loc>${SITE_URL}${e.url}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function writeSitemap(filename: string, entries: SitemapEntry[]) {
  const outPath = path.join(PUBLIC_DIR, filename);
  fs.writeFileSync(outPath, generateXml(entries), "utf-8");
  console.log(`  ✓ Written ${filename} (${entries.length} URLs)`);
}

async function main() {
  const tokenIds = await getTokenIds();
  const now = new Date().toISOString().split("T")[0];
  const sitemaps: string[] = [];

  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Sitemap Index Engine — Scaling 30k+   ║");
  console.log("╚══════════════════════════════════════════╝");

  // 1. Sitemap: Main (Static + Categories + TGEs)
  const mainEntries: SitemapEntry[] = [
    { url: "/", lastmod: now, changefreq: "daily", priority: "1.0" },
    { url: "/upcoming", lastmod: now, changefreq: "daily", priority: "0.9" },
    { url: "/best-crypto-hardware-wallets", lastmod: now, changefreq: "weekly", priority: "0.8" },
    { url: "/crypto-tax-guide", lastmod: now, changefreq: "weekly", priority: "0.8" },
    { url: "/about", lastmod: now, changefreq: "monthly", priority: "0.5" },
  ];

  const categories = await getAllCategories();
  categories.forEach(cat => {
    mainEntries.push({ url: `/category/${cat.id}`, lastmod: now, changefreq: "daily", priority: "0.8" });
  });

  const tges = await getUpcomingTGEsLocal();
  tges.forEach(tge => {
    const date = tge.discoveredAt ? new Date(tge.discoveredAt).toISOString().split("T")[0] : now;
    if (fs.existsSync(path.join(CONTENT_DIR, tge.id, "tge-preview.json"))) {
      mainEntries.push({ url: `/upcoming/${tge.id}`, lastmod: date, changefreq: "weekly", priority: "0.8" });
    }
  });

  writeSitemap("sitemap-main.xml", mainEntries);
  sitemaps.push("sitemap-main.xml");

  // 2. Sitemap: Tokens (Overview, Prediction, Buy, Ledger)
  const tokenEntries: SitemapEntry[] = [];
  for (const id of tokenIds) {
    const tokenDate = (await getTokenDate(id)) || now;
    const detail = await getTokenDetail(id);
    if (!detail) continue;

    // Filter thin content (SEO safety)
    const overview = await getArticle(id, "overview");
    if (detail.market.volume24h > 100000 || (overview && overview.wordCount > 500)) {
      tokenEntries.push({ url: `/${id}`, lastmod: tokenDate, changefreq: "daily", priority: "0.9" });
    }

    const types = ["price-prediction", "how-to-buy", "transfer-to-ledger"];
    for (const type of types) {
      const art = await getArticle(id, type);
      if (art) {
        const artDate = art.generatedAt ? new Date(art.generatedAt).toISOString().split("T")[0] : tokenDate;
        tokenEntries.push({ url: `/${id}/${type}`, lastmod: artDate, changefreq: "weekly", priority: "0.7" });
      }
    }
  }

  // Chunk tokens if we ever exceed limit, for now single file is fine for ~200-500 tokens
  writeSitemap("sitemap-tokens.xml", tokenEntries);
  sitemaps.push("sitemap-tokens.xml");

  // 4. Generate Sitemap Index
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => `  <sitemap>
    <loc>${SITE_URL}/${s}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`).join("\n")}
</sitemapindex>`;

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), indexXml, "utf-8");
  console.log(`\n🏁 Sitemap Index generated: sitemap.xml (points to ${sitemaps.length} chunks)`);
}

main().catch(err => {
  console.error("❌ Sitemap generation failed:", err);
  process.exit(1);
});
