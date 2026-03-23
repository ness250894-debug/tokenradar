import { getUpcomingTGEs } from "@/lib/content-loader";
import { TgeGrid } from "@/components/TgeGrid";
import Link from "next/link";

export const metadata = {
  title: "Upcoming Token Launches & TGEs | TokenRadar",
  description: "Discover and track high-potential crypto projects planning imminent Token Generation Events (TGEs) and ICOs.",
};

export default function UpcomingPage() {
  const upcomingTges = getUpcomingTGEs();

  return (
    <div className="container" style={{ paddingBottom: "var(--space-4xl)" }}>
      <section className="hero" style={{ padding: "var(--space-3xl) 0" }}>
        <h1 className="animate-in">
          Pre-Launch <span className="gradient-text">Spotlight</span>
        </h1>
        <p className="hero-subtitle animate-in animate-delay-1">
          Stay ahead of the market with data-driven insights on upcoming project launches.
        </p>
        <div className="hero-cta animate-in animate-delay-2">
          <Link href="/" className="btn btn-secondary">
            ← Back to Market Overview
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>
            Curated <span className="gradient-text">Upcoming Launches</span>
          </h2>
          <p>Hand-picked projects with significant narrative strength and VC backing.</p>
        </div>

        {upcomingTges.length > 0 ? (
          <TgeGrid tges={upcomingTges} />
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "var(--space-4xl) var(--space-xl)" }}>
            <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>📡</div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>Scanning for new TGEs...</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)", maxWidth: "480px", margin: "0 auto" }}>
              Our AI is currently monitoring RSS feeds and news for the next high-quality token launches. Check back soon!
            </p>
          </div>
        )}
      </section>

      <section className="section" id="how-we-curate" style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", padding: "var(--space-2xl)" }}>
        <div className="section-header">
          <h2>How We <span className="gradient-text">Curate Launches</span></h2>
          <p>We filter out 99% of new tokens to focus only on projects with real institutional interest.</p>
        </div>
        <div className="stats-grid">
          <div className="card">
            <h3>Structural Vetting</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              We prioritize projects with confirmed Tier-1 and Tier-2 VC backing, focusing on infrastructure, AI, and DeFi.
            </p>
          </div>
          <div className="card">
            <h3>Narrative Analysis</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              Our AI scores projects based on social sentiment, technical whitepapers, and market timing.
            </p>
          </div>
          <div className="card">
            <h3>Anti-Rug Precautions</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              We track projects with public teams and transparent development roadmaps to minimize risk.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
