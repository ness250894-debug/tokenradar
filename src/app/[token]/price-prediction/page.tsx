import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getTokenDetail,
  getTokenIds,
  getTokenMetrics,
  getPriceHistory,
  getArticle,
  formatPrice,
  formatPercent,
  getArticleFaqs,
} from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { PriceChart } from "@/components/PriceChart";
import TradingViewWidget from "@/components/TradingViewWidget";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { LastUpdated } from "@/components/LastUpdated";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const tokenIds = await getTokenIds();
  return tokenIds.map((token) => ({ token }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const article = await getArticle(tokenId, "price-prediction");
  const year = new Date().getFullYear();
  const title = `${detail.name} (${detail.symbol.toUpperCase()}) Price Prediction ${year}-${year + 1}`;
  const description = `Data-driven price analysis for ${detail.name}. Current price: ${formatPrice(detail.market.price)}, ATH: ${formatPrice(detail.market.ath)}, Risk Score and growth scenarios.`;

  const ogImage = `/og/token/${detail.id}.png`;

  return {
    title,
    description,
    robots: {
      index: !!article,
      follow: true,
    },
    alternates: {
      canonical: `/${detail.id}/price-prediction`,
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

export default async function PricePredictionPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = await getTokenMetrics(tokenId);
  const priceHistory = await getPriceHistory(tokenId);
  const article = await getArticle(tokenId, "price-prediction");
  const faqs = article ? getArticleFaqs(article.content) : [];

  const isPositive = detail.market.priceChange30d >= 0;

  return (
    <div className="container">
      <section className="section">
        {/* Breadcrumbs */}
        <nav style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-xl)" }}>
          <Link href="/" style={{ color: "var(--accent-secondary)" }}>Home</Link>
          {" / "}
          <Link href={`/${tokenId}`} style={{ color: "var(--accent-secondary)" }}>{detail.name}</Link>
          {" / "}
          <span>Price Prediction</span>
        </nav>

        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
          {detail.name} <span className="gradient-text">Price Prediction</span> {new Date().getFullYear()}–{new Date().getFullYear() + 1}
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-md)", fontSize: "var(--text-lg)", maxWidth: 680 }}>
          Data-driven analysis based on historical trends, market position, and TokenRadar&apos;s proprietary metrics.
        </p>

        {/* Key Stats */}
        <div className="stats-grid" style={{ marginTop: "var(--space-xl)" }}>
          <div className="stat-card">
            <div className="stat-label">Current Price</div>
            <div className="stat-value">{formatPrice(detail.market.price)}</div>
            <div className={`stat-change ${detail.market.priceChange24h >= 0 ? "price-up" : "price-down"}`}>
              {formatPercent(detail.market.priceChange24h)} (24h)
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">All-Time High</div>
            <div className="stat-value">{formatPrice(detail.market.ath)}</div>
            <div className="stat-change price-down">
              {formatPercent(detail.market.athChangePercentage, 1)} from ATH
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">30-Day Change</div>
            <div className={`stat-value ${isPositive ? "price-up" : "price-down"}`}>
              {formatPercent(detail.market.priceChange30d)}
            </div>
          </div>
          {metrics && <RiskScoreCard score={metrics.riskScore} />}
        </div>

        {/* 1-Year Historical Chart (Native Fallback) */}
        {priceHistory && priceHistory.chart1y.length > 0 && (
          <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
              1-Year Price History
            </h2>
            <PriceChart
              data={priceHistory.chart1y}
              height={320}
              isPositive={detail.market.priceChange1y >= 0}
              label={`${detail.symbol.toUpperCase()} Price`}
            />
          </div>
        )}

        {/* Advanced Technical Chart */}
        <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
            Advanced Technical Chart
          </h2>
          <TradingViewWidget symbol={detail.symbol} />
          
          {/* Compliant CTA Banner directly below the widget */}
          <div style={{ marginTop: "var(--space-md)", background: "var(--surface-color)", padding: "var(--space-lg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>Chart data provided by TradingView</p>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-md)" }}>Want these advanced MACD and RSI indicators for your own trades?</p>
            <a 
              href="https://www.tradingview.com/?aff_id=165531" 
              target="_blank" 
              rel="noopener noreferrer sponsored"
              className="btn btn-primary"
            >
              Try TradingView Pro for 30 Days Free &rarr;
            </a>
          </div>
        </div>

        {/* Article Content */}
        {article ? (
          <div style={{ marginTop: "var(--space-2xl)" }}>
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
        ) : (
          <div className="card" style={{ marginTop: "var(--space-2xl)", textAlign: "center", padding: "var(--space-3xl)" }}>
            <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>📊</div>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
              Analysis Coming Soon
            </h2>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              Our AI-powered price analysis for {detail.name} is being generated.
              Check back soon for a comprehensive data-driven report.
            </p>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <strong>Disclaimer:</strong> This analysis is for informational purposes only and does not constitute financial advice.
          Past performance is not indicative of future results. Cryptocurrency investments carry significant risk.
          Always do your own research (DYOR).
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${detail.name} Price Prediction ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
            description: `Data-driven price analysis for ${detail.name} (${detail.symbol.toUpperCase()}). Current price: ${formatPrice(detail.market.price)}, ATH: ${formatPrice(detail.market.ath)}.`,
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
            datePublished: article?.generatedAt || detail.fetchedAt,
            dateModified: article?.generatedAt || detail.fetchedAt,
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
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": "Price Prediction",
                "item": `https://tokenradar.co/${detail.id}/price-prediction`
              }
            ]
          }),
        }}
      />
    </div>
  );
}
