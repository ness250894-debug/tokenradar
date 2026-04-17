import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllCategories, getTokensByCategory, formatCompact, getTokenMetrics } from "@/lib/content-loader";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";

interface PageProps {
  params: Promise<{ category: string }>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((cat) => ({ category: cat.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categories = await getAllCategories();
  const cat = categories.find(c => c.id === category);
  if (!cat) return { title: "Category Not Found" };

  const title = `Top ${cat.name} Crypto Tokens — Market Cap & Analytics`;
  const description = `Discover the top ${cat.name} cryptocurrency tokens. Analyze price, risk score, market cap, and proprietary metrics for ${cat.name} projects on TokenRadar.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/category/${cat.id}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categories = await getAllCategories();
  const cat = categories.find(c => c.id === category);
  
  if (!cat) notFound();

  const tokens = await getTokensByCategory(cat.id);
  const totalMarketCap = tokens.reduce((sum, t) => sum + (t.marketCap || 0), 0);
  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24h || 0), 0);
  
  // Format tokens for the TokenCard component
  const tokenCards: TokenCardData[] = await Promise.all(tokens.map(async (t) => {
    const metrics = await getTokenMetrics(t.id);
    return {
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      price: t.price,
      priceChange24h: t.priceChange24h,
      marketCap: t.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: cat.name,
    };
  }));

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
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
          Track the top tokens in the {cat.name} sector. View deep data analytics, price predictions, and risk scores to make informed decisions.
        </p>

        {/* Aggregate Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)" }}>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase" }}>Total Tokens Tracker</div>
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
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-lg)" }}>
        {tokenCards.map(token => (
          <TokenCard key={token.id} token={token} />
        ))}
      </div>
      
      {/* Category SEO Content / Footer */}
      <section style={{ marginTop: "var(--space-4xl)", borderTop: "1px solid var(--border-color)", paddingTop: "var(--space-2xl)" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>Why monitor the {cat.name} ecosystem?</h2>
        <div style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: "var(--text-md)" }}>
          <p style={{ marginBottom: "var(--space-md)" }}>
            The cryptocurrency landscape is vast, but paying attention to specific sectors like <strong>{cat.name}</strong> helps investors identify trends before they go mainstream. By tracking the collective market capitalization and daily trading volume of these projects, you can gauge overall sentiment and capital flow within the sector.
          </p>
          <p>
            TokenRadar provides proprietary Risk Scores and Growth Potential tracking for all major {cat.name} tokens, separating fundamentally strong projects from market noise. Click into any token above to read our data-driven breakdown and review current price Action.
          </p>
        </div>
      </section>
    </main>
  );
}
