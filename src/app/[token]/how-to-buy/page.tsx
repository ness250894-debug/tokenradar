import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getTokenDetail,
  getTokenIdsWithArticle,
  getTokenMetrics,
  getArticle,
  formatPrice,
  formatCompact,
} from "@/lib/content-loader";
import { evaluateArticleQuality } from "@/lib/content-quality";
import { markdownToHtml } from "@/lib/markdown";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { ExchangeReferralPanel } from "@/components/ExchangeReferralPanel";
import { LastUpdated } from "@/components/LastUpdated";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const tokenIds = await getTokenIdsWithArticle("how-to-buy");
  return tokenIds.map((token) => ({ token }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const detail = await getTokenDetail(tokenId);
  if (!detail) return { title: "Token Not Found" };

  const article = await getArticle(tokenId, "how-to-buy");
  const articleQuality = article ? evaluateArticleQuality(article) : null;
  const title = `How to Buy ${detail.name} (${detail.symbol.toUpperCase()}) — Step-by-Step Guide`;
  const description = `Complete guide to buying ${detail.name} (${detail.symbol.toUpperCase()}). Compare exchanges, learn about wallets, and understand the risks before investing.`;

  const ogImage = `/og/token/${detail.id}.png`;

  return {
    title,
    description,
    robots: {
      index: !!articleQuality?.passed,
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

  return (
    <div className="container">
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

        <ExchangeReferralPanel symbol={detail.symbol} tokenName={detail.name} />

        {/* Article Content */}
        {article ? (
          <div style={{ marginTop: "var(--space-2xl)" }}>
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: `How to Buy ${detail.name} (${detail.symbol.toUpperCase()})`,
            description: `Step-by-step guide to purchasing ${detail.name}.`,
            step: [
              { "@type": "HowToStep", name: "Create an Exchange Account", text: "Choose an exchange or broker that is legally available in your jurisdiction." },
              { "@type": "HowToStep", name: "Deposit Funds", text: "Deposit fiat currency or crypto to your exchange account." },
              { "@type": "HowToStep", name: `Check ${detail.symbol.toUpperCase()} Markets`, text: `Confirm that ${detail.symbol.toUpperCase()} is listed, verify the trading pair, and review fees before placing an order.` },
              { "@type": "HowToStep", name: "Secure Your Investment", text: "Consider transferring to a hardware wallet for long-term storage." },
            ],
          }),
        }}
      />
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
                "name": "How to Buy",
                "item": `https://tokenradar.co/${detail.id}/how-to-buy`
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
    </div>
  );
}
