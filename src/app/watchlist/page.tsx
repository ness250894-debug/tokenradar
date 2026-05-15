import type { Metadata } from "next";

import { WatchlistPageClient } from "@/components/WatchlistPageClient";
import type { TokenCardData } from "@/components/TokenCard";
import { getAllTokens, getCategoryIds, getPrimaryTokenCategory, getSearchIntentDataset, getSearchIntentTrendMap, getTokenMetrics } from "@/lib/content-loader";
import { buildSearchIntentCardFields } from "@/lib/search-intent";

export const metadata: Metadata = {
  title: "Local Watchlist",
  description: "Your private device-local TokenRadar watchlist.",
  alternates: {
    canonical: "/watchlist",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default async function WatchlistPage() {
  const tokens = await getAllTokens();
  const categoryIds = await getCategoryIds();
  const searchIntentDataset = await getSearchIntentDataset();
  const searchIntentTrendMap = await getSearchIntentTrendMap();
  const tokenCards: TokenCardData[] = await Promise.all(tokens.map(async (token) => {
    const metrics = await getTokenMetrics(token.id);
    const category = getPrimaryTokenCategory(token.categories, categoryIds);
    const searchIntent = searchIntentDataset?.tokens[token.id];
    const searchIntentTrend = searchIntentTrendMap[token.id];
    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      imageUrl: token.imageUrl || token.image,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: category.name,
      categoryHref: category.href,
      ...buildSearchIntentCardFields(searchIntent, searchIntentTrend),
    };
  }));

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <div className="section-header">
          <h1>
            Local <span className="gradient-text">Watchlist</span>
          </h1>
          <p>Save tokens on this device for quick research in the website or installed PWA.</p>
        </div>

        <WatchlistPageClient tokens={tokenCards} />
      </section>
    </main>
  );
}
