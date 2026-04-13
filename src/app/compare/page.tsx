import { Metadata } from "next";
import Link from "next/link";
import { getTokenIds, getTokenDetail, getAllTokens } from "@/lib/content-loader";
import { getTokenIconUrl } from "@/lib/formatters";
import { ComparisonSearch } from "@/components/ComparisonSearch";
import { EssentialCryptoToolkit } from "@/components/EssentialCryptoToolkit";
import { CardGlare } from "@/components/CardGlare";
import { TokenIcon } from "@/components/TokenIcon";
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

        {/* Feature Grid */}
        <div className="stats-grid" style={{ marginTop: "var(--space-4xl)" }}>
           <CardGlare style={{ height: "100%" }}>
             <div className="card" style={{ height: "100%", textAlign: "left" }}>
               <div className="feature-icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                 <ShieldCheck size={32} style={{ color: "#10b981" }} />
               </div>
               <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Institutional Risk Analysis</h3>
               <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                 Our proprietary algorithm audits smart contracts, liquidity depth, and developer activity to generate a 1-10 risk score for every token.
               </p>
             </div>
           </CardGlare>

           <CardGlare style={{ height: "100%" }}>
             <div className="card" style={{ height: "100%", textAlign: "left" }}>
               <div className="feature-icon-wrapper" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                 <TrendingUp size={32} style={{ color: "#3b82f6" }} />
               </div>
               <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Growth & Sentiment Metrics</h3>
               <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                 Compare social volume, narrative momentum, and historical performance to identify which assets are leading the current market cycle.
               </p>
             </div>
           </CardGlare>

           <CardGlare style={{ height: "100%" }}>
             <div className="card" style={{ height: "100%", textAlign: "left" }}>
               <div className="feature-icon-wrapper" style={{ background: "rgba(247, 147, 26, 0.1)" }}>
                 <Zap size={32} style={{ color: "#f7931a" }} />
               </div>
               <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Real-Time Data Sync</h3>
               <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                 Synchronized institutional-grade pricing feeds, supply dynamics, and market cap tracking ensures your comparison is always accurate.
               </p>
             </div>
           </CardGlare>
        </div>

        {/* Featured Comparisons */}
        <div style={{ marginTop: "var(--space-4xl)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-lg)", display: "flex", alignItems: "center", gap: "12px" }}>
            <Scale size={24} className="gradient-text" /> Popular Benchmarks
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredComparisons.map((pair) => {
              const detailA = getTokenDetail(pair.a);
              const detailB = getTokenDetail(pair.b);
              if (!detailA || !detailB) return null;
              
              return (
                <CardGlare key={`${pair.a}-${pair.b}`}>
                  <Link 
                    href={`/compare/${pair.a}-vs-${pair.b}`}
                    className="card hover-glow"
                    style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "var(--space-md) var(--space-lg)",
                      textDecoration: "none",
                      border: "1px solid var(--border-color)",
                      height: "100%"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                        <TokenIcon 
                          symbol={detailA.symbol} 
                          name={detailA.name} 
                          id={detailA.id} 
                          size={24} 
                          style={{ borderRadius: "50%" }}
                        />
                        <span style={{ marginLeft: "6px", fontWeight: 700, fontSize: "var(--text-sm)" }}>{detailA.symbol.toUpperCase()}</span>
                      </div>
                      
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>VS</div>
                      
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <TokenIcon 
                          symbol={detailB.symbol} 
                          name={detailB.name} 
                          id={detailB.id} 
                          size={24} 
                          style={{ borderRadius: "50%" }}
                        />
                        <span style={{ marginLeft: "6px", fontWeight: 700, fontSize: "var(--text-sm)" }}>{detailB.symbol.toUpperCase()}</span>
                      </div>
                    </div>
                    
                    <ArrowRight size={14} style={{ color: "var(--accent-primary)", opacity: 0.6, marginLeft: "var(--space-md)" }} />
                  </Link>
                </CardGlare>
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
