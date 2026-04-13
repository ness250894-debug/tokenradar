import { Metadata } from "next";
import Link from "next/link";
import { getTokenIds, getTokenDetail, getAllTokens } from "@/lib/content-loader";
import { ComparisonSearch } from "@/components/ComparisonSearch";
import { EssentialCryptoToolkit } from "@/components/EssentialCryptoToolkit";
import { Scale, TrendingUp, ShieldCheck, Zap, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Compare Cryptocurrencies — Detailed Side-by-Side Analysis",
  description: "Use our interactive comparison tool to analyze risk, growth potential, and market metrics between any two crypto tokens. Data-driven insights for 30,000+ combinations.",
};

export default async function CompareHubPage() {
  const allTokensRaw = getAllTokens();
  const allTokens = allTokensRaw.map(t => ({ id: t.id, name: t.name, symbol: t.symbol }));

  // Get some popular comparisons for the "Featured" section
  // We'll use the top tokens as bases
  const featuredComparisons = [
    { a: "bitcoin", b: "ethereum" },
    { a: "solana", b: "ethereum" },
    { a: "cardano", b: "solana" },
    { a: "ripple", b: "solana" },
    { a: "shiba-inu", b: "pepe" },
    { a: "dogecoin", b: "shiba-inu" },
  ];

  return (
    <main className="container section-padding">
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {/* Hero Section */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-3xl)" }}>
          <div className="badge" style={{ marginBottom: "var(--space-md)" }}>ANALYTICS HUB</div>
          <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 900, marginBottom: "var(--space-md)" }}>
             The <span className="gradient-text">Comparison</span> Engine
          </h1>
          <p style={{ fontSize: "var(--text-lg)", color: "var(--text-secondary)", maxWidth: "600px", margin: "0 auto" }}>
            Analyze any two tokens side-by-side with our proprietary risk scores, growth metrics, and market data.
          </p>
        </div>

        {/* Search Tool */}
        <ComparisonSearch allTokens={allTokens} />

        {/* Feature Grid - Realigned to 1 row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ marginTop: "var(--space-4xl)" }}>
           <div className="card-premium" style={{ textAlign: "left", padding: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderTop: "2px solid var(--green)" }}>
             <ShieldCheck size={32} style={{ marginBottom: "var(--space-md)", color: "var(--green)" }} />
             <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Institutional Risk Analysis</h3>
             <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
               Our proprietary algorithm audits smart contracts, liquidity depth, and developer activity to generate a 1-10 risk score for every token.
             </p>
           </div>
           <div className="card-premium" style={{ textAlign: "left", padding: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderTop: "2px solid var(--accent-primary)" }}>
             <TrendingUp size={32} style={{ marginBottom: "var(--space-md)", color: "var(--accent-primary)" }} />
             <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Growth & Sentiment Metrics</h3>
             <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
               Compare social volume, narrative momentum, and historical performance to identify which assets are leading the current market cycle.
             </p>
           </div>
           <div className="card-premium" style={{ textAlign: "left", padding: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderTop: "2px solid var(--blue)" }}>
             <Zap size={32} style={{ marginBottom: "var(--space-md)", color: "var(--blue)" }} />
             <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Real-Time Data Sync</h3>
             <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
               Synchronized institutional-grade pricing feeds, supply dynamics, and market cap tracking ensures your comparison is always accurate.
             </p>
           </div>
        </div>

        {/* Featured Comparisons */}
        <div style={{ marginTop: "var(--space-4xl)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-lg)", display: "flex", alignItems: "center", gap: "12px" }}>
            <Scale size={24} className="gradient-text" /> Popular Benchmarks
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredComparisons.map((pair) => {
              const detailA = getTokenDetail(pair.a);
              const detailB = getTokenDetail(pair.b);
              if (!detailA || !detailB) return null;
              
              return (
                <Link 
                  key={`${pair.a}-${pair.b}`}
                  href={`/compare/${pair.a}-vs-${pair.b}`}
                  className="card hover-glow"
                  style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    padding: "var(--space-md)",
                    textDecoration: "none",
                    border: "1px solid var(--border-color)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{detailA.symbol.toUpperCase()}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>vs</div>
                    <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{detailB.symbol.toUpperCase()}</div>
                  </div>
                  <ArrowRight size={14} style={{ color: "var(--accent-primary)", opacity: 0.6 }} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Essential Toolkit Section */}
        <EssentialCryptoToolkit />
      </div>
    </main>
  );
}
