import { type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { getAllTokens, getTokenMetrics, getUpcomingTGEs, getTotalArticleCount } from "@/lib/content-loader";
import { HomeTabs } from "@/components/HomeTabs";
import Link from "next/link";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CountUp } from "@/components/CountUp";
import { AlphaTicker } from "@/components/AlphaTicker";
import { CardGlare } from "@/components/CardGlare";
import { Activity, FileText, Clock, Database, ShieldCheck, Bot, Users, Calculator, Zap } from "lucide-react";
import { XIcon, TelegramIcon } from "@/components/SocialIcons";

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
          <div className="stats-grid animate-in animate-delay-3">
            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%" }}>
                <Activity className="stat-watermark" />
                <div className="stat-label">Tokens Tracked</div>
                <div className="stat-value gradient-text">
                  <CountUp end={allTokens.length > 0 ? allTokens.length : 250} suffix="+" />
                </div>
                <div className="stat-change" style={{ color: "var(--text-muted)" }}>Active Data Feeds</div>
              </div>
            </CardGlare>
            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%" }}>
                <FileText className="stat-watermark" />
                <div className="stat-label">Articles Published</div>
                <div className="stat-value gradient-text">
                  <CountUp end={getTotalArticleCount()} />
                </div>
                <div className="stat-change" style={{ color: "var(--text-muted)" }}>AI-Generated Research</div>
              </div>
            </CardGlare>
            <CardGlare style={{ height: "100%" }}>
              <RiskScoreCard score={avgMarketRisk} label="Avg. Market Risk" />
            </CardGlare>
            <CardGlare style={{ height: "100%" }}>
              <div className="stat-card-premium" style={{ height: "100%" }}>
                <Clock className="stat-watermark" />
                <div className="stat-label">Data Freshness</div>
                <div className="stat-value gradient-text">24h</div>
                <div className="stat-change" style={{ color: "var(--green)" }}>Auto-refreshed daily</div>
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
          <div className="stats-grid">
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
            <p>Proven tools to secure your assets and maximize your market edge.</p>
          </div>
          <div className="stats-grid">
            <CardGlare style={{ height: "100%" }}>
              <Link href="/best-crypto-hardware-wallets" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
                <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                    <ShieldCheck className="feature-icon" size={32} style={{ color: "#10b981" }} />
                  </div>
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Hardware Wallets</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Stop &quot;Blind Signing&quot; and move your private keys offline. See the 2026 winners for top cold storage.
                  </p>
                  <div style={{ color: "#10b981", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    View Comparison Guide &rarr;
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
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Tax & Compliance</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Eliminate IRS stress with our automated tax guide. Integrated tips for 250+ tokens in one place.
                  </p>
                  <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    Start Calculating &rarr;
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
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Alpha Opportunity</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                    Join 10k+ traders getting real-time alerts on TGEs, narative shifts, and high-growth token scanners.
                  </p>
                  <div style={{ color: "#f7931a", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                    Join Community &rarr;
                  </div>
                </div>
              </Link>
            </CardGlare>
          </div>
        </div>
      </section>
      


      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "TokenRadar",
            url: "https://tokenradar.co",
            potentialAction: {
              "@type": "SearchAction",
              target: "https://tokenradar.co/search?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }),
        }}
      />
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
