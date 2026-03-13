import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTokenDetail,
  getTokenMetrics,
  getPriceHistory,
  getArticle,
  getTokenIds,
  formatPrice,
  formatCompact,
  formatSupply,
} from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { PriceChart } from "@/components/PriceChart";
import { LastUpdated } from "@/components/LastUpdated";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Generate static paths for all tokens with data. */
export async function generateStaticParams() {
  return getTokenIds().map((id) => ({ token: id }));
}

/** Dynamic metadata for SEO. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  return {
    title: `${detail.name} (${detail.symbol.toUpperCase()}) — Price, Analysis & Risk Score`,
    description: `Data-driven analysis of ${detail.name} (${detail.symbol.toUpperCase()}). Current price: ${formatPrice(detail.market.price)}, Market Cap: ${formatCompact(detail.market.marketCap)}, Risk Score and proprietary metrics.`,
  };
}

export default async function TokenPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = getTokenMetrics(tokenId);
  const priceHistory = getPriceHistory(tokenId);
  const article = getArticle(tokenId, "overview");

  const isPositive = detail.market.priceChange24h >= 0;

  return (
    <div className="container">
      <section className="section">
        {/* Breadcrumbs */}
        <nav style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-xl)" }}>
          <Link href="/" style={{ color: "var(--accent-secondary)" }}>Home</Link>
          {" / "}
          <span>{detail.name}</span>
        </nav>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-lg)" }}>
          <div>
            <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
              {detail.name}{" "}
              <span style={{ color: "var(--text-muted)" }}>{detail.symbol.toUpperCase()}</span>
            </h1>
            {detail.categories.length > 0 && (
              <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                {detail.categories.slice(0, 3).map((cat) => (
                  <span key={cat} className="badge badge-accent">{cat}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>
              {formatPrice(detail.market.price)}
            </div>
            <div className={isPositive ? "price-up" : "price-down"} style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
              {isPositive ? "▲" : "▼"} {Math.abs(detail.market.priceChange24h).toFixed(2)}% (24h)
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid" style={{ marginTop: "var(--space-xl)" }}>
          <div className="stat-card">
            <div className="stat-label">Market Cap</div>
            <div className="stat-value">{formatCompact(detail.market.marketCap)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">24h Volume</div>
            <div className="stat-value">{formatCompact(detail.market.volume24h)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Circulating Supply</div>
            <div className="stat-value">{formatSupply(detail.market.circulatingSupply)}</div>
            {detail.market.maxSupply && (
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                Max: {formatSupply(detail.market.maxSupply)}
              </div>
            )}
          </div>
          {metrics && <RiskScoreCard score={metrics.riskScore} />}
        </div>

        {/* Price Chart */}
        {priceHistory && priceHistory.chart30d.length > 0 && (
          <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
            <PriceChart
              data={priceHistory.chart30d}
              height={280}
              isPositive={isPositive}
              label="30-Day Price History"
            />
          </div>
        )}

        {/* Metrics Summary */}
        {metrics && (
          <div style={{ marginTop: "var(--space-xl)" }}>
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-md)" }}>
              TokenRadar <span className="gradient-text">Metrics</span>
            </h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Growth Potential</div>
                <div className="stat-value gradient-text">{metrics.growthPotentialIndex}/100</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Narrative Strength</div>
                <div className="stat-value gradient-text">{metrics.narrativeStrength}/100</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Value vs ATH</div>
                <div className="stat-value">{metrics.valueVsAth}%</div>
                <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                  ATH: {formatPrice(detail.market.ath)}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Volatility Index</div>
                <div className="stat-value">{metrics.volatilityIndex}/100</div>
              </div>
            </div>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
              {metrics.summary}
            </p>
          </div>
        )}

        {/* Article Links */}
        <div style={{ marginTop: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-md)" }}>
            Research & <span className="gradient-text">Analysis</span>
          </h2>
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            <Link href={`/${tokenId}/price-prediction`} className="card" style={{ display: "block" }}>
              <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>📈</div>
              <div style={{ fontWeight: 700 }}>Price Prediction 2026-2027</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                Data-driven price analysis and scenarios
              </div>
            </Link>
            <Link href={`/${tokenId}/how-to-buy`} className="card" style={{ display: "block" }}>
              <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>🛒</div>
              <div style={{ fontWeight: 700 }}>How to Buy {detail.name}</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                Step-by-step guide with exchange recommendations
              </div>
            </Link>
          </div>
        </div>

        {/* Article Content */}
        {article && (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <div className="article-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }} />
            <div style={{ marginTop: "var(--space-lg)" }}>
              <LastUpdated date={article.generatedAt} />
            </div>
          </div>
        )}

        {/* Data Attribution */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <strong>Data Source:</strong> CoinGecko API. Last fetched: {new Date(detail.fetchedAt).toLocaleDateString()}.
          All proprietary metrics (Risk Score, Growth Index) are computed by TokenRadar
          and should not be used as the sole basis for investment decisions.
        </div>
      </section>

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${detail.name} (${detail.symbol.toUpperCase()}) — Analysis & Risk Score`,
            description: detail.description,
            author: { "@type": "Organization", name: "TokenRadar", url: "https://tokenradar.co" },
            publisher: { "@type": "Organization", name: "TokenRadar" },
            dateModified: detail.fetchedAt,
          }),
        }}
      />
    </div>
  );
}



