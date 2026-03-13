/**
 * Sitemap Generator — builds sitemap.xml at build time.
 * Outputs to public/sitemap.xml so Next.js static export includes it.
 *
 * Usage: npx tsx scripts/generate-sitemap.ts
 * Called automatically during `npm run build` via prebuild script.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

/** Load token IDs from data directory. */
function getTokenIds(): string[] {
  const tokensDir = path.join(DATA_DIR, "tokens");
  if (!fs.existsSync(tokensDir)) return [];
  return fs
    .readdirSync(tokensDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

function buildSitemap(): string {
  const tokenIds = getTokenIds();
  const now = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", freq: "daily", priority: "1.0" },
    { url: "/about", freq: "monthly", priority: "0.7" },
    { url: "/disclaimer", freq: "yearly", priority: "0.3" },
    { url: "/privacy", freq: "yearly", priority: "0.3" },
    { url: "/terms", freq: "yearly", priority: "0.3" },
  ];

  const tokenPages = tokenIds.flatMap((id) => [
    { url: `/${id}`, freq: "daily", priority: "0.9" },
    { url: `/${id}/price-prediction`, freq: "weekly", priority: "0.8" },
    { url: `/${id}/how-to-buy`, freq: "monthly", priority: "0.7" },
  ]);

  const allPages = [...staticPages, ...tokenPages];

  const urls = allPages
    .map(
      (p) => `  <url>
    <loc>${SITE_URL}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
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
  const totalUrls = 5 + tokenCount * 3;

  console.log(`✓ Sitemap generated: ${outPath}`);
  console.log(`  ${totalUrls} URLs (5 static + ${tokenCount} tokens × 3)`);
}

main();
