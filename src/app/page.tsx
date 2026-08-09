import type { Metadata } from "next";
import Link from "next/link";
import { type TokenCardData } from "@/components/TokenCard";
import { getAllTokens, getCategoryIds, getPrimaryTokenCategory, getTokenMetrics, getUpcomingTGEs, getTotalArticleCount, getTopSearchIntentTokens, getSearchIntentDataset, getSearchIntentTrendMap } from "@/lib/content-loader";
import { HomeTabs } from "@/components/HomeTabs";
import { HomeRadarBrief } from "@/components/HomeRadarBrief";
import { HomeSearchIntentRadar } from "@/components/HomeSearchIntentRadar";
import { HomeMarketLab, type NarrativeInsight } from "@/components/HomeMarketLab";
import { HomePartnerPromoCarousel } from "@/components/HomePartnerPromoCarousel";
import { AlphaTicker } from "@/components/AlphaTicker";
import { BinanceLiveMovers } from "@/components/BinanceLiveMovers";
import { JsonLd } from "@/components/JsonLd";
import { Activity, FileText, Database, ShieldCheck, Bot, Calculator, Zap, Rocket, SearchCheck } from "lucide-react";
import { buildSearchIntentCardFields } from "@/lib/search-intent";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

const HOME_SHARE_TITLE = "TokenRadar - Crypto Token Risk Scores & Launch Research";
const HOME_SHARE_DESCRIPTION =
  "A daily crypto research dashboard for token risk scores, launch evidence, and market intelligence.";

export const metadata: Metadata = {
  title: "Crypto Token Risk Scores, Launch Signals & Research",
  description:
    "Track crypto token risk scores, market data, launch watchlists, and AI-assisted research across hundreds of assets. Informational research, not financial advice.",
  openGraph: buildOpenGraphMetadata({
    title: HOME_SHARE_TITLE,
    description: HOME_SHARE_DESCRIPTION,
  }),
  twitter: buildTwitterMetadata({
    title: HOME_SHARE_TITLE,
    description: HOME_SHARE_DESCRIPTION,
  }),
  alternates: {
    canonical: "/",
  },
};

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function buildNarrativeInsights(tokens: TokenCardData[]): NarrativeInsight[] {
  const groups = new Map<string, {
    category: string;
    href?: string;
    tokenCount: number;
    changeSum: number;
    riskSum: number;
    marketCap: number;
  }>();

  for (const token of tokens) {
    if (!token.category) continue;
    const current = groups.get(token.category) || {
      category: token.category,
      href: token.categoryHref,
      tokenCount: 0,
      changeSum: 0,
      riskSum: 0,
      marketCap: 0,
    };

    current.tokenCount += 1;
    current.changeSum += token.priceChange24h || 0;
    current.riskSum += token.riskScore;
    current.marketCap += token.marketCap || 0;
    if (!current.href && token.categoryHref) current.href = token.categoryHref;
    groups.set(token.category, current);
  }

  return Array.from(groups.values())
    .filter((group) => group.tokenCount >= 2)
    .map((group) => ({
      category: group.category,
      href: group.href,
      tokenCount: group.tokenCount,
      avgRisk: Number((group.riskSum / group.tokenCount).toFixed(1)),
      avgChange24h: Number((group.changeSum / group.tokenCount).toFixed(2)),
      marketCap: group.marketCap,
    }))
    .sort((a, b) => Math.abs(b.avgChange24h) - Math.abs(a.avgChange24h) || b.marketCap - a.marketCap)
    .slice(0, 7);
}

