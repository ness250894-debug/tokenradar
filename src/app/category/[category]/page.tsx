import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllCategories, getTokensByCategory, formatCompact, getSearchIntentDataset, getSearchIntentTrendMap, getTokenMetrics } from "@/lib/content-loader";
import type { TokenCardData } from "@/components/TokenCard";
import { TokenGrid } from "@/components/TokenGrid";
import { JsonLd } from "@/components/JsonLd";
import { buildSearchIntentCardFields } from "@/lib/search-intent";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { buildSeoDescription, buildSeoTitle, canonicalUrl } from "@/lib/seo";

interface PageProps {
  params: Promise<{ category: string }>;
}

export const dynamicParams = false;

function formatCategorySeoTitle(categoryName: string): string {
  const cleaned = categoryName.replace(/\s*\([^)]*\)/g, "").trim();
  const abbreviation = /\(([^)]+)\)/.exec(categoryName)?.[1]?.trim();
  return buildSeoTitle(abbreviation
    ? `${cleaned} (${abbreviation}) Tokens`
    : `${cleaned} Crypto Tokens`);
}

export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((cat) => ({ category: cat.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categories = await getAllCategories();
  const cat = categories.find(c => c.id === category);
  if (!cat) return { title: "Category Not Found" };

  const tokens = await getTokensByCategory(cat.id);
  const title = formatCategorySeoTitle(cat.name);
  const description = buildSeoDescription(`Compare ${tokens.length} ${cat.name} crypto tokens by price, market cap, trading volume, 24-hour movement, and TokenRadar risk metrics.`);

  return {
    title,
    description,
    alternates: {
      canonical: `/category/${cat.id}`,
    },
    openGraph: {
      ...buildOpenGraphMetadata({ title, description, url: `/category/${cat.id}` }),
    },
    twitter: buildTwitterMetadata({ title, description }),
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categories = await getAllCategories();
  const cat = categories.find(c => c.id === category);
  
  if (!cat) notFound();

  const [tokens, searchIntentDataset, searchIntentTrendMap] = await Promise.all([
    getTokensByCategory(cat.id),
    getSearchIntentDataset(),
    getSearchIntentTrendMap(),
  ]);
  const totalMarketCap = tokens.reduce((sum, t) => sum + (t.marketCap || 0), 0);
  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24h || 0), 0);
  
  // Format tokens for the TokenCard component
  const tokenCards: TokenCardData[] = await Promise.all(tokens.map(async (t) => {
    const metrics = await getTokenMetrics(t.id);
    const searchIntent = searchIntentDataset?.tokens[t.id];
    const searchIntentTrend = searchIntentTrendMap[t.id];
    return {
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      imageUrl: t.imageUrl || t.image,
      price: t.price,
      priceChange24h: t.priceChange24h,
      marketCap: t.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: cat.name,
      categoryHref: `/category/${cat.id}`,
      ...buildSearchIntentCardFields(searchIntent, searchIntentTrend),
    };
  }));
  const averageRisk = tokenCards.length > 0
    ? tokenCards.reduce((sum, token) => sum + token.riskScore, 0) / tokenCards.length
    : 0;
  const positiveMoverCount = tokens.filter((token) => token.priceChange24h > 0).length;
  const topByMarketCap = tokens.toSorted((a, b) => b.marketCap - a.marketCap).slice(0, 3);
  const highestVolume = tokens.toSorted((a, b) => b.volume24h - a.volume24h)[0];

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <JsonLd
        id={`category-${cat.id}-jsonld`}
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${cat.name} Crypto Tokens`,
          description: `Compare ${tokens.length} ${cat.name} crypto tokens using market cap, volume, price movement, and TokenRadar risk metrics.`,
          url: canonicalUrl(`/category/${cat.id}`),
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: tokens.length,
            itemListElement: tokens.slice(0, 20).map((token, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `${token.name} (${token.symbol.toUpperCase()})`,
              url: canonicalUrl(`/${token.id}`),
            })),
          },
        }}
      />
      {/* Header section */}
      <div style={{ marginBottom: "var(--space-3xl)", borderBottom: "1px solid var(--border-color)", paddingBottom: "var(--space-xl)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-lg)" }}>
          <Link href="/" className="hover-accent" style={{ color: "inherit", textDecoration: "none" }}>Home</Link>
          <span>/</span>
          <span style={{ color: "var(--text-secondary)" }}>Category</span>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{cat.name}</span>
        </div>
        
        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, marginBottom: "var(--space-sm)", letterSpacing: "-0.02em" }}>
          <span className="gradient-text">
            {cat.name}
          </span> Tokens
        </h1>
        
        <p style={{ fontSize: "var(--text-lg)", color: "var(--text-secondary)", marginBottom: "var(--space-xl)", maxWidth: "800px", lineHeight: 1.6 }}>
          Compare {tokens.length} tracked {cat.name} assets by market capitalization, trading volume, 24-hour movement, and TokenRadar risk score. Data updates with the market pipeline; scores are screening signals, not recommendations.
        </p>

        {/* Aggregate Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)" }}>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase" }}>Total Tokens Tracked</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text-primary)" }}>{tokens.length}</div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase" }}>Sector Market Cap</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text-primary)" }}>{formatCompact(totalMarketCap)}</div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase" }}>24h Volume</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text-primary)" }}>{formatCompact(totalVolume)}</div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase" }}>Average Risk Score</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text-primary)" }}>{averageRisk.toFixed(1)}/10</div>
          </div>
        </div>
      </div>

      <TokenGrid
        tokens={tokenCards}
        initialVisibleCount={12}
        searchPlaceholder={`Search ${cat.name} tokens by name or symbol...`}
      />
      
      {/* Category SEO Content / Footer */}
      <section style={{ marginTop: "var(--space-4xl)", borderTop: "1px solid var(--border-color)", paddingTop: "var(--space-2xl)" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>Compare {cat.name} tokens by market cap, liquidity, and risk</h2>
        <div style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: "var(--text-md)" }}>
          <p style={{ marginBottom: "var(--space-md)" }}>
            This snapshot covers <strong>{tokens.length} {cat.name} assets</strong> with {positiveMoverCount} showing a positive 24-hour move.
            {topByMarketCap.length > 0 ? ` The largest tracked names by market cap are ${topByMarketCap.map((token) => token.name).join(", ")}.` : ""}
            {highestVolume ? ` ${highestVolume.name} currently has the highest reported 24-hour volume in this category.` : ""}
          </p>
          <p style={{ marginBottom: "var(--space-md)" }}>
            Market cap describes current network valuation, while volume provides a rough activity and liquidity signal. TokenRadar&apos;s risk score adds recent volatility, market size, volume-to-cap, and all-time-high drawdown. Read the{" "}
            <Link href="/about#methodology">documented scoring methodology</Link> before comparing scores across assets.
          </p>
          <p>
            Continue with the <Link href="/learn/liquidity-depth">liquidity-depth guide</Link>, review the{" "}
            <Link href="/research#category-comparison">cross-category risk research</Link>, or open an asset above for its current market snapshot and source context.
          </p>
        </div>
      </section>
    </main>
  );
}
