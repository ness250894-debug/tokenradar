import type { Metadata } from "next";

import { WatchlistPageClient } from "@/components/WatchlistPageClient";
import type { TokenCardData } from "@/components/TokenCard";
import { getAllTokens, getTokenMetrics } from "@/lib/content-loader";

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
  const tokenCards: TokenCardData[] = await Promise.all(tokens.map(async (token) => {
    const metrics = await getTokenMetrics(token.id);
    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      imageUrl: token.imageUrl || token.image,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: token.categories?.[0] || "Crypto",
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
