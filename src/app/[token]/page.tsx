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
  getArticleFaqs,
  getRelatedTokens,
} from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { PriceChart } from "@/components/PriceChart";
import { LastUpdated } from "@/components/LastUpdated";
import { TokenTickerPill } from "@/components/TokenTickerPill";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { ProfitCalculator } from "@/components/ProfitCalculator";
import { SentimentPoll } from "@/components/SentimentPoll";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Reject unknown tokens at build time — returns 404 for unregistered slugs. */
export const dynamicParams = false;

/** Generate static paths for all tokens with data. */
export async function generateStaticParams() {
  return getTokenIds().map((id) => ({ token: id }));
}

/** Dynamic metadata for SEO. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const title = `${detail.name} (${detail.symbol.toUpperCase()}) — Price, Analysis & Risk Score`;
  const description = `Data-driven analysis of ${detail.name} (${detail.symbol.toUpperCase()}). Current price: ${formatPrice(detail.market.price)}, Market Cap: ${formatCompact(detail.market.marketCap)}, Risk Score and proprietary metrics.`;

  const article = getArticle(tokenId, "overview");
  const isLowQuality = (detail.market.volume24h < 500000) || (article && article.wordCount < 800);

  return {
    title,
    description,
    robots: isLowQuality ? { index: false, follow: true } : { index: true, follow: true },
    alternates: {
      canonical: `/${detail.id}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function TokenPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = getTokenMetrics(tokenId);
  const priceHistory = getPriceHistory(tokenId);
  const article = getArticle(tokenId, "overview");
  const faqs = article ? getArticleFaqs(article.content) : [];
  
  const relatedTokensList = getRelatedTokens(tokenId, 3);
  const relatedTokens: TokenCardData[] = relatedTokensList.map((token) => {
    const rMetrics = getTokenMetrics(token.id);
    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      riskScore: rMetrics?.riskScore || 5,
      category: detail?.categories?.[0] || "Crypto",
    };
  });

  const isPositive = detail.market.priceChange24h >= 0;
  const hasPricePrediction = !!getArticle(tokenId, "price-prediction");
  const hasHowToBuy = !!getArticle(tokenId, "how-to-buy");

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
        <h1 style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0 }}>
          {detail.name} ({detail.symbol.toUpperCase()}) Analysis, Price & Risk Score
        </h1>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-lg)" }}>
          <div>
            <TokenTickerPill 
              name={detail.name} 
              symbol={detail.symbol} 
              price={detail.market.price} 
              className="pill-lg"
            />
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

        {/* Interactive Engagement */}
        <div style={{ marginTop: "var(--space-2xl)" }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <ProfitCalculator tokenName={detail.name} symbol={detail.symbol} currentPrice={detail.market.price} atl={detail.market.atl} />
           <SentimentPoll tokenId={detail.id} />
        </div>

        {/* Article Links */}
        <div style={{ marginTop: "var(--space-2xl)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
            Research & <span className="gradient-text">Analysis</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-md)" }}>
            {hasPricePrediction && (
              <Link href={`/${tokenId}/price-prediction`} className="card" style={{ display: "block" }}>
                <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-sm)" }}>📈</div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Price Prediction 2026-2027</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                  Data-driven price analysis and scenarios
                </div>
              </Link>
            )}
            {hasHowToBuy && (
              <Link href={`/${tokenId}/how-to-buy`} className="card" style={{ display: "block" }}>
                <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-sm)" }}>🛒</div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>How to Buy {detail.name}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                  Step-by-step guide with exchange recommendations
                </div>
              </Link>
            )}
            {!hasPricePrediction && !hasHowToBuy && (
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                Deep-dive AI analysis and prediction models for {detail.name} are currently being generated. Check back soon.
              </p>
            )}
          </div>
        </div>

        {/* Article Content */}
        {article && (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <div className="article-content" dangerouslySetInnerHTML={{ 
              __html: markdownToHtml(article.content, {
                name: detail.name,
                symbol: detail.symbol,
                price: detail.market.price,
                imageUrl: detail.id ? `/token-icons/${detail.id}.png` : undefined // Assuming standard icon path
              }) 
            }} />
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
        
        {/* Related Tokens */}
        {relatedTokens.length > 0 && (
          <div style={{ marginTop: "var(--space-4xl)" }}>
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-lg)", borderBottom: "1px solid var(--border-color)", paddingBottom: "var(--space-sm)" }}>
              Explore Related Tokens
            </h2>
            <div className="stats-grid">
              {relatedTokens.map((t) => (
                <TokenCard key={t.id} token={t} />
              ))}
            </div>
          </div>
        )}
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
            image: "https://tokenradar.co/og-image.png",
            author: { "@type": "Organization", name: "TokenRadar", url: "https://tokenradar.co" },
            publisher: { 
              "@type": "Organization", 
              name: "TokenRadar",
              logo: {
                "@type": "ImageObject",
                url: "https://tokenradar.co/icon.png"
              }
            },
            datePublished: article?.generatedAt || detail.genesisDate || detail.fetchedAt,
            dateModified: detail.fetchedAt,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ExchangeRateSpecification",
            currency: "USD",
            currentExchangeRate: {
              "@type": "UnitPriceSpecification",
              price: detail.market.price,
              priceCurrency: "USD"
            }
          }),
        }}
      />
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map(faq => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: faq.answer
                }
              }))
            }),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://tokenradar.co/"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": detail.name,
                "item": `https://tokenradar.co/${detail.id}`
              }
            ]
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": `${detail.name} Market Data & Proprietary Metrics`,
            "description": `Comprehensive market dataset for ${detail.name} including price history, market capitalization, volume, and TokenRadar Risk Score.`,
            "creator": {
               "@type": "Organization",
               "name": "TokenRadar"
            },
            "variableMeasured": ["price", "marketCap", "riskScore", "growthPotential"]
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FinancialProduct",
            "name": `${detail.name} (${detail.symbol.toUpperCase()})`,
            "description": detail.description || `Cryptocurrency asset ${detail.symbol.toUpperCase()}`,
            "provider": {
              "@type": "Organization",
              "name": "TokenRadar Data Analytics"
            },
            "aggregateRating": metrics ? {
              "@type": "AggregateRating",
              "ratingValue": ((100 - metrics.riskScore) / 20).toFixed(1),
              "reviewCount": 1,
              "bestRating": "5",
              "worstRating": "1"
            } : undefined
          }),
        }}
      />
    </div>
  );
}



