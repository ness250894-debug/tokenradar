import type { Metadata } from "next";
import Link from "next/link";
import { Activity, DollarSign, TrendingUp } from "lucide-react";

import { formatCompact, getAllTokens } from "@/lib/content-loader";

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

        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-md)" }}>
          {tokens.map((token) => (
            <Link
              key={token.id}
              href={`/${token.id}`}
              className="card"
              style={{ display: "block", textDecoration: "none", color: "inherit", padding: "var(--space-md)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", alignItems: "baseline" }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{token.name}</strong>
                <span className="token-symbol" style={{ flexShrink: 0 }}>{token.symbol.toUpperCase()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", marginTop: "var(--space-sm)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                <span>Rank #{token.rank}</span>
                <span>{formatCompact(token.marketCap)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