export default async function HomePage() {
  const allTokensList = await getAllTokens();
  const categoryIds = await getCategoryIds();
  const upcomingTges = await getUpcomingTGEs();
  const searchIntentDataset = await getSearchIntentDataset();
  const searchIntentTrendMap = await getSearchIntentTrendMap();

  const tokenRows = await Promise.all(
    allTokensList.map(async (token) => {
      const metrics = await getTokenMetrics(token.id);
      const category = getPrimaryTokenCategory(token.categories, categoryIds);
      const searchIntent = searchIntentDataset?.tokens[token.id];
      const searchIntentTrend = searchIntentTrendMap[token.id];
      return {
        hasMetrics: Boolean(metrics),
        token: {
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          imageUrl: token.imageUrl || token.image,
          price: token.price,
          priceChange24h: token.priceChange24h,
          marketCap: token.marketCap,
          riskScore: metrics?.riskScore ?? 5,
          category: category.name,
          categoryHref: category.href,
          ...buildSearchIntentCardFields(searchIntent, searchIntentTrend),
        },
      };
    }),
  );

  const allTokens: TokenCardData[] = tokenRows.map((row) => row.token);
  const totalArticles = await getTotalArticleCount();
  const searchIntentHighlights = await getTopSearchIntentTokens(6);
  const featuredTokens = allTokens.slice(0, 12);
  const featuredTges = upcomingTges.slice(0, 9);
  const narrativeInsights = buildNarrativeInsights(allTokens);
  const scoredTokens = tokenRows
    .filter((row) => row.hasMetrics)
    .map((row) => row.token);
  const scoredRiskScores = tokenRows
    .filter((row) => row.hasMetrics)
    .map((row) => row.token.riskScore);
  const scoredTokenCount = scoredRiskScores.length;
  const marketMoodSampleSize = Math.min(50, allTokens.length);
  const avgMarketRisk =
    scoredRiskScores.length > 0
      ? Number((scoredRiskScores.reduce((sum, score) => sum + score, 0) / scoredRiskScores.length).toFixed(1))
      : 5;

  const marketChange24h = marketMoodSampleSize > 0
    ? allTokens
      .slice(0, marketMoodSampleSize)
      .reduce((acc, token) => acc + (token.priceChange24h || 0), 0) / marketMoodSampleSize
    : 0;

  let marketMood = "Macro Neutral";
  if (marketChange24h > 5) marketMood = "High Momentum";
  else if (marketChange24h > 2) marketMood = "Bullish Pivot";
  else if (marketChange24h < -5) marketMood = "Heavy Volatility";
  else if (marketChange24h < -2) marketMood = "Bearish Pressure";
  else if (avgMarketRisk < 4) marketMood = "Stable Growth";
  else if (avgMarketRisk > 7) marketMood = "High Risk Area";

  return (
    <>
      <section className="hero" id="hero">
        <div className="radar-sweep" />
        <BinanceLiveMovers tokens={allTokensList} />
        <div className="container">
          <h1 className="animate-in">
            Crypto Token <span className="gradient-text animated">Risk Scores</span>, Launch Signals, and Market Research
          </h1>
          <p className="hero-subtitle animate-in animate-delay-1">
            TokenRadar turns market data, launch evidence, and AI-assisted research into a daily dashboard for
            {allTokens.length > 0 ? ` ${formatInteger(allTokens.length)}+ ` : " 250+ "}
            tracked assets and {formatInteger(upcomingTges.length)} launch records. Informational research, not financial advice.
          </p>
          <div className="hero-cta animate-in animate-delay-2">
            <a href="#tokens" className="btn btn-primary">
              Open Market Dashboard
            </a>
            <Link href="/about" className="btn btn-secondary">
              Our Methodology
            </Link>
          </div>
          <div className="hero-proof-strip animate-in animate-delay-3" aria-label="TokenRadar research safeguards">
            <div className="hero-proof-item">
              <Database size={16} />
              <span>CoinGecko-backed market snapshots</span>
            </div>
            <div className="hero-proof-item">
              <SearchCheck size={16} />
              <span>Evidence-weighted launch watchlist</span>
            </div>
            <div className="hero-proof-item">
              <ShieldCheck size={16} />
              <span>Screening tools, not buy or sell calls</span>
            </div>
          </div>
        </div>

        <div className="hero-alpha-ticker animate-in animate-delay-3">
          <AlphaTicker />
        </div>
      </section>

      <section className="section" id="stats" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="stats-grid animate-in animate-delay-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)" }}>
            <div className="stat-card-premium home-stat-card">
              <Activity className="stat-watermark" />
              <div className="stat-label">Tokens Tracked</div>
              <div className="stat-value gradient-text">{allTokens.length > 0 ? `${formatInteger(allTokens.length)}+` : "250+"}</div>
              <div className="stat-change">Market fields per tracked asset</div>
              <div className="stat-footnote">CoinGecko-backed registry</div>
            </div>

            <div className="stat-card-premium home-stat-card">
              <FileText className="stat-watermark" />
              <div className="stat-label">Published Research</div>
              <div className="stat-value gradient-text">{formatInteger(totalArticles)}</div>
              <div className="stat-change">Token briefings and educational guides</div>
              <div className="stat-footnote">Generated with validation checks</div>
            </div>

            <div className="stat-card-premium home-stat-card">
              <ShieldCheck className="stat-watermark" />
              <div className="stat-label">Avg. Market Risk</div>
              <div className="stat-value gradient-text">{avgMarketRisk}<span className="stat-value-suffix">/10</span></div>
              <div className="stat-change" style={{ color: marketChange24h >= 0 ? "var(--green)" : "var(--red)" }}>
                {marketMood}
              </div>
              <div className="stat-footnote">Across {formatInteger(scoredTokenCount)} scored tokens</div>
            </div>

            <div className="stat-card-premium home-stat-card">
              <Rocket className="stat-watermark" />
              <div className="stat-label">Launch Records</div>
              <div className="stat-value gradient-text">{formatInteger(upcomingTges.length)}</div>
              <div className="stat-change">TGE, listing, and watchlist signals</div>
              <div className="stat-footnote">Evidence improves status over time</div>
            </div>
          </div>
        </div>
      </section>

      <HomePartnerPromoCarousel />

      <HomeRadarBrief
        tokens={allTokens}
        scoredTokens={scoredTokens}
        upcomingTges={upcomingTges}
        marketMood={marketMood}
        marketChange24h={marketChange24h}
      />

      <HomeSearchIntentRadar intents={searchIntentHighlights} tokens={allTokens} trends={searchIntentTrendMap} />

      <HomeMarketLab
        tokens={allTokens}
        narratives={narrativeInsights}
        launchTimeline={upcomingTges.slice(0, 5)}
      />

      <section className="section" id="tokens">
        <HomeTabs
          trackedTokens={featuredTokens}
          trackedTotal={allTokens.length}
          upcomingTges={featuredTges}
          upcomingTotal={upcomingTges.length}
        />
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How <span className="gradient-text">TokenRadar</span> Works</h2>
            <p>Every score starts with market data, then adds transparent research rules.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
              <div className="feature-icon-wrapper">
                <Database className="feature-icon" size={32} />
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Market Snapshots</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                The data pipeline captures price, volume, supply, category, and historical context for each tracked asset.
              </p>
            </div>
            <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
              <div className="feature-icon-wrapper">
                <ShieldCheck className="feature-icon" size={32} />
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>Risk Screening</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                Risk Score, Growth Index, and narrative signals help compare assets. They are screening inputs, not investment advice.
              </p>
            </div>
            <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
              <div className="feature-icon-wrapper">
                <Bot className="feature-icon" size={32} />
              </div>
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>AI-Assisted Research</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                AI drafts are constrained by structured token data and checked against quality rules before publication.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="toolkit" style={{ background: "rgba(204, 255, 0, 0.015)", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)" }}>
        <div className="container">
          <div className="section-header">
            <h2>Essential <span className="gradient-text">Crypto Toolkit</span></h2>
            <p>Practical guides for custody, tax workflow planning, and TokenRadar community alerts.</p>
          </div>
          <div className="stats-grid">
            <Link href="/best-crypto-hardware-wallets" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
              <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper" style={{ background: "var(--green-bg)" }}>
                  <ShieldCheck className="feature-icon" size={32} style={{ color: "var(--green)" }} />
                </div>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Hardware Wallet Guide</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                  Compare cold-storage options by security model, signing clarity, asset support, and custody tradeoffs.
                </p>
                <div style={{ color: "var(--green)", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                  Compare Wallets &rarr;
                </div>
              </div>
            </Link>

            <Link href="/crypto-tax-guide" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
              <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper" style={{ background: "rgba(0, 229, 255, 0.1)" }}>
                  <Calculator className="feature-icon" size={32} style={{ color: "var(--accent-secondary)" }} />
                </div>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>Crypto Tax Workflow</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                  Organize exchange, wallet, DeFi, and airdrop activity before filing with crypto tax software workflows.
                </p>
                <div style={{ color: "var(--accent-secondary)", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                  Plan Tax Workflow &rarr;
                </div>
              </div>
            </Link>

            <Link href="https://t.me/Token_Radar_Official" target="_blank" rel="noopener noreferrer" className="card-link-wrapper" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
              <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper" style={{ background: "rgba(204, 255, 0, 0.1)" }}>
                  <Zap className="feature-icon" size={32} style={{ color: "var(--accent-primary)" }} />
                </div>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>TokenRadar Alerts</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)" }}>
                  Follow TGE alerts, research updates, and narrative monitoring from the TokenRadar community channel.
                </p>
                <div style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                  Open Telegram &rarr;
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <JsonLd
        id="home-token-itemlist-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "itemListElement": allTokens.slice(0, 50).map((token, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `https://tokenradar.co/${token.id}`,
            "name": `${token.name} (${token.symbol})`,
          })),
        }}
      />
    </>
  );
}
