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
  getArticleFaqs,
} from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { PriceChart } from "@/components/PriceChart";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { LastUpdated } from "@/components/LastUpdated";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return getTokenIds().map((id) => ({ token: id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const title = `${detail.name} (${detail.symbol.toUpperCase()}) Price Prediction 2026-2027`;
  const description = `Data-driven price analysis for ${detail.name}. Current price: ${formatPrice(detail.market.price)}, ATH: ${formatPrice(detail.market.ath)}, Risk Score and growth scenarios.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${detail.id}/price-prediction`,
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

export default async function PricePredictionPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = getTokenMetrics(tokenId);
  const priceHistory = getPriceHistory(tokenId);
  const article = getArticle(tokenId, "price-prediction");
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
          {detail.name} <span className="gradient-text">Price Prediction</span> 2026–2027
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
              {detail.market.priceChange24h >= 0 ? "▲" : "▼"} {Math.abs(detail.market.priceChange24h).toFixed(2)}% (24h)
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">All-Time High</div>
            <div className="stat-value">{formatPrice(detail.market.ath)}</div>
            <div className="stat-change price-down">
              {detail.market.athChangePercentage.toFixed(1)}% from ATH
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">30-Day Change</div>
            <div className={`stat-value ${isPositive ? "price-up" : "price-down"}`}>
              {isPositive ? "+" : ""}{detail.market.priceChange30d.toFixed(2)}%
            </div>
          </div>
          {metrics && <RiskScoreCard score={metrics.riskScore} />}
        </div>

        {/* 1-Year Chart */}
        {priceHistory && priceHistory.chart1y.length > 0 && (
          <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
            <PriceChart
              data={priceHistory.chart1y}
              height={320}
              isPositive={detail.market.priceChange1y >= 0}
              label="1-Year Price History"
            />
          </div>
        )}

        {/* Article Content */}
        {article ? (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <div className="article-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }} />
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
            headline: `${detail.name} Price Prediction 2026-2027`,
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

