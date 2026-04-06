/**
 * Sitemap Generator — builds sitemap.xml at build time.
 * Outputs to public/sitemap.xml so Next.js static export includes it.
 *
 * Features:
 * - Uses per-token `fetchedAt` dates for accurate `lastmod` values
 * - Reads article `generatedAt` dates for content pages
 * - Includes compare pages for top-20 token combinations
 * - Includes TGE pages
 *
 * Usage: npx tsx scripts/generate-sitemap.ts
 */

import * as fs from "fs";
import * as path from "path";
import { type UpcomingTge, getAllCategories, getTokenDetail, getArticle } from "../src/lib/content-loader";

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

/**
 * Load token IDs from data and content directories.
 * Excludes upcoming TGEs that lack real market data (same filter as content-loader).
 */
function getTokenIds(): string[] {
  const tokensDir = path.join(DATA_DIR, "tokens");
  const ids = new Set<string>();

  if (fs.existsSync(tokensDir)) {
    fs.readdirSync(tokensDir)
      .filter((f) => f.endsWith(".json"))
      .forEach((f) => ids.add(f.replace(".json", "")));
  }

  if (fs.existsSync(CONTENT_DIR)) {
    fs.readdirSync(CONTENT_DIR).forEach((dir) => {
      if (fs.statSync(path.join(CONTENT_DIR, dir)).isDirectory()) {
        ids.add(dir);
      }
    });
  }

  // Exclude upcoming TGE tokens without real market data
  const upcomingTgeIds = new Set<string>();
  const tges = getUpcomingTGEs();
  tges
    .filter((t: UpcomingTge) => t.status !== "released")
    .forEach((t: UpcomingTge) => upcomingTgeIds.add(t.id));

  return Array.from(ids).filter((id) => {
    if (!upcomingTgeIds.has(id)) return true;
    const tokenFile = path.join(tokensDir, `${id}.json`);
    if (!fs.existsSync(tokenFile)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      return data.market?.price > 0 && data.market?.marketCap > 0;
    } catch {
      return false;
    }
  });
}

/** Read the `fetchedAt` date from a token's data file. */
function getTokenDate(tokenId: string): string | null {
  const file = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const dateStr = raw.fetchedAt || raw.lastMarketUpdate;
    if (!dateStr) return null;
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/** Read the `generatedAt` date from a content article. */
function getArticleDate(tokenId: string, slug: string): string | null {
  const file = path.join(CONTENT_DIR, tokenId, `${slug}.json`);
  if (!fs.existsSync(file)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!raw.generatedAt) return null;
    return new Date(raw.generatedAt).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/** Load upcoming TGEs. */
function getUpcomingTGEs(): UpcomingTge[] {
  if (!fs.existsSync(TGE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function buildSitemap(): string {
  const tokenIds = getTokenIds();
  const now = new Date().toISOString().split("T")[0];

  // Static pages
  const entries: SitemapEntry[] = [
    { url: "/", lastmod: now, changefreq: "daily", priority: "1.0" },
    { url: "/upcoming", lastmod: now, changefreq: "daily", priority: "0.9" },
    { url: "/about", lastmod: now, changefreq: "monthly", priority: "0.7" },
    { url: "/contact", lastmod: now, changefreq: "monthly", priority: "0.5" },
    { url: "/disclaimer", lastmod: now, changefreq: "yearly", priority: "0.3" },
    { url: "/privacy", lastmod: now, changefreq: "yearly", priority: "0.3" },
    { url: "/terms", lastmod: now, changefreq: "yearly", priority: "0.3" },
  ];

  // Token pages
  for (const id of tokenIds) {
    const tokenDate = getTokenDate(id) || now;
    const detail = getTokenDetail(id);

    // If detail cannot be loaded, there's no page
    if (!detail) continue;

    const overviewArticle = getArticle(id, "overview");
    const isLowQuality = (detail.market.volume24h < 500000) || (overviewArticle && overviewArticle.wordCount < 800);

    if (!isLowQuality) {
      entries.push({
        url: `/${id}`,
        lastmod: tokenDate,
        changefreq: "daily",
        priority: "0.9",
      });
    }

    const predictionArticle = getArticle(id, "price-prediction");
    if (predictionArticle) {
      const predictionDate = predictionArticle.generatedAt ? new Date(predictionArticle.generatedAt).toISOString().split("T")[0] : tokenDate;
      entries.push({
        url: `/${id}/price-prediction`,
        lastmod: predictionDate,
        changefreq: "weekly",
        priority: "0.8",
      });
    }

    const howToBuyArticle = getArticle(id, "how-to-buy");
    if (howToBuyArticle) {
      const howToBuyDate = howToBuyArticle.generatedAt ? new Date(howToBuyArticle.generatedAt).toISOString().split("T")[0] : tokenDate;
      entries.push({
        url: `/${id}/how-to-buy`,
        lastmod: howToBuyDate,
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  }

  // TGE Pages
  const tges = getUpcomingTGEs();
  for (const tge of tges) {
    const tgeDate = tge.discoveredAt ? new Date(tge.discoveredAt).toISOString().split("T")[0] : now;
    if (fs.existsSync(path.join(CONTENT_DIR, tge.id, "tge-preview.json"))) {
      entries.push({
        url: `/upcoming/${tge.id}`,
        lastmod: tgeDate,
        changefreq: "weekly",
        priority: "0.8",
      });
    }
  }

  // Category Pages
  const categories = getAllCategories();
  for (const cat of categories) {
    entries.push({
      url: `/category/${cat.id}`,
      lastmod: now,
      changefreq: "daily",
      priority: "0.8",
    });
  }

  // Compare pages
  const topIds = tokenIds.slice(0, 20);
  for (let i = 0; i < topIds.length; i++) {
    for (let j = i + 1; j < topIds.length; j++) {
      const dateA = getTokenDate(topIds[i]) || now;
      const dateB = getTokenDate(topIds[j]) || now;
      const latestDate = dateA > dateB ? dateA : dateB;

      entries.push({
        url: `/compare/${topIds[i]}-vs-${topIds[j]}`,
        lastmod: latestDate,
        changefreq: "weekly",
        priority: "0.6",
      });
    }
  }

  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${SITE_URL}${e.url}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function main() {
  const sitemap = buildSitemap();
  const outPath = path.join(PUBLIC_DIR, "sitemap.xml");

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  fs.writeFileSync(outPath, sitemap, "utf-8");
  console.log(`✓ Sitemap generated: ${outPath}`);
}

main();
