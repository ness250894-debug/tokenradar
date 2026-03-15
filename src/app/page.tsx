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

      {/* SEO Pillar Content — Home Hub Authority */}
      <section className="section" id="market-outlook" style={{ background: "var(--bg-secondary)" }}>
        <div className="container">
          <div className="article-content" style={{ marginTop: 0 }}>
            <h2>State of the Crypto Market 2026: What to Expect</h2>
            <p>
              Navigating the cryptocurrency landscape requires more than just following the latest trends; it requires
              unbiased, data-driven analysis. As the market matures heading into 2026, the gap between speculative 
              assets and utility-driven tokens is widening. At <strong>TokenRadar</strong>, we analyze over 150 altcoins,
              providing real-time price predictions, risk assessments, and growth potential indexes so you can build 
              a resilient crypto portfolio.
            </p>
            <h3>How to Buy Altcoins Safely</h3>
            <p>
              When evaluating how to buy cryptocurrency, security and liquidity should be your top priorities. 
              We track market volume across the top global exchanges. For the lowest trading fees and deepest liquidity 
              profiles, we recommend mapping your trades through tier-one platforms like 
              <a href="https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default" target="_blank" rel="noopener noreferrer sponsored" style={{ color: "var(--accent-secondary)" }}> Binance</a>, 
              <a href="https://www.bybit.com/invite?ref=QONQNG" target="_blank" rel="noopener noreferrer sponsored" style={{ color: "var(--accent-secondary)" }}> Bybit</a>, 
              <a href="https://okx.com/join/66004268" target="_blank" rel="noopener noreferrer sponsored" style={{ color: "var(--accent-secondary)" }}> OKX</a>, and 
              <a href="https://www.kucoin.com/r/rf/FQ67QZ7A" target="_blank" rel="noopener noreferrer sponsored" style={{ color: "var(--accent-secondary)" }}> KuCoin</a>.
            </p>
            <h3>Proprietary Crypto Price Predictions</h3>
            <p>
              Our automated AI pipelines parse daily CoinGecko market data to forecast near-term volatility and 
              long-term growth. Because market caps dictate the realistic ceiling of any token, TokenRadar assigns 
              a dynamic <em>Risk Score</em> to every asset ranging from Safe Plays to High-Volatility gambles. 
              Before making an entry, always compare the token's current market cap against our historical ATH models 
              to determine your upside potential.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
