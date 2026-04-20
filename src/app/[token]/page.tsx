import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTokenDetail,
  getTokenMetrics,
  getPriceHistory,
  getArticle,
  getAllTokens,
  formatPrice,
  formatCompact,
  formatSupply,
  getArticleFaqs,
  getRelatedTokens,
  formatPercent,
} from "@/lib/content-loader";
import { getTokenTechnical } from "@/lib/token-technical-data";
import { markdownToHtml } from "@/lib/markdown";
import { slugify } from "@/lib/shared-utils";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { PriceChart } from "@/components/PriceChart";
import { LastUpdated } from "@/components/LastUpdated";
import { TokenTickerPill } from "@/components/TokenTickerPill";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { ProfitCalculator } from "@/components/ProfitCalculator";
import { SentimentPoll } from "@/components/SentimentPoll";
import { ReadingProgress } from "@/components/ReadingProgress";
import { CountUp } from "@/components/CountUp";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CardGlare } from "@/components/CardGlare";
import { StickyConversionHeader } from "@/components/StickyConversionHeader";
import { TaxGuideCTA } from "@/components/TaxGuideCTA";
import { HardwareWalletCTA } from "@/components/HardwareWalletCTA";
import { 
  Globe, 
  BarChart2, 
  PieChart, 
  TrendingUp, 
  ShoppingCart,
  Bell,
  Lock
} from "lucide-react";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Enable ISR — missing tokens generate on first request. */
export const dynamicParams = false;

/** Revalidate pages at most once per hour. */

/** Generate static paths for all tokens to ensure 100% SEO availability and prevent production 404s. */
export async function generateStaticParams() {
  const tokens = await getAllTokens();
  return tokens.map((t) => ({ token: t.id }));
}

