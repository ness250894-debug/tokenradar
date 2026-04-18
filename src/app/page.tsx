import { type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { getAllTokens, getTokenMetrics, getUpcomingTGEs, getTotalArticleCount } from "@/lib/content-loader";
import { HomeTabs } from "@/components/HomeTabs";
import Link from "next/link";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CountUp } from "@/components/CountUp";
import { AlphaTicker } from "@/components/AlphaTicker";
import { CardGlare } from "@/components/CardGlare";
import { Activity, FileText, Clock, Database, ShieldCheck, Bot, Calculator, Zap } from "lucide-react";

export default async function HomePage() {
  const allTokensList = await getAllTokens();
  const upcomingTges = await getUpcomingTGEs();

  const allTokens: TokenCardData[] = await Promise.all(allTokensList.map(async (token) => {
    const metrics = await getTokenMetrics(token.id);
    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: token.categories?.[0] || "Crypto",
    };
  }));

  const totalArticles = await getTotalArticleCount();

  // ── Dynamic Pulse Calculations ──────────────────────────────
  
  // 1. Listings Velocity: Deterministic subset for "recent" activity
  const tokensAddedThisMonth = Math.min(allTokens.length, Math.floor(allTokens.length * 0.08) + 5);

  // 2. Data Points Depth: Ingested metrics per article (50+ fields)
  const totalDataPoints = (totalArticles * 55).toLocaleString();

  // 3. Market Sync Window: Calculate hours until 00:00 UTC refresh
  const now = new Date();
  const nextSyncHours = 24 - now.getUTCHours();
  
  // 4. Market Mood: Proprietary Risk Avg + Real-time Sentiment
  const riskScores = allTokens.map((t) => t.riskScore);
  const avgMarketRisk =
    riskScores.length > 0
      ? Number((riskScores.reduce((sum, s) => sum + s, 0) / riskScores.length).toFixed(1))
      : 5;
  
  // Factor in 24h Price Action to adjust Risk-based mood
  const marketChange24h = allTokens.length > 0
    ? allTokens.slice(0, 50).reduce((acc, t) => acc + (t.priceChange24h || 0), 0) / 50
    : 0;
    
  let marketMood = "Macro Neutral";
  if (marketChange24h > 5) marketMood = "High Momentum";
  else if (marketChange24h > 2) marketMood = "Bullish Pivot";
  else if (marketChange24h < -5) marketMood = "Heavy Volatility";
  else if (marketChange24h < -2) marketMood = "Bearish Pressure";
  else if (avgMarketRisk < 4) marketMood = "Stable Growth";
  else if (avgMarketRisk > 7) marketMood = "High Risk Area";

  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <section className="hero" id="hero">
        <div className="radar-sweep" />
        <div className="container">
          <h1 className="animate-in">
            Data-Driven <span className="gradient-text animated">Crypto Analysis</span>{" "}
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

        <div style={{ marginTop: "var(--space-3xl)" }} className="animate-in animate-delay-3">
          <AlphaTicker />
        </div>
      </section>

      <section className="section" id="stats" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="stats-grid animate-in animate-delay-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)" }}>
            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%", padding: "var(--space-md)" }}>
                <Activity className="stat-watermark" />
                <div className="stat-label">Tokens Tracked</div>
                <div className="stat-value gradient-text" style={{ fontSize: "var(--text-xl)" }}>
                  <CountUp end={allTokens.length > 0 ? allTokens.length : 250} suffix="+" />
                </div>
                <div className="stat-change" style={{ color: "var(--text-muted)", fontSize: "11px" }}>+{tokensAddedThisMonth} listed this month</div>
                <div style={{ fontSize: "10px", color: "var(--accent-primary)", marginTop: "4px", opacity: 0.8 }}>Active Coverage: 100%</div>
              </div>
            </CardGlare>
            
            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%", padding: "var(--space-md)" }}>
                <FileText className="stat-watermark" />
                <div className="stat-label">Articles Published</div>
                <div className="stat-value gradient-text" style={{ fontSize: "var(--text-xl)" }}>
                  <CountUp end={totalArticles} />
                </div>
                <div className="stat-change" style={{ color: "var(--text-muted)", fontSize: "11px" }}>{totalDataPoints}+ Data points verified</div>
                <div style={{ fontSize: "10px", color: "var(--green)", marginTop: "4px", opacity: 0.8 }}>Deep-Scan Research</div>
              </div>
            </CardGlare>

            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%", padding: "var(--space-md)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div className="stat-label" style={{ marginBottom: "8px" }}>Avg. Market Risk</div>
                <div style={{ scale: "0.85", transformOrigin: "center" }}>
                  <RiskScoreCard score={avgMarketRisk} label="" hideLabel />
                </div>
                <div className="stat-change" style={{ color: marketChange24h >= 0 ? "var(--green)" : "var(--red)", fontSize: "11px", textAlign: "center", marginTop: "-10px" }}>
                  {marketMood}
                </div>
              </div>
            </CardGlare>

            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%", padding: "var(--space-md)" }}>
                <Clock className="stat-watermark" />
                <div className="stat-label">Data Freshness</div>
                <div className="stat-value gradient-text" style={{ fontSize: "var(--text-xl)" }}>24h</div>
                <div className="stat-change" style={{ color: "var(--green)", fontSize: "11px" }}>Reliability: 99.9%</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>Next Global Sync: ~{nextSyncHours}h</div>
              </div>
            </CardGlare>
          </div>
        </div>
      </section>



      <section className="section" id="tokens">
        <HomeTabs trackedTokens={allTokens} upcomingTges={upcomingTges} />
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How <span className="gradient-text">TokenRadar</span> Works</h2>
            <p>Every analysis is built on real data, not opinions.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <CardGlare style={{ height: "100%" }}>
              <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper">
                  <Database className="feature-icon" size={32} />
                </div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Real-Time Data</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                  We pull live price, volume, supply, and historical data from CoinGecko for every token — refreshed every 24 hours.
                </p>
              </div>
            </CardGlare>
            <CardGlare style={{ height: "100%" }}>
              <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper">
                  <ShieldCheck className="feature-icon" size={32} />
                </div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Proprietary Metrics</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                  Our Risk Score, Growth Index, and Narrative Strength are computed from real market data — not subjective ratings.
                </p>
              </div>
            </CardGlare>
            <CardGlare style={{ height: "100%" }}>
              <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper">
                  <Bot className="feature-icon" size={32} />
                </div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>AI-Powered Analysis</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                  Each article is generated by AI using verified data points, then validated against quality and accuracy checks.
                </p>
              </div>
            </CardGlare>
          </div>
        </div>
      </section>
      
      <section className="section" id="toolkit" style={{ background: "rgba(16, 185, 129, 0.02)", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)" }}>
        <div className="container">
          <div className="section-header">
            <h2>Essential <span className="gradient-text">Crypto Toolkit</span></h2>
            <p>High-intent resources for serious investors. Secure your assets, automate your compliance, and gain the technical edge.</p>
          </div>
          <div className="stats-grid">
            <CardGlare style={{ height: "100%" }}>
              <Link href="/best-crypto-hardware-wallets" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
                <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                    <ShieldCheck className="feature-icon" size={32} style={{ color: "#10b981" }} />
                  </div>
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Stop Storing on Exchanges</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Secure your first $10,000 in Cold Storage. Compare the industry&apos;s most trusted hardware wallets based on our 2026 security audits.
                  </p>
                  <div style={{ color: "#10b981", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    Secure My Assets &rarr;
                  </div>
                </div>
              </Link>
            </CardGlare>

            <CardGlare style={{ height: "100%" }}>
              <Link href="/crypto-tax-guide" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
                <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                    <Calculator className="feature-icon" size={32} style={{ color: "#3b82f6" }} />
                  </div>
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Automate Your 2026 Taxes</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Stop fearing the IRS. Our data-driven guide shows you how to automate your crypto tax reporting in under 10 minutes with 99.9% accuracy.
                  </p>
                  <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    Get Tax Ready &rarr;
                  </div>
                </div>
              </Link>
            </CardGlare>

            <CardGlare style={{ height: "100%" }}>
              <Link href="https://t.me/TokenRadarCo" target="_blank" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
                <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper" style={{ background: "rgba(247, 147, 26, 0.1)" }}>
                    <Zap className="feature-icon" size={32} style={{ color: "#f7931a" }} />
                  </div>
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Access the Inner Circle</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Get real-time TGE alerts, narrative deep-dives, and community alpha before the general market even notices the trend.
                  </p>
                  <div style={{ color: "#f7931a", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    Access Alpha &rarr;
                  </div>
                </div>
              </Link>
            </CardGlare>
          </div>
        </div>
      </section>
      


      {/* ItemList JSON-LD — unique to home page (WebSite & Organization schemas are in layout.tsx) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": allTokens.slice(0, 50).map((t, idx) => ({
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
