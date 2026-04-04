import { type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { getAllTokens, getTokenMetrics, getUpcomingTGEs, getTotalArticleCount } from "@/lib/content-loader";
import { HomeTabs } from "@/components/HomeTabs";
import Link from "next/link";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CountUp } from "@/components/CountUp";
import { AlphaTicker } from "@/components/AlphaTicker";

export default function HomePage() {
  const allTokensList = getAllTokens();
  const upcomingTges = getUpcomingTGEs();

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
        riskScore: metrics?.riskScore || 5,
        category: "Crypto",
      };
    });

  // Compute average market risk from all tracked tokens
  const riskScores = allTokens.map((t) => t.riskScore);
  const avgMarketRisk =
    riskScores.length > 0
      ? Math.round(riskScores.reduce((sum, s) => sum + s, 0) / riskScores.length)
      : 5;

  return (
    <>
      <section className="hero" id="hero">
        <div className="container">
          <h1 className="animate-in">
            Data-Driven <span className="gradient-text">Crypto Analysis</span>{" "}
            You Can Trust
          </h1>
          <p className="hero-subtitle animate-in animate-delay-1">
            Proprietary Risk Scores, Growth Indexes, and AI-powered research for
            {allTokens.length > 0 ? ` ${allTokens.length}+ ` : " 250+ "} tokens — updated daily, always unbiased.
          </p>
          <div className="hero-cta animate-in animate-delay-2">
            <MagneticEffect>
              <a href="#tokens" className="btn btn-primary">
                Explore Tokens
              </a>
            </MagneticEffect>
            <MagneticEffect>
              <Link href="/about" className="btn btn-secondary">
                Our Methodology
              </Link>
            </MagneticEffect>
          </div>
        </div>
      </section>

      <section className="section" id="stats">
        <div className="container">
          <div className="stats-grid animate-in animate-delay-1">
            <div className="stat-card">
              <div className="stat-label">Tokens Tracked</div>
              <div className="stat-value gradient-text">
                <CountUp end={allTokens.length > 0 ? allTokens.length : 250} suffix="+" />
              </div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>Active Data Feeds</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Articles Published</div>
              <div className="stat-value gradient-text">
                <CountUp end={getTotalArticleCount()} />
              </div>
              <div className="stat-change" style={{ color: "var(--text-muted)" }}>AI-Generated Research</div>
            </div>
            <RiskScoreCard score={avgMarketRisk} label="Avg. Market Risk" />
            <div className="stat-card">
              <div className="stat-label">Data Freshness</div>
              <div className="stat-value gradient-text">24h</div>
              <div className="stat-change" style={{ color: "var(--green)" }}>Auto-refreshed daily</div>
            </div>
          </div>
        </div>
      </section>

      <AlphaTicker />

      <section className="section" id="tokens">
        <HomeTabs trackedTokens={allTokens} upcomingTges={upcomingTges} />
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How <span className="gradient-text">TokenRadar</span> Works</h2>
            <p>Every analysis is built on real data, not opinions.</p>
          </div>
          <div className="stats-grid">
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>📊</div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Real-Time Data</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                We pull live price, volume, supply, and historical data from CoinGecko for every token — refreshed every 24 hours.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>🧮</div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Proprietary Metrics</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                Our Risk Score, Growth Index, and Narrative Strength are computed from real market data — not subjective ratings.
              </p>
            </div>
            <div className="card">
              <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>🤖</div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>AI-Powered Analysis</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                Each article is generated by AI using verified data points, then validated against quality and accuracy checks.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      <section className="section" id="market-outlook" style={{ background: "var(--bg-secondary)" }}>
        <div className="container">
          <div className="article-content" style={{ marginTop: 0 }}>
            <h2>State of the Crypto Market {new Date().getFullYear()}: What to Expect</h2>
            <p>Navigating the cryptocurrency landscape requires more than just following the latest trends; it requires unbiased, data-driven analysis.</p>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "TokenRadar",
            url: "https://tokenradar.co",
            logo: "https://tokenradar.co/og-image.png",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": allTokens.map((t, idx) => ({
              "@type": "ListItem",
              "position": idx + 1,
              "url": `https://tokenradar.co/${t.id}`,
              "name": `${t.name} (${t.symbol})`
            }))
          }),
        }}
      />
    </>
  );
}
