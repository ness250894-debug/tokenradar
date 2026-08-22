import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getTokenDetail,
  getTokenIdsWithArticle,
  getTokenMetrics,
  getPriceHistory,
  getArticle,
  getRelatedTokens,
  formatPrice,
  formatPercent,
  getCategoryIds,
  getPrimaryTokenCategory,
  getTokenSearchIntent,
  getTokenSearchIntentTrend,
} from "@/lib/content-loader";
import {
  buildEntitySeoTitle,
  buildSeoDescription,
  canonicalUrl,
  filterRenderableArticleTokenIds,
  isArticleIndexable,
  isTokenChildArticleIndexable,
  parseFaqsFromMarkdown,
} from "@/lib/seo";
import { markdownToHtml } from "@/lib/markdown";
import { PriceChart } from "@/components/PriceChart";
import TradingViewWidget from "@/components/TradingViewWidget";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { LastUpdated } from "@/components/LastUpdated";
import { ReadingProgress } from "@/components/ReadingProgress";
import { UnifiedTOC } from "@/components/UnifiedTOC";
import { ArticleEngagementTracker } from "@/components/ArticleEngagementTracker";
import { JsonLd } from "@/components/JsonLd";
import { ResearchRecirculation } from "@/components/ResearchRecirculation";
import { ResearchFreshnessNotice } from "@/components/ResearchFreshnessNotice";
import { SearchIntentRadar } from "@/components/SearchIntentRadar";
import { TokenSources } from "@/components/TokenSources";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";
import { buildArticleCompletionActions, buildTokenResearchActions } from "@/lib/research-actions";
import { getTokenTechnical } from "@/lib/token-technical-data";
import { buildAuthorPersonSchema, buildPublisherSchema } from "@/lib/schema-entities";
import { buildOpenGraphMetadata } from "@/lib/share-metadata";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const tokenIds = await getTokenIdsWithArticle("price-prediction");
  const renderableTokenIds = await filterRenderableArticleTokenIds(tokenIds, (tokenId) =>
    getArticle(tokenId, "price-prediction"),
  );
  return renderableTokenIds.map((token) => ({ token }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const [overview, article] = await Promise.all([
    getArticle(tokenId, "overview"),
    getArticle(tokenId, "price-prediction"),
  ]);
  const year = new Date().getFullYear();
  const title = buildEntitySeoTitle({
    name: detail.name,
    symbol: detail.symbol,
    after: ` Price Prediction ${year}`,
  });
  const description = buildSeoDescription(`Scenario-based price analysis for ${detail.name} (${detail.symbol.toUpperCase()}), using a ${formatPrice(detail.market.price)} data snapshot, ${formatPrice(detail.market.ath)} all-time high, risk metrics, and bull/base/bear assumptions.`);

  const ogImage = `/og/token/${detail.id}.png`;

  return {
    title,
    description,
    robots: {
      index: isTokenChildArticleIndexable(detail, overview, article),
      follow: true,
    },
    alternates: {
      canonical: `/${detail.id}/price-prediction`,
    },
    openGraph: buildOpenGraphMetadata({
      title,
      description,
      url: `/${detail.id}/price-prediction`,
      type: "article",
      imageUrl: ogImage,
      imageAlt: title,
    }),
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
  const searchIntent = await getTokenSearchIntent(tokenId);
  const searchIntentTrend = await getTokenSearchIntentTrend(tokenId);
  const priceHistory = await getPriceHistory(tokenId);
  const article = await getArticle(tokenId, "price-prediction");
  if (!isArticleIndexable(article)) notFound();
  const faqs = parseFaqsFromMarkdown(article.content);

  const tradingView = getPartner("tradingview");
  const technical = getTokenTechnical(tokenId);
  const overview = await getArticle(tokenId, "overview");
  const howToBuyArticle = await getArticle(tokenId, "how-to-buy");
  const hasHowToBuy = isTokenChildArticleIndexable(detail, overview, howToBuyArticle);
  const relatedTokens = await getRelatedTokens(tokenId, 1);

  const isPositive = detail.market.priceChange30d >= 0;
  const athGap = detail.market.athChangePercentage;
  const riskScore = metrics?.riskScore;
  const categoryIds = await getCategoryIds();
  const primaryCategory = getPrimaryTokenCategory(detail.categories, categoryIds, "");
  const researchActions = buildTokenResearchActions({
    tokenId,
    name: detail.name,
    symbol: detail.symbol,
    category: primaryCategory.name,
    categoryHref: primaryCategory.href,
    hasPricePrediction: true,
    hasHowToBuy,
    hasLedgerGuide: Boolean(technical),
  });
  const completionActions = buildArticleCompletionActions(
    {
      tokenId,
      name: detail.name,
      symbol: detail.symbol,
      category: primaryCategory.name,
      categoryHref: primaryCategory.href,
      hasPricePrediction: true,
      hasHowToBuy,
      hasLedgerGuide: Boolean(technical),
      relatedToken: relatedTokens[0],
    },
    "price-prediction",
  );

  return (
    <div className="container">
      <ReadingProgress />
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

        <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>
            Forecast Framework
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "var(--space-md)" }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: "var(--space-xs)", color: "var(--green)" }}>Upside case</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Strong liquidity, improving 30-day trend, and lower risk readings would support a constructive setup.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 800, marginBottom: "var(--space-xs)", color: "var(--yellow)" }}>Base case</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Use current price, ATH distance ({formatPercent(athGap, 1)}), and market rank to size expectations conservatively.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 800, marginBottom: "var(--space-xs)", color: "var(--red)" }}>Downside case</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Rising volatility, weak volume, or {riskScore ? `risk score moving materially above ${riskScore.toFixed(1)}` : "elevated risk readings"} should invalidate aggressive forecasts.
              </p>
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", marginTop: "var(--space-md)", marginBottom: 0 }}>
            TokenRadar treats predictions as scenarios, not guarantees. Recheck liquidity, trend, and network-specific risks before acting.
          </p>
        </div>

        <SearchIntentRadar
          intent={searchIntent}
          variant="compact"
          trend={searchIntentTrend}
          links={{
            hasPricePrediction: true,
            hasHowToBuy,
            hasLedgerGuide: Boolean(technical),
            categoryHref: primaryCategory.href,
            categoryName: primaryCategory.name,
          }}
        />

        <ResearchRecirculation
          title={`Validate the ${detail.symbol.toUpperCase()} forecast`}
          description="Pair the scenario view with execution, custody, and peer-comparison pages."
          items={researchActions.filter((item) => item.type !== "prediction")}
          pageType="token_article"
          tokenId={detail.id}
          articleType="price-prediction"
          moduleId="price-prediction-next-action"
          modulePosition="after_forecast_framework"
        />

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
            {tradingView && (
              <>
                <a 
                  href={tradingView.url} 
                  {...getPartnerLinkAttributes(tradingView, "price-prediction-chart")}
                  className="btn btn-primary"
                >
                  {tradingView.cta} &rarr;
                </a>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-sm)", marginBottom: 0 }}>
                  Paid link: TokenRadar may earn a commission. Check current TradingView plan terms before subscribing.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Article Content */}
        {article ? (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <ArticleEngagementTracker
              selector=".article-content"
              pageType="token_article"
              tokenId={detail.id}
              articleType="price-prediction"
            />
            <UnifiedTOC
              selector=".article-content"
              showDesktop={false}
              pageType="token_article"
              tokenId={detail.id}
              articleType="price-prediction"
            />
            <div className="article-layout-row">
              <div className="article-main-col">
                <ResearchFreshnessNotice contentUpdatedAt={article.generatedAt} marketDataAt={detail.fetchedAt} />
                <div className="article-content" dangerouslySetInnerHTML={{
                  __html: await markdownToHtml(article.content, {
                    name: detail.name,
                    symbol: detail.symbol,
                    id: detail.id,
                    price: detail.market.price,
                    marketCap: detail.market.marketCap,
                    marketCapRank: detail.market.marketCapRank,
                    priceChange24h: detail.market.priceChange24h,
                    imageUrl: detail.imageUrl
                  })
                }} />
                <div style={{ marginTop: "var(--space-lg)" }}>
                  <LastUpdated date={article.generatedAt} />
                </div>
                <ResearchRecirculation
                  title={`Next step after the ${detail.symbol.toUpperCase()} forecast`}
                  description="Continue into one focused follow-up instead of ending the session here."
                  items={completionActions}
                  pageType="token_article"
                  tokenId={detail.id}
                  articleType="price-prediction"
                  moduleId="price-prediction-article-end"
                  modulePosition="article_end"
                  variant="compact"
                />
              </div>
              <aside className="article-sidebar-col hidden lg:block">
                <div className="sidebar-sticky">
                  <UnifiedTOC
                    selector=".article-content"
                    showMobile={false}
                    pageType="token_article"
                    tokenId={detail.id}
                    articleType="price-prediction"
                  />
                  <ResearchRecirculation
                    title="Continue"
                    items={completionActions}
                    pageType="token_article"
                    tokenId={detail.id}
                    articleType="price-prediction"
                    moduleId="price-prediction-sidebar"
                    modulePosition="sidebar"
                    variant="compact"
                  />
                </div>
              </aside>
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

        <TokenSources tokenId={detail.id} links={detail.links} fetchedAt={detail.fetchedAt} />

        {/* Disclaimer */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <strong>Disclaimer:</strong> This analysis is for informational purposes only and does not constitute financial advice.
          Past performance is not indicative of future results. Cryptocurrency investments carry significant risk.
          Always do your own research (DYOR).
        </div>
      </section>

      <JsonLd
        id={`${detail.id}-price-prediction-article-jsonld`}
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `${detail.name} Price Prediction ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          description: `Data-driven price analysis for ${detail.name} (${detail.symbol.toUpperCase()}). Current price: ${formatPrice(detail.market.price)}, ATH: ${formatPrice(detail.market.ath)}.`,
          image: canonicalUrl(`/og/token/${detail.id}.png`),
          url: canonicalUrl(`/${detail.id}/price-prediction`),
          mainEntityOfPage: canonicalUrl(`/${detail.id}/price-prediction`),
          author: buildAuthorPersonSchema(),
          publisher: buildPublisherSchema(),
          datePublished: article.generatedAt,
          dateModified: article.generatedAt,
        }}
      />
      {faqs.length > 0 && (
        <JsonLd
          id={`${detail.id}-price-prediction-faq-jsonld`}
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faqs.map((faq) => ({
              "@type": "Question",
              "name": faq.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer,
              },
            })),
          }}
        />
      )}
      <JsonLd
        id={`${detail.id}-price-prediction-breadcrumb-jsonld`}
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://tokenradar.co/",
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": detail.name,
              "item": `https://tokenradar.co/${detail.id}`,
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": "Price Prediction",
              "item": `https://tokenradar.co/${detail.id}/price-prediction`,
            },
          ],
        }}
      />
    </div>
  );
}
