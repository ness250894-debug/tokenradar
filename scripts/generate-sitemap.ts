/**
 * Sitemap Generator — builds sitemap.xml at build time.
 * Outputs to public/sitemap.xml so Next.js static export includes it.
 *
 * Features:
 * - Uses per-token `fetchedAt` dates for accurate `lastmod` values
 * - Reads article `generatedAt` dates for content pages
 * - Includes compare pages for top-20 token combinations
 *
 * Usage: npx tsx scripts/generate-sitemap.ts
 * Called automatically during `npm run build` via prebuild script.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

interface SitemapEntry {
  url: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

/** Load token IDs from data and content directories. */
function getTokenIds(): string[] {
  const tokensDir = path.join(DATA_DIR, "tokens");
  const ids = new Set<string>();

  if (fs.existsSync(tokensDir)) {
    fs.readdirSync(tokensDir)
      .filter((f) => f.endsWith(".json"))
      .forEach((f) => ids.add(f.replace(".json", "")));
  }

  if (fs.existsSync(contentDir())) {
    fs.readdirSync(contentDir()).forEach((dir) => {
      if (fs.statSync(path.join(contentDir(), dir)).isDirectory()) {
        ids.add(dir);
      }
    });
  }

  return Array.from(ids);
}

function contentDir(): string {
  return CONTENT_DIR;
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

function buildSitemap(): string {
  const tokenIds = getTokenIds();
  const now = new Date().toISOString().split("T")[0];

  // Static pages always use build date
  const entries: SitemapEntry[] = [
    { url: "/", lastmod: now, changefreq: "daily", priority: "1.0" },
    { url: "/about", lastmod: now, changefreq: "monthly", priority: "0.7" },
    { url: "/disclaimer", lastmod: now, changefreq: "yearly", priority: "0.3" },
    { url: "/privacy", lastmod: now, changefreq: "yearly", priority: "0.3" },
    { url: "/terms", lastmod: now, changefreq: "yearly", priority: "0.3" },
    { url: "/contact", lastmod: now, changefreq: "monthly", priority: "0.5" },
  ];

  // Token pages — use actual data dates
  for (const id of tokenIds) {
    const tokenDate = getTokenDate(id) || now;

    entries.push({
      url: `/${id}`,
      lastmod: tokenDate,
      changefreq: "daily",
      priority: "0.9",
    });

    const predictionDate = getArticleDate(id, "price-prediction") || tokenDate;
    entries.push({
      url: `/${id}/price-prediction`,
      lastmod: predictionDate,
      changefreq: "weekly",
      priority: "0.8",
    });

    const howToBuyDate = getArticleDate(id, "how-to-buy") || tokenDate;
    entries.push({
      url: `/${id}/how-to-buy`,
      lastmod: howToBuyDate,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  // Compare pages — top 20 tokens (matches generateStaticParams in compare/[slug]/page.tsx)
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

  const tokenCount = getTokenIds().length;
  const topTokens = Math.min(tokenCount, 20);
  const compareCount = (topTokens * (topTokens - 1)) / 2;
  const totalUrls = 6 + tokenCount * 3 + compareCount;

  console.log(`✓ Sitemap generated: ${outPath}`);
  console.log(`  ${totalUrls} URLs (6 static + ${tokenCount} tokens × 3 + ${compareCount} compare pages)`);
}

main();
