import { getUpcomingTGEs } from "@/lib/content-loader";
import { TgeGrid } from "@/components/TgeGrid";
import Link from "next/link";
import { MagneticEffect } from "@/components/MagneticEffect";
import { CardGlare } from "@/components/CardGlare";
import { AlphaTicker } from "@/components/AlphaTicker";
import { XIcon, TelegramIcon } from "@/components/SocialIcons";
import { Bell, Landmark, TrendingUp, ShieldCheck } from "lucide-react";
import { HardwareWalletCTA } from "@/components/HardwareWalletCTA";
import { TaxGuideCTA } from "@/components/TaxGuideCTA";

export const metadata = {
  title: "Upcoming Token Launches & TGEs | TokenRadar",
  description: "Discover and track high-potential crypto projects planning imminent Token Generation Events (TGEs) and ICOs.",
};

export default async function UpcomingPage() {
  const upcomingTges = await getUpcomingTGEs();

  return (
    <div className="container" style={{ paddingBottom: "var(--space-4xl)" }}>
      <section className="hero" style={{ padding: "var(--space-3xl) 0" }}>
        <div className="radar-sweep" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 className="animate-in">
            Pre-Launch <span className="gradient-text animated">Spotlight</span>
          </h1>
          <p className="hero-subtitle animate-in animate-delay-1">
            Stay ahead of the market with data-driven insights on upcoming project launches.
          </p>
            <div className="hero-cta animate-in animate-delay-2" style={{ display: "flex", gap: "var(--space-md)", justifyContent: "center", flexWrap: "wrap" }}>
              <MagneticEffect>
                <Link href="https://t.me/TokenRadarCo" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0.75rem 2rem", fontSize: "1.1rem" }}>
                  <TelegramIcon size={18} /> Join Telegram for Alerts
                </Link>
              </MagneticEffect>
              <MagneticEffect>
                <Link href="https://x.com/tokenradarco" target="_blank" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0.75rem 2rem", fontSize: "1.1rem" }}>
                  <XIcon size={18} /> Follow on X
                </Link>
              </MagneticEffect>
            </div>
        </div>
      </section>

      <div style={{ marginBottom: "var(--space-3xl)", width: "100vw", position: "relative", left: "50%", right: "50%", marginLeft: "-50vw", marginRight: "-50vw" }} className="animate-in animate-delay-3">
        <AlphaTicker />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
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
                <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)", maxWidth: "480px", margin: "0 auto", marginBottom: "var(--space-xl)" }}>
                  Our AI is currently monitoring RSS feeds and VC movements for the next high-quality token launches. Want to know the second they drop?
                </p>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <MagneticEffect>
                    <Link href="https://t.me/TokenRadarCo" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                      <Bell size={18} style={{ marginRight: "0.5rem" }} /> Get Alpha Drops on Telegram
                    </Link>
                  </MagneticEffect>
                </div>
              </div>
            )}
          </section>

          <section className="section" id="how-we-curate" style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", padding: "var(--space-2xl)" }}>
            <div className="section-header">
              <h2>How We <span className="gradient-text">Curate Launches</span></h2>
              <p>We filter out 99% of new tokens to focus only on projects with real institutional interest.</p>
            </div>
            <div className="stats-grid">
              <CardGlare style={{ height: "100%" }}>
                <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper">
                    <Landmark className="feature-icon" size={32} />
                  </div>
                  <h3>Structural Vetting</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                    We prioritize projects with confirmed Tier-1 and Tier-2 VC backing, focusing on infrastructure, AI, and DeFi.
                  </p>
                </div>
              </CardGlare>
              <CardGlare style={{ height: "100%" }}>
                <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper">
                    <TrendingUp className="feature-icon" size={32} />
                  </div>
                  <h3>Narrative Analysis</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                    Our AI scores projects based on social sentiment, technical whitepapers, and market timing.
                  </p>
                </div>
              </CardGlare>
              <CardGlare style={{ height: "100%" }}>
                <div className="card" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                  <div className="feature-icon-wrapper">
                    <ShieldCheck className="feature-icon" size={32} />
                  </div>
                  <h3>Anti-Rug Precautions</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                    We track projects with public teams and transparent development roadmaps to minimize risk.
                  </p>
                </div>
              </CardGlare>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-1">
          <div 
            className="sidebar-sticky"
            style={{ 
              position: "sticky", 
              top: "100px",
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
              paddingRight: "var(--space-xs)"
            }}
          >
            <div className="section-header" style={{ marginBottom: "var(--space-lg)" }}>
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Essential Toolkit</h3>
            </div>
            <HardwareWalletCTA symbol="TGE" name="Pre-Launch Assets" variant="sidebar" />
            <TaxGuideCTA symbol="TGE" name="Airdrop Profits" variant="sidebar" />
            
            <div className="card" style={{ marginTop: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px dashed var(--border-color)" }}>
               <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-xs)" }}>Alpha Access</h4>
               <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                 Upcoming token data is updated in real-time. Follow our X account for instant launch alerts.
               </p>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            .sidebar-sticky::-webkit-scrollbar {
              width: 4px;
            }
            .sidebar-sticky::-webkit-scrollbar-thumb {
              background-color: var(--border-color);
              border-radius: 4px;
            }
          `}} />
        </aside>
      </div>
    </div>
  );
}
