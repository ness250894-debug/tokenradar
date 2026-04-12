import { type TokenCardData } from "@/components/TokenCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { getAllTokens, getTokenMetrics, getUpcomingTGEs, getTotalArticleCount } from "@/lib/content-loader";
import { HomeTabs } from "@/components/HomeTabs";
import Link from "next/link";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CountUp } from "@/components/CountUp";
import { AlphaTicker } from "@/components/AlphaTicker";
import { CardGlare } from "@/components/CardGlare";
import { Activity, FileText, Clock, Database, ShieldCheck, Bot, Users } from "lucide-react";
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
      
      <section className="section" id="community">
        <div className="container">
          <div className="card" style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center", padding: "var(--space-3xl) var(--space-xl)", background: "linear-gradient(145deg, var(--bg-card) 0%, rgba(217, 119, 6, 0.05) 100%)", borderColor: "rgba(217, 119, 6, 0.2)" }}>
            <Users size={48} style={{ color: "var(--accent-primary)", marginBottom: "var(--space-lg)", opacity: 0.8 }} />
            <h2 style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-md)" }}>Join the <span className="gradient-text">Alpha Community</span></h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-lg)", marginBottom: "var(--space-2xl)", maxWidth: "500px", margin: "0 auto var(--space-2xl)" }}>
              Don&apos;t miss a single market pulse. Get real-time TGE alerts, narrative deep-dives, and community alpha.
            </p>
            <div className="social-cta-container" style={{ display: "flex", gap: "var(--space-md)", justifyContent: "center", flexWrap: "wrap" }}>
              <MagneticEffect>
                <Link href="https://t.me/TokenRadarCo" target="_blank" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 24px" }}>
                  <TelegramIcon size={20} /> Join Telegram
                </Link>
              </MagneticEffect>
              <MagneticEffect>
                <Link href="https://x.com/tokenradarco" target="_blank" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 24px" }}>
                  <XIcon size={20} /> Follow on X
                </Link>
              </MagneticEffect>
            </div>
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
