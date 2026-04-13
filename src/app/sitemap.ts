import { MetadataRoute } from "next";
import { getAllTokens } from "@/lib/content-loader";

/**
 * Dynamic Sitemap Generator (SEO Tier 1)
 * 
 * Strategy:
 * 1. Core Pages (Static)
 * 2. Token Hub Pages (Dynamic)
 * 3. High-Priority Comparisons (Top 50 tokens vs All tokens)
 * 
 * This prioritized approach (~12.5k URLs) builds authority without 
 * triggering 'Spam' flags or over-exhausting crawl budget.
 */
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const tokens = getAllTokens();
  const now = new Date();

  // 1. Static Core Pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/compare`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  // 2. Token Hub Pages
  const tokenPages: MetadataRoute.Sitemap = tokens.map((t) => ({
    url: `${siteUrl}/tokens/${t.id}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // 3. Programmatic Comparisons (Tier 1: Top 50 Cluster)
  // We prioritize pairings involving the top 50 ranked assets for 
  // high-intent search coverage while maintaining index quality.
  const top50 = [...tokens].sort((a, b) => a.rank - b.rank).slice(0, 50);
  const comparisonPages: MetadataRoute.Sitemap = [];

  for (const t1 of top50) {
    for (const t2 of tokens) {
      if (t1.id === t2.id) continue;
      
      comparisonPages.push({
        url: `${siteUrl}/compare/${t1.id}-vs-${t2.id}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [...staticPages, ...tokenPages, ...comparisonPages];
}
