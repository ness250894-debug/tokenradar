import { Metadata } from "next";
import Link from "next/link";
import { getTokenIds, getTokenDetail, getAllTokens } from "@/lib/content-loader";
import { Scale, TrendingUp, ShieldCheck } from "lucide-react";
import { CardGlare } from "@/components/CardGlare";
import { ComparisonSearch } from "@/components/ComparisonSearch";

export const metadata: Metadata = {
  title: "Crypto Comparison Engine — Side-by-Side Token Analysis",
  description: "Compare any two crypto tokens side-by-side. Analyze market cap, risk scores, and performance history with our data-driven comparison tool.",
};

export default function CompareDirectoryPage() {
  const allTokensList = getAllTokens();
  const topTokens = allTokensList
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 100);
  
  const ids = topTokens.map(t => t.id).slice(0, 50); // For alphabetic explorer
  const topComparisons = [
    ["bitcoin", "ethereum"],
    ["bitcoin", "solana"],
    ["ethereum", "solana"],
    ["usdt", "usdc"],
    ["bnb", "ethereum"],
    ["cardano", "polkadot"],
    ["shiba-inu", "pepe"],
    ["avalanche", "solana"],
  ];

  return (
    <div className="container">
      <section className="section">
        <div style={{ textAlign: "center", marginBottom: "var(--space-2xl)" }}>
          <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, marginBottom: "var(--space-md)" }}>
            Comparison <span className="gradient-text">Engine</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-lg)", maxWidth: "800px", margin: "0 auto var(--space-lg) auto" }}>
            The industry's most detailed side-by-side analysis for top crypto assets. 
            Compare risk, performance, and fundamentals instantly.
          </p>
          
          <div style={{ 
            display: "inline-block", 
            padding: "8px 16px", 
            background: "rgba(255,183,0,0.05)", 
            border: "1px solid rgba(255,183,0,0.1)", 
            borderRadius: "50px",
            fontSize: "var(--text-xs)",
            color: "var(--accent-primary)",
            fontWeight: 600
          }}>
            ✨ Comparisons available for the Top 100 assets by Market Cap
          </div>
        </div>

        {/* Custom Comparison Tool */}
        <div style={{ maxWidth: "800px", margin: "0 auto var(--space-3xl) auto" }}>
          <ComparisonSearch allTokens={topTokens} />
        </div>

        {/* Feature Highlights */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-3xl)" }}>
          <div className="card" style={{ padding: "var(--space-xl)", background: "var(--bg-elevated)" }}>
            <Scale className="gradient-text" style={{ marginBottom: "var(--space-md)" }} />
            <h3 style={{ marginBottom: "var(--space-xs)" }}>Market Parity</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Compare market cap and volume distribution to find relative value opportunities.</p>
          </div>
          <div className="card" style={{ padding: "var(--space-xl)", background: "var(--bg-elevated)" }}>
            <ShieldCheck className="gradient-text" style={{ marginBottom: "var(--space-md)" }} />
            <h3 style={{ marginBottom: "var(--space-xs)" }}>Risk Differentials</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Side-by-side security ratings and risk scores for multi-chain analysis.</p>
          </div>
          <div className="card" style={{ padding: "var(--space-xl)", background: "var(--bg-elevated)" }}>
            <TrendingUp className="gradient-text" style={{ marginBottom: "var(--space-md)" }} />
            <h3 style={{ marginBottom: "var(--space-xs)" }}>Performance Matrix</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Historical gain/loss comparison relative to market averages.</p>
          </div>
        </div>

        {/* Popular Comparisons */}
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-xl)", borderBottom: "1px solid var(--border-color)", paddingBottom: "var(--space-sm)" }}>
          Popular <span className="gradient-text">Comparisons</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-md)" }}>
          {topComparisons.map(([aId, bId]) => {
            const a = getTokenDetail(aId);
            const b = getTokenDetail(bId);
            if (!a || !b) return null;
            return (
              <CardGlare key={`${aId}-vs-${bId}`}>
                <Link 
                  href={`/compare/${aId}-vs-${bId}`}
                  className="card hover-scale"
                  style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", textDecoration: "none", padding: "var(--space-xl)" }}
                >
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Market Battle</div>
                  <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
                    {a.symbol.toUpperCase()} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>vs</span> {b.symbol.toUpperCase()}
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                    {a.name} & {b.name}
                  </div>
                </Link>
              </CardGlare>
            );
          })}
        </div>

        {/* Alphabetic Explore Hub (Discovery for GSC) */}
        <div style={{ marginTop: "var(--space-4xl)", padding: "var(--space-2xl)", background: "var(--bg-card)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-color)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-lg)" }}>
            Explore All Assets
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
            {ids.map(id => {
              const token = getTokenDetail(id);
              if (!token) return null;
              return (
                <Link 
                  key={id} 
                  href={`/${id}`} 
                  className="badge badge-accent hover-scale"
                  style={{ padding: "0.5rem 1rem" }}
                >
                  {token.name} Comparisons
                </Link>
              );
            })}
          </div>
          <p style={{ marginTop: "var(--space-xl)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Showing top assets. Use the search bar to find more specific token comparisons.
          </p>
        </div>
      </section>
    </div>
  );
}
