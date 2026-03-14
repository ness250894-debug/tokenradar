import Link from "next/link";
import { getAllTokens, formatPrice } from "@/lib/content-loader";

/**
 * Sidebar component displaying trending/highest-volume tokens.
 * Injected into the [token]/layout.tsx to improve internal linking and SEO.
 */
export function TrendingSidebar({ currentTokenId }: { currentTokenId: string }) {
  const allTokensList = getAllTokens();
  
  // Filter out the current token so we don't link to the page we are already on
  const otherTokens = allTokensList.filter(t => t.id !== currentTokenId);

  // 1. Top Gainers strategy (highest 24h % change)
  const topGainers = [...otherTokens]
    .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
    .slice(0, 3);

  // 2. High Volume strategy (highest 24h volume)
  const highVolume = [...otherTokens]
    .filter(t => !topGainers.find(g => g.id === t.id)) // Avoid duplicates
    // Since volume24h isn't directly on TokenSummary, we sort by marketCap as a proxy for liquidity
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 3);

  return (
    <aside className="trending-sidebar">
      {/* Top Gainers Module */}
      <div className="sidebar-module">
        <h3 className="sidebar-title">🔥 Top Gainers (24h)</h3>
        <div className="sidebar-list">
          {topGainers.map((token) => (
            <Link key={`gainer-${token.id}`} href={`/${token.id}`} className="sidebar-item">
              <div className="sidebar-item-header">
                <span style={{ fontWeight: 600 }}>{token.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{token.symbol.toUpperCase()}</span>
              </div>
              <div className="sidebar-item-price">
                <span>{formatPrice(token.price)}</span>
                <span className="price-up">+{token.priceChange24h.toFixed(2)}%</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* High Volume Module */}
      <div className="sidebar-module" style={{ marginTop: "var(--space-xl)" }}>
        <h3 className="sidebar-title">📊 Highest Volume</h3>
        <div className="sidebar-list">
          {highVolume.map((token) => (
            <Link key={`vol-${token.id}`} href={`/${token.id}`} className="sidebar-item">
              <div className="sidebar-item-header">
                <span style={{ fontWeight: 600 }}>{token.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{token.symbol.toUpperCase()}</span>
              </div>
              <div className="sidebar-item-price">
                <span>{formatPrice(token.price)}</span>
                <span className={token.priceChange24h >= 0 ? "price-up" : "price-down"}>
                  {token.priceChange24h >= 0 ? "+" : ""}{token.priceChange24h.toFixed(2)}%
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      
      {/* Small Promo Block */}
      <div className="sidebar-promo">
        <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>📈</div>
        <div style={{ fontWeight: 700, marginBottom: "var(--space-xs)" }}>AI Price Predictions</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
          Data-driven scenarios for 2026-2027 based on TokenRadar proprietary metrics.
        </div>
      </div>
    </aside>
  );
}
