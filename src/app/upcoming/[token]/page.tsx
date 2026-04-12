import { getUpcomingTGEs, getArticle, getTokenDetail } from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { LastUpdated } from "@/components/LastUpdated";
import { StickyConversionHeader } from "@/components/StickyConversionHeader";
import { CountUp } from "@/components/CountUp";
import { ContentGate } from "@/components/ContentGate";

interface TgePageProps {
  params: Promise<{ token: string }>;
}

export async function generateStaticParams() {
  const tges = getUpcomingTGEs();
  if (tges.length === 0) return [];
  return tges.map((tge) => ({
    token: tge.id,
  }));
}

export async function generateMetadata({ params }: TgePageProps): Promise<Metadata> {
  const tges = getUpcomingTGEs();
  const { token } = await params;
  const tge = tges.find((t) => t.id === token);

  if (!tge) return { title: "Upcoming TGE | TokenRadar" };

  const isReleased = tge.status === "released";
  const title = isReleased
    ? `${tge.name} (${tge.symbol}) Launch Recap & Analysis | TokenRadar`
    : `${tge.name} (${tge.symbol}) Pre-Launch Spotlight & TGE Date | TokenRadar`;
  const description = isReleased
    ? `${tge.name} has launched and is now trading. Read our launch recap and analysis of this ${tge.category} project.`
    : `Comprehensive pre-launch analysis for ${tge.name}. Discover expected TGE dates, narrative strength, and project categories for this upcoming token.`;

  // If token has graduated and has a main tracked page, set canonical to it
  const tokenDetail = isReleased ? getTokenDetail(tge.id) : null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

  return {
    title,
    description,
    ...(tokenDetail ? { alternates: { canonical: `${siteUrl}/${tge.id}` } } : {}),
  };
}

