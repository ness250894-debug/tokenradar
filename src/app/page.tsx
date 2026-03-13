import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";

/**
 * Mock token data for initial development.
 * Will be replaced by CoinGecko API data in Phase 2.
 */
const MOCK_TOKENS: TokenCardData[] = [
  {
    id: "injective-protocol",
    name: "Injective",
    symbol: "INJ",
    rank: 52,
    price: 24.87,
    priceChange24h: 5.32,
    marketCap: 2_430_000_000,
    riskScore: 5,
    category: "DeFi",
  },
  {
    id: "render-token",
    name: "Render",
    symbol: "RNDR",
    rank: 58,
    price: 7.41,
    priceChange24h: -2.18,
    marketCap: 2_870_000_000,
    riskScore: 4,
    category: "AI",
  },
  {
    id: "sei-network",
    name: "Sei",
    symbol: "SEI",
    rank: 71,
    price: 0.52,
    priceChange24h: 8.91,
    marketCap: 1_560_000_000,
    riskScore: 6,
    category: "Layer 1",
  },
  {
    id: "celestia",
    name: "Celestia",
    symbol: "TIA",
    rank: 63,
    price: 12.34,
    priceChange24h: -0.45,
    marketCap: 2_100_000_000,
    riskScore: 5,
    category: "Modular",
  },
  {
    id: "starknet",
    name: "Starknet",
    symbol: "STRK",
    rank: 89,
    price: 1.87,
    priceChange24h: 12.4,
    marketCap: 1_340_000_000,
    riskScore: 7,
    category: "Layer 2",
  },
  {
    id: "akash-network",
    name: "Akash Network",
    symbol: "AKT",
    rank: 95,
    price: 4.21,
    priceChange24h: 3.67,
    marketCap: 980_000_000,
    riskScore: 6,
    category: "AI / DePin",
  },
];

/**
 * Homepage — hero section, stats overview, and trending token cards.
 * Static content for now; will be driven by generated data in later phases.
 */
export default function HomePage() {
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
            150+ tokens — updated daily, always unbiased.
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
              <div className="stat-value gradient-text">150+</div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                Ranks #50 — #200
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Articles Published</div>
              <div className="stat-value gradient-text">0</div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>
                Launching soon
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
              Trending <span className="gradient-text">Tokens</span>
            </h2>
            <p>Mid-cap tokens with the strongest narratives and momentum.</p>
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {MOCK_TOKENS.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))}
          </div>
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