/** Dynamic metadata for SEO. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const title = `${detail.name} (${detail.symbol.toUpperCase()}) — Price, Analysis & Risk Score`;
  const description = `Data-driven analysis of ${detail.name} (${detail.symbol.toUpperCase()}). Current price: ${formatPrice(detail.market.price)}, Market Cap: ${formatCompact(detail.market.marketCap)}, Risk Score and proprietary metrics.`;

  const article = await getArticle(tokenId, "overview");
  const isLowQuality = (detail.market.volume24h < 10000) || (detail.market.marketCap < 100000 && (!article || article.wordCount < 300));



  const ogImage = `/api/og/token/${detail.id}`;

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
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function TokenPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = await getTokenMetrics(tokenId);
  const priceHistory = await getPriceHistory(tokenId);
  const technical = getTokenTechnical(tokenId);
  const article = await getArticle(tokenId, "overview");
  const faqs = article ? getArticleFaqs(article.content) : [];
  
  const relatedTokensList = await getRelatedTokens(tokenId, 3);
  const relatedTokens: TokenCardData[] = await Promise.all(relatedTokensList.map(async (token) => {
    const rMetrics = await getTokenMetrics(token.id);
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
  }));

  const isPositive = detail.market.priceChange24h >= 0;
  const hasPricePrediction = !!(await getArticle(tokenId, "price-prediction"));
  const hasHowToBuy = !!(await getArticle(tokenId, "how-to-buy"));

  return (
    <div className="container">
      <StickyConversionHeader 
        title={detail.name} 
        symbol={detail.symbol.toUpperCase()} 
        price={formatPrice(detail.market.price).replace("$", "")} 
        actionText="Track Alerts" 
      />
      <ReadingProgress />
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-lg)" }} id="market-stats">
          <div>
            <TokenTickerPill 
              name={detail.name} 
              symbol={detail.symbol} 
              id={detail.id}
              price={detail.market.price} 
              className="pill-lg"
            />
            {detail.categories.length > 0 && (
              <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                {detail.categories.slice(0, 3).map((cat) => (
                  <Link 
                    key={cat} 
                    href={`/category/${slugify(cat)}`} 
                    className="badge badge-accent hover-scale"
                  >
                    {cat}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>
              {formatPrice(detail.market.price)}
            </div>
            <div className={isPositive ? "price-up" : "price-down"} style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
              {formatPercent(detail.market.priceChange24h)} (24h)
            </div>
            <div style={{ marginTop: "var(--space-md)", display: "flex", justifyContent: "flex-end" }}>
              <MagneticEffect>
                 <a href="https://t.me/TokenRadarCo" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
                   <Bell size={16} /> Track Alerts
                 </a>
              </MagneticEffect>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid" style={{ marginTop: "var(--space-xl)" }}>
          <div className="stat-card">
            <Globe className="stat-watermark" />
            <div className="stat-label">Market Cap</div>
            <div className="stat-value">
              <CountUp end={detail.market.marketCap} prefix="$" compact={true} />
            </div>
          </div>
          <div className="stat-card">
            <BarChart2 className="stat-watermark" />
            <div className="stat-label">24h Volume</div>
            <div className="stat-value">
              <CountUp end={detail.market.volume24h} prefix="$" compact={true} />
            </div>
          </div>
          <div className="stat-card">
            <PieChart className="stat-watermark" />
            <div className="stat-label">Circulating Supply</div>
            <div className="stat-value">
              <CountUp end={detail.market.circulatingSupply} compact={true} />
            </div>
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
          <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }} id="price-chart">
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
          <div style={{ marginTop: "var(--space-xl)" }} id="radar-metrics">
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-md)" }}>
              TokenRadar <span className="gradient-text">Metrics</span>
            </h2>
            <div className="stats-grid">
              <div className="stat-card-premium">
                <div className="stat-label">Growth Potential</div>
                <div className="stat-value gradient-text">{metrics.growthPotentialIndex}/100</div>
              </div>
              <div className="stat-card-premium">
                <div className="stat-label">Narrative Strength</div>
                <div className="stat-value gradient-text">{metrics.narrativeStrength}/100</div>
              </div>
              <div className="stat-card-premium">
                <div className="stat-label">Value vs ATH</div>
                <div className="stat-value">{metrics.valueVsAth}%</div>
                <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                  ATH: {formatPrice(detail.market.ath)}
                </div>
              </div>
              <div className="stat-card-premium">
                <div className="stat-label">Volatility Index</div>
                <div className="stat-value">{metrics.volatilityIndex}/100</div>
              </div>
            </div>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
              {metrics.summary}
            </p>
          </div>
        )}

        {/* Hybrid Inline CTAs */}
        <HardwareWalletCTA symbol={detail.symbol} name={detail.name} variant="inline" />
        <TaxGuideCTA symbol={detail.symbol} name={detail.name} variant="inline" />

        {/* Interactive Engagement */}
        <div style={{ marginTop: "var(--space-2xl)" }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div style={{ height: "100%" }}>
             <ProfitCalculator currentPrice={detail.market.price} atl={detail.market.atl} />
           </div>
           <CardGlare style={{ height: "100%" }}>
             <SentimentPoll tokenId={detail.id} />
           </CardGlare>
        </div>


        {/* Article Links */}
        <div style={{ marginTop: "var(--space-2xl)" }} id="research-guides">
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
            Research & <span className="gradient-text">Analysis</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-md)" }}>
            {hasPricePrediction && (
              <CardGlare style={{ height: "100%" }}>
                <Link href={`/${tokenId}/price-prediction`} className="card" style={{ display: "block", height: "100%" }}>
                  <TrendingUp size={32} className="gradient-text" style={{ marginBottom: "var(--space-sm)", color: "var(--accent-primary)" }} />
                  <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Price Prediction {new Date().getFullYear()}-{new Date().getFullYear() + 1}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                    Data-driven price analysis and scenarios
                  </div>
                </Link>
              </CardGlare>
            )}
            {hasHowToBuy && (
              <CardGlare style={{ height: "100%" }}>
                <Link href={`/${tokenId}/how-to-buy`} className="card" style={{ display: "block", height: "100%" }}>
                  <ShoppingCart size={32} className="gradient-text" style={{ marginBottom: "var(--space-sm)", color: "var(--accent-primary)" }} />
                  <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>How to Buy {detail.name}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                    Step-by-step guide with exchange recommendations
                  </div>
                </Link>
              </CardGlare>
            )}
            {technical && (
              <CardGlare style={{ height: "100%" }}>
                <Link href={`/${tokenId}/transfer-to-ledger`} className="card" style={{ display: "block", height: "100%", border: "1px solid rgba(16, 185, 129, 0.4)" }}>
                  <Lock size={32} style={{ marginBottom: "var(--space-sm)", color: "#10b981" }} />
                  <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Transfer to Ledger Guide</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                    Verified security steps for {technical.network} storage
                  </div>
                </Link>
              </CardGlare>
            )}
          </div>
        </div>

        {/* Article Content & TOC */}
        {article && (
          <div className="article-layout-row">
            {/* Main Content */}
            <div className="article-main-col">
              <div className="article-content" dangerouslySetInnerHTML={{ 
                __html: await markdownToHtml(article.content, {
                  name: detail.name,
                  symbol: detail.symbol,
                  price: detail.market.price,
                  marketCap: detail.market.marketCap,
                  marketCapRank: detail.market.marketCapRank,
                  priceChange24h: detail.market.priceChange24h,
                  imageUrl: detail.id ? `/token-icons/${detail.id}.png` : undefined
                }) 
              }} />
              <div style={{ marginTop: "var(--space-lg)" }}>
                <LastUpdated date={article.generatedAt} />
              </div>
            </div>
            
            <aside className="article-sidebar-col hidden lg-block">
              <div 
                className="sidebar-sticky"
                style={{ 
                  position: "sticky", 
                  top: "100px",
                  maxHeight: "calc(100vh - 120px)",
                  overflowY: "auto",
                  paddingRight: "var(--space-xs)"
                }}
              >
                <div style={{ marginTop: "var(--space-xl)" }}>
                  <HardwareWalletCTA symbol={detail.symbol} name={detail.name} variant="sidebar" />
                  <TaxGuideCTA symbol={detail.symbol} name={detail.name} variant="sidebar" />
                </div>
              </div>
              <style dangerouslySetInnerHTML={{__html: `
                .sidebar-sticky::-webkit-scrollbar {
                  width: 4px;
                }
                .sidebar-sticky::-webkit-scrollbar-thumb {
                  background-color: var(--border-color);
                  border-radius: 4px;
                }
              `}} />
            </aside>
          </div>
        )}

        {/* Data Attribution */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-sm)", color: "var(--text-muted)", display: "flex", gap: "var(--space-lg)", alignItems: "center" }}>
          <div style={{ fontSize: "2.5rem", flexShrink: 0, opacity: 0.8 }} className="animate-pulse">
            🛡️
          </div>
          <div>
            <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "var(--space-xs)" }}>Verified by TokenRadar Engine</strong>
            <span style={{ display: "block", marginBottom: "var(--space-xs)" }}>Data Source: CoinGecko API. Last fetched: {new Date(detail.fetchedAt).toLocaleDateString()}.</span>
            <span>All proprietary metrics (Risk Score, Growth Index) are computed dynamically by TokenRadar and should not be used as the sole basis for investment decisions.</span>
          </div>
        </div>


        
        {/* Related Tokens */}
        {relatedTokens.length > 0 && (
          <div style={{ marginTop: "var(--space-4xl)" }} id="related-tokens">
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-lg)", borderBottom: "1px solid var(--border-color)", paddingBottom: "var(--space-sm)" }}>
              Explore Related Tokens
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            author: { 
              "@type": "Person", 
              name: "Pavlo Nakonechnyi", 
              url: "https://www.linkedin.com/in/pavlo-nakonechnyi-633966402/" 
            },
            reviewedBy: {
              "@type": "Person",
              "name": "Pavlo Nakonechnyi",
              "jobTitle": "Lead Researcher",
              "url": "https://www.linkedin.com/in/pavlo-nakonechnyi-633966402/"
            },
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
            "license": "https://creativecommons.org/licenses/by-nc/4.0/",
            "creator": {
               "@type": "Organization",
               "name": "TokenRadar",
               "url": "https://tokenradar.co"
            },
            "variableMeasured": ["price", "marketCap", "riskScore", "growthPotential"]
          }),
        }}
      />
    </div>
  );
}