export default async function TgePage({ params }: TgePageProps) {
  const tges = getUpcomingTGEs();
  const { token } = await params;
  const tge = tges.find((t) => t.id === token);

  if (!tge) return notFound();

  const isReleased = tge.status === "released";
  const article = getArticle(tge.id, "tge-preview");
  const detail = getTokenDetail(tge.id);
  const hasMainPage = isReleased ? !!detail : false;

  const tokenData = {
    name: tge.name,
    symbol: tge.symbol,
    price: detail?.market?.price ?? 0,
    marketCap: detail?.market?.marketCap,
    marketCapRank: detail?.market?.marketCapRank ?? tge.coingeckoRank,
    priceChange24h: detail?.market?.priceChange24h,
    imageUrl: detail?.id ? `/token-icons/${detail.id}.png` : undefined
  };

  return (
    <div className="container" style={{ paddingBottom: "var(--space-4xl)" }}>
      {/* Breadcrumbs */}
      <StickyConversionHeader 
        title={tge.name} 
        symbol={tge.symbol.toUpperCase()} 
        actionText="Get Early Alerts" 
      />
      <div style={{ marginTop: "var(--space-xl)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        <Link href="/">Home</Link> / <Link href="/upcoming">Upcoming</Link> / {tge.name}
      </div>

      <header style={{ marginTop: "var(--space-xl)", marginBottom: "var(--space-3xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
          <span className={`badge ${isReleased ? "badge-green" : "badge-accent"}`}>
            {isReleased ? "✓ Released — Launch Recap" : "Pre-Launch Spotlight"}
          </span>
          <span className="last-updated">
            {isReleased && tge.graduatedAt
              ? `Launched: ${new Date(tge.graduatedAt).toLocaleDateString()}`
              : `Discovered: ${new Date(tge.discoveredAt).toLocaleDateString()}`}
          </span>
        </div>
        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800 }}>{tge.name} ({tge.symbol.toUpperCase()})</h1>
        <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
          {isReleased
            ? `Launch recap for ${tge.name}, a ${tge.category} project now trading on major exchanges.`
            : `Curated launch analysis for the anticipated ${tge.category} project.`}
        </p>
      </header>

      {/* Graduated Banner — link to main tracked page */}
      {isReleased && hasMainPage && (
        <div style={{
          padding: "var(--space-lg)",
          background: "linear-gradient(135deg, rgba(0,200,83,0.1), rgba(0,200,83,0.05))",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(0,200,83,0.2)",
          marginBottom: "var(--space-2xl)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <strong style={{ color: "var(--green)" }}>🎓 This token has launched!</strong>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
              {tge.name} is now actively trading{tge.coingeckoRank ? ` (Rank #${tge.coingeckoRank})` : ""}. View live price data, analysis, and predictions.
            </p>
          </div>
          <Link href={`/${tge.id}`} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
            View Full Analysis →
          </Link>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: "var(--space-3xl)" }}>
        <div className="stat-card">
          <div className="stat-label">{isReleased ? "Launched" : "Expected TGE"}</div>
          <div className="stat-value">
            {isReleased && tge.graduatedAt
              ? new Date(tge.graduatedAt).toLocaleDateString()
              : tge.expectedTge}
          </div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>
            {isReleased ? "Launch Date" : "Target Launch Window"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Narrative Strength</div>
          <div className="stat-value" style={{ color: "var(--yellow)", display: "flex", alignItems: "baseline", gap: "2px" }}>
            <CountUp end={tge.narrativeStrength} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>/100</span>
          </div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Based on AI Sentiment</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Project Category</div>
          <div className="stat-value">{tge.category}</div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Sector Focus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{isReleased ? "CoinGecko Rank" : "Source"}</div>
          <div className="stat-value" style={{ fontSize: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: "4px" }}>
            {isReleased && tge.coingeckoRank
              ? <><CountUp end={tge.coingeckoRank} prefix="#" /></>
              : (() => { try { return new URL(tge.dataSource).hostname; } catch { return tge.dataSource; } })()}
          </div>
          <div className="stat-change">
            {isReleased && hasMainPage ? (
              <Link href={`/${tge.id}`} style={{ color: "var(--accent-secondary)" }}>View Token Page →</Link>
            ) : (
              <a href={tge.dataSource} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-secondary)" }}>View Source →</a>
            )}
          </div>
        </div>
      </div>

      <div className="article-content" style={{ position: "relative" }}>
        {article ? (
          <div>
            {isReleased ? (
              <div dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content, tokenData) }} />
            ) : (
              <ContentGate htmlContent={markdownToHtml(article.content, tokenData)} />
            )}
            
            {isReleased && (
              <div style={{ marginTop: "var(--space-lg)" }}>
                <LastUpdated date={article.generatedAt} />
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2>{isReleased ? "Launch Summary" : "Pre-Launch Summary"}</h2>
            <p>
              {tge.name} is a {isReleased ? "recently launched" : "high-potential"} project in the <strong>{tge.category}</strong> sector.{" "}
              {isReleased
                ? "This token has graduated from our upcoming launches tracker and is now actively trading on major exchanges."
                : "Our scanners have identified this as a high-conviction launch based on early narrative strength and expected ecosystem impact."}
            </p>
            {!isReleased && (
              <p>
                While the official tokenomics and exact TGE date may still be subject to change, current market consensus points towards a{" "}
                <strong>{tge.expectedTge}</strong> launch window.
              </p>
            )}
            <div style={{
              marginTop: "var(--space-lg)",
              padding: "var(--space-lg)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderLeft: "3px solid var(--accent-primary)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              lineHeight: 1.7,
            }}>
              {isReleased
                ? "This project has launched. Visit the full token page for live price data and detailed analysis."
                : "This is a pre-launch summary. Detailed price predictions and risk scores will be available once market liquidity is established on major exchanges."}
            </div>
          </div>
        )}
      </div>

      {/* Telegram CTA */}
      <div style={{
        marginTop: "var(--space-3xl)",
        padding: "var(--space-xl)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        textAlign: "center",
      }}>
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Stay Updated</h3>
        <p style={{ margin: "var(--space-sm) 0 var(--space-md)", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Track {tge.name} and other premium launches on Telegram.
        </p>
        <a href="https://t.me/TokenRadarCo" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          Join Telegram Alert Hub
        </a>
      </div>
      
      <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-2xl)", marginBottom: "-var(--space-xl)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-xs) var(--space-md)", background: "rgba(0, 200, 83, 0.1)", border: "1px solid rgba(0, 200, 83, 0.2)", borderRadius: "999px" }}>
          <div style={{ width: 8, height: 8, backgroundColor: "var(--green)", borderRadius: "50%", animation: "pulse 2s infinite" }}></div>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--green)", fontWeight: 600 }}>Verified by TokenRadar Engine</span>
        </div>
      </div>
      
      {/* Back Toast */}
      <div className="back-toast-container">
        <Link href="/upcoming" className="back-toast-btn">
          <span>←</span> Back to Upcoming Launches
        </Link>
      </div>
    </div>
  );
}
