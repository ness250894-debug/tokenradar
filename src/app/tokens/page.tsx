import type { Metadata } from "next";
import { Activity, DollarSign, TrendingUp } from "lucide-react";

import { TokenGrid } from "@/components/TokenGrid";
import { type TokenCardData } from "@/components/TokenCard";
import { formatCompact, getAllTokens, getTokenMetrics } from "@/lib/content-loader";

export const metadata: Metadata = {
  title: "Crypto Token Directory",
  description: "Browse every cryptocurrency token tracked by TokenRadar with direct links to market data, analysis, risk scores, and research guides.",
  alternates: {
    canonical: "/tokens",
  },
};

export default async function TokensPage() {
  const tokens = await getAllTokens();
  const totalMarketCap = tokens.reduce((sum, token) => sum + (token.marketCap || 0), 0);
  const totalVolume = tokens.reduce((sum, token) => sum + (token.volume24h || 0), 0);
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
            Crypto <span className="gradient-text">Token Directory</span>
          </h1>
          <p>Every live TokenRadar profile, exposed as crawlable links for fast research and discovery.</p>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)", marginBottom: "var(--space-3xl)" }}>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">Tokens Tracked</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <Activity size={20} />
              {tokens.length}
            </div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">Combined Market Cap</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <DollarSign size={20} />
              {formatCompact(totalMarketCap)}
            </div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">24h Volume</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <TrendingUp size={20} />
              {formatCompact(totalVolume)}
            </div>
          </div>
        </div>

        <TokenGrid
          tokens={tokenCards}
          initialVisibleCount={12}
          searchPlaceholder="Search the token directory by name or symbol..."
        />
      </section>
    </main>
  );
}
