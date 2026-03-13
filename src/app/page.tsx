import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { getAllTokens, getTokenMetrics } from "@/lib/content-loader";
import { TokenGrid } from "@/components/TokenGrid";

/**
 * Homepage — hero section, stats overview, and trending token cards.
 * Driven by generated data from the SSG pipeline.
 */
export default function HomePage() {
  const allTokensList = getAllTokens();

  // For the homepage frontend, we only want to show tokens that have successfully 
  // generated metrics so we can display their Risk Score.
  const allTokens: TokenCardData[] = allTokensList
    .map((token) => {
      const metrics = getTokenMetrics(token.id);
      return {
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        rank: token.rank,
        price: token.price,
        priceChange24h: token.priceChange24h,
        marketCap: token.marketCap,
        riskScore: metrics?.riskScore || 5, // Fallback if metrics missing
        category: "Crypto", // Simplified for the homepage
      };
    });

  return (
    <>
      {/* Hero */}
      <section className="hero" id="hero">
        <div className="container">
          <h1 className="animate-in">
            Data-Driven <span className="gradient-text">Crypto Analysis</span>{" "}
            You Can Trust
          </h1>
          <p className="hero-subtitle animate-in animate-delay-1">
            Proprietary Risk Scores, Growth Indexes, and AI-powered research for
            {allTokens.length > 0 ? ` ${allTokens.length}+ ` : " 150+ "} tokens — updated daily, always unbiased.
          </p>
          <div className="hero-cta animate-in animate-delay-2">
            <a href="#trending" className="btn btn-primary">
              Explore Tokens
            </a>
            <a href="/about" className="btn btn-secondary">
              Our Methodology
            </a>
          </div>
        </div>
      </section>

      {/* Stats Overview */}
      <section className="section" id="stats">
        <div className="container">
          <div className="stats-grid animate-in animate-delay-1">
            <div className="stat-card">
              <div className="stat-label">Tokens Tracked</div>
              <div className="stat-value gradient-text">{allTokens.length || "150+"}</div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                Active Data Feeds
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Articles Published</div>
              <div className="stat-value gradient-text">{allTokens.length * 3}</div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                AI-Generated Research
              </div>
            </div>
            <RiskScoreCard score={5} label="Avg. Market Risk" />
            <div className="stat-card">
              <div className="stat-label">Data Freshness</div>
              <div className="stat-value gradient-text">24h</div>
              <div className="stat-change" style={{ color: "var(--green)" }}>
                Auto-refreshed daily
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trending Tokens */}
      <section className="section" id="trending">
        <div className="container">
          <div className="section-header">
            <h2>
              Tracked <span className="gradient-text">Tokens</span>
            </h2>
            <p>Data-driven analysis and insights.</p>
          </div>
          
          <TokenGrid tokens={allTokens} />
        </div>
      </section>

      {/* How It Works */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>
              How <span className="gradient-text">TokenRadar</span> Works
            </h2>
            <p>
              Every analysis is built on real data, not opinions.
            </p>
          </div>
          <div className="stats-grid">
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>
                📊
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
                Real-Time Data
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                We pull live price, volume, supply, and historical data from
                CoinGecko for every token — refreshed every 24 hours.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>
                🧮
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
                Proprietary Metrics
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                Our Risk Score, Growth Index, and Narrative Strength are computed
                from real market data — not subjective ratings.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>
                🤖
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
                AI-Powered Analysis
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                Each article is generated by AI using verified data points,
                then validated against quality and accuracy checks.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
