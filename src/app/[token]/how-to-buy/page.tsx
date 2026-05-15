import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getTokenDetail,
  getTokenIdsWithArticle,
  getTokenMetrics,
  getArticle,
  getRelatedTokens,
  formatPrice,
  formatCompact,
  getCategoryIds,
  getPrimaryTokenCategory,
} from "@/lib/content-loader";
import { filterIndexableArticleTokenIds, isArticleIndexable } from "@/lib/seo";
import { markdownToHtml } from "@/lib/markdown";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { ExchangeReferralPanel } from "@/components/ExchangeReferralPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { ReadingProgress } from "@/components/ReadingProgress";
import { UnifiedTOC } from "@/components/UnifiedTOC";
import { ArticleEngagementTracker } from "@/components/ArticleEngagementTracker";
import { JsonLd } from "@/components/JsonLd";
import { ResearchRecirculation } from "@/components/ResearchRecirculation";
import { buildArticleCompletionActions, buildTokenResearchActions } from "@/lib/research-actions";
import { getTokenTechnical } from "@/lib/token-technical-data";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const tokenIds = await getTokenIdsWithArticle("how-to-buy");
  const indexableTokenIds = await filterIndexableArticleTokenIds(tokenIds, (tokenId) =>
    getArticle(tokenId, "how-to-buy"),
  );
  return indexableTokenIds.map((token) => ({ token }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const article = await getArticle(tokenId, "how-to-buy");
  const title = `How to Buy ${detail.name} (${detail.symbol.toUpperCase()}) - Where to Buy, Fees & Wallets`;
  const description = `Learn where and how to buy ${detail.name} (${detail.symbol.toUpperCase()}), compare venue checks, fees, payment methods, custody, and key risks before investing.`;

  const ogImage = `/og/token/${detail.id}.png`;

  return {
    title,
    description,
    robots: {
      index: isArticleIndexable(article),
      follow: true,
    },
    alternates: {
      canonical: `/${detail.id}/how-to-buy`,
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

export default async function HowToBuyPage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) notFound();

  const metrics = await getTokenMetrics(tokenId);
  const article = await getArticle(tokenId, "how-to-buy");
  if (!isArticleIndexable(article)) notFound();
  const pricePredictionArticle = await getArticle(tokenId, "price-prediction");
  const relatedTokens = await getRelatedTokens(tokenId, 1);
  const technical = getTokenTechnical(tokenId);
  const categoryIds = await getCategoryIds();
  const primaryCategory = getPrimaryTokenCategory(detail.categories, categoryIds, "");
  const researchActions = buildTokenResearchActions({
    tokenId,
    name: detail.name,
    symbol: detail.symbol,
    category: primaryCategory.name,
    categoryHref: primaryCategory.href,
    hasPricePrediction: isArticleIndexable(pricePredictionArticle),
    hasHowToBuy: true,
    hasLedgerGuide: Boolean(technical),
  });
  const completionActions = buildArticleCompletionActions(
    {
      tokenId,
      name: detail.name,
      symbol: detail.symbol,
      category: primaryCategory.name,
      categoryHref: primaryCategory.href,
      hasPricePrediction: isArticleIndexable(pricePredictionArticle),
      hasHowToBuy: true,
      hasLedgerGuide: Boolean(technical),
      relatedToken: relatedTokens[0],
    },
    "how-to-buy",
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
          <span>How to Buy</span>
        </nav>

        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
          How to Buy <span className="gradient-text">{detail.name}</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-md)", fontSize: "var(--text-lg)", maxWidth: 680 }}>
          Step-by-step guide to checking {detail.symbol.toUpperCase()} markets, regional eligibility, custody, and key risks before buying.
        </p>

        {/* Quick Stats */}
        <div className="stats-grid" style={{ marginTop: "var(--space-xl)" }}>
          <div className="stat-card">
            <div className="stat-label">Current Price</div>
            <div className="stat-value">{formatPrice(detail.market.price)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Market Cap</div>
            <div className="stat-value">{formatCompact(detail.market.marketCap)}</div>
          </div>
          {metrics && <RiskScoreCard score={metrics.riskScore} />}
        </div>

        <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>
            Check Before You Buy
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "var(--space-md)" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: "var(--space-xs)" }}>Verify the listing</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Confirm the exact {detail.symbol.toUpperCase()} market, contract, and trading pair before sending funds.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: "var(--space-xs)" }}>Check local eligibility</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Exchange access, KYC rules, and product availability vary by jurisdiction.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: "var(--space-xs)" }}>Plan custody and taxes</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>
                Decide whether to self-custody and keep records before placing your first order.
              </p>
            </div>
          </div>
        </div>

        <ResearchRecirculation
          title={`Complete the ${detail.symbol.toUpperCase()} buying research`}
          description="Use the checklist with risk, custody, tax, and scenario pages before treating venue access as enough context."
          items={researchActions.filter((item) => item.type !== "buy")}
          pageType="token_article"
          tokenId={detail.id}
          articleType="how-to-buy"
          moduleId="how-to-buy-next-action"
          modulePosition="after_buy_checks"
        />

        <ExchangeReferralPanel symbol={detail.symbol} tokenName={detail.name} />

        <div className="card" style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>
            Buying Checklist
          </h2>
          <ol style={{ display: "grid", gap: "var(--space-md)", margin: 0, paddingLeft: "1.25rem", color: "var(--text-secondary)" }}>
            <li>
              <strong style={{ color: "var(--text-primary)" }}>Choose a legally available venue.</strong>{" "}
              Confirm the exchange serves your country or state and supports the exact {detail.symbol.toUpperCase()} market.
            </li>
            <li>
              <strong style={{ color: "var(--text-primary)" }}>Review payment method and fees.</strong>{" "}
              Compare card, bank, wire, spread, withdrawal fee, and minimum order rules before funding the account.
            </li>
            <li>
              <strong style={{ color: "var(--text-primary)" }}>Verify the trading pair and network.</strong>{" "}
              Check the ticker, contract, and withdrawal network before placing or moving an order.
            </li>
            <li>
              <strong style={{ color: "var(--text-primary)" }}>Plan custody before buying.</strong>{" "}
              Decide whether the position stays on an exchange temporarily or moves to a wallet after a small test transfer.
            </li>
          </ol>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-md)", marginBottom: 0 }}>
            Paid links are labeled near each button. TokenRadar may earn a commission, but listings, fees, and eligibility must be verified directly with the provider.
          </p>
        </div>

        {/* Article Content */}
        {article ? (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <ArticleEngagementTracker
              selector=".article-content"
              pageType="token_article"
              tokenId={detail.id}
              articleType="how-to-buy"
            />
            <UnifiedTOC
              selector=".article-content"
              showDesktop={false}
              pageType="token_article"
              tokenId={detail.id}
              articleType="how-to-buy"
            />
            <div className="article-layout-row">
              <div className="article-main-col">
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
                  title={`Keep researching ${detail.symbol.toUpperCase()}`}
                  description="Move from execution checks into custody, risk, and peer comparison."
                  items={completionActions}
                  pageType="token_article"
                  tokenId={detail.id}
                  articleType="how-to-buy"
                  moduleId="how-to-buy-article-end"
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
                    articleType="how-to-buy"
                  />
                  <ResearchRecirculation
                    title="Continue"
                    items={completionActions}
                    pageType="token_article"
                    tokenId={detail.id}
                    articleType="how-to-buy"
                    moduleId="how-to-buy-sidebar"
                    modulePosition="sidebar"
                    variant="compact"
                  />
                </div>
              </aside>
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginTop: "var(--space-2xl)", textAlign: "center", padding: "var(--space-3xl)" }}>
            <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>🛒</div>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
              Buying Guide Coming Soon
            </h2>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              Our detailed buying guide for {detail.name} is being prepared.
              In the meantime, use the market links above to verify listings and local eligibility.
            </p>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <strong>Disclaimer:</strong> This guide is for informational purposes only. Cryptocurrency investments
          carry significant risk. Always do your own research before purchasing any cryptocurrency.
          Some exchange links on this page are paid links. TokenRadar may earn a commission at no extra cost to you. See our{" "}
          <Link href="/disclaimer" style={{ color: "var(--accent-secondary)" }}>disclaimer</Link> for details.
        </div>
      </section>

      <JsonLd
        id={`${detail.id}-how-to-buy-jsonld`}
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: `How to Buy ${detail.name} (${detail.symbol.toUpperCase()}) - Where to Buy Guide`,
          description: `Where and how to buy ${detail.name}: check markets, fees, eligibility, payment methods, and custody before buying.`,
          step: [
            { "@type": "HowToStep", name: "Choose a legally available venue", text: `Confirm the exchange serves your jurisdiction and supports the exact ${detail.symbol.toUpperCase()} market.` },
            { "@type": "HowToStep", name: "Review payment method and fees", text: "Compare card, bank, wire, spread, withdrawal fee, and minimum order rules before funding the account." },
            { "@type": "HowToStep", name: "Verify the trading pair and network", text: `Check the ${detail.symbol.toUpperCase()} ticker, contract, and withdrawal network before placing or moving an order.` },
            { "@type": "HowToStep", name: "Plan custody before buying", text: "Decide whether the position stays on an exchange temporarily or moves to a wallet after a small test transfer." },
          ],
        }}
      />
      <JsonLd
        id={`${detail.id}-how-to-buy-breadcrumb-jsonld`}
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
              "name": "How to Buy",
              "item": `https://tokenradar.co/${detail.id}/how-to-buy`,
            },
          ],
        }}
      />
      <JsonLd
        id={`${detail.id}-how-to-buy-rate-jsonld`}
        data={{
          "@context": "https://schema.org",
          "@type": "ExchangeRateSpecification",
          currency: "USD",
          currentExchangeRate: {
            "@type": "UnitPriceSpecification",
            price: detail.market.price,
            priceCurrency: "USD",
          },
        }}
      />
    </div>
  );
}
