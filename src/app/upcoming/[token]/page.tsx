import { getUpcomingTGEs, getArticle } from "@/lib/content-loader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";

interface TgePageProps {
  params: { token: string };
}

export async function generateStaticParams() {
  const tges = getUpcomingTGEs();
  if (tges.length === 0) return [{ token: "placeholder" }];
  return tges.map((tge) => ({
    token: tge.id,
  }));
}

export async function generateMetadata({ params }: TgePageProps): Promise<Metadata> {
  const tges = getUpcomingTGEs();
  const tge = tges.find((t) => t.id === params.token);

  if (!tge) return { title: "Upcoming TGE | TokenRadar" };

  return {
    title: `${tge.name} (${tge.symbol}) Pre-Launch Spotlight & TGE Date | TokenRadar`,
    description: `Comprehensive pre-launch analysis for ${tge.name}. Discover expected TGE dates, narrative strength, and project categories for this upcoming token.`,
  };
}

export default async function TgePage({ params }: TgePageProps) {
  const tges = getUpcomingTGEs();
  const tge = tges.find((t) => t.id === params.token);

  if (!tge) return notFound();

  // Load the AI-generated preview article if it exists
  const article = getArticle(tge.id, "tge-preview");

  return (
    <div className="container" style={{ paddingBottom: "var(--space-4xl)" }}>
      {/* Breadcrumbs */}
      <div style={{ marginTop: "var(--space-xl)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        <Link href="/">Home</Link> / <Link href="/upcoming">Upcoming</Link> / {tge.name}
      </div>

      <header style={{ marginTop: "var(--space-xl)", marginBottom: "var(--space-3xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
          <span className="badge badge-accent">Pre-Launch Spotlight</span>
          <span className="last-updated">Discovered: {new Date(tge.discoveredAt).toLocaleDateString()}</span>
        </div>
        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800 }}>{tge.name} ({tge.symbol.toUpperCase()})</h1>
        <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
          Curated launch analysis for the anticipated {tge.category} project.
        </p>
      </header>

      <div className="stats-grid" style={{ marginBottom: "var(--space-3xl)" }}>
        <div className="stat-card">
          <div className="stat-label">Expected TGE</div>
          <div className="stat-value">{tge.expectedTge}</div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Target Launch Window</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Narrative Strength</div>
          <div className="stat-value" style={{ color: "var(--yellow)" }}>{tge.narrativeStrength}/100</div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Based on AI Sentiment</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Project Category</div>
          <div className="stat-value">{tge.category}</div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Sector Focus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Source</div>
          <div className="stat-value" style={{ fontSize: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis" }}>
            {new URL(tge.dataSource).hostname}
          </div>
          <div className="stat-change">
            <a href={tge.dataSource} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-secondary)" }}>View Source →</a>
          </div>
        </div>
      </div>

      <div className="article-content">
        {article ? (
          <div dangerouslySetInnerHTML={{ __html: article.content }} />
        ) : (
          <div>
            <h2>Launch Summary</h2>
            <p>
              {tge.name} is a high-potential project in the {tge.category} sector. 
              Our scanners have identified this as a high-conviction launch based on early narrative strength and expected ecosystem impact.
            </p>
            <p>
              While the official tokenomics and exact TGE date may still be subject to change, current market consensus points towards a 
              <strong> {tge.expectedTge} </strong> launch window.
            </p>
            <blockquote>
              Note: This is a pre-launch summary. Detailed price predictions and risk scores will be available once market liquidity is established on major exchanges.
            </blockquote>
          </div>
        )}

        <div style={{ marginTop: "var(--space-4xl)", padding: "var(--space-xl)", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", textAlign: "center" }}>
          <h3>Stay Updated</h3>
          <p style={{ margin: "var(--space-md) 0" }}>Track {tge.name} and other premium launches on Telegram.</p>
          <a href="https://t.me/TokenRadarCo" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Join Telegram Alert Hub
          </a>
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
