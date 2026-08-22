import type { Metadata } from "next";
import Link from "next/link";
import { Bell, FileCheck2, Radar, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AlphaTicker } from "@/components/AlphaTicker";
import { MagneticEffect } from "@/components/MagneticEffect";
import { TelegramIcon, XIcon } from "@/components/SocialIcons";
import { TgeGrid } from "@/components/TgeGrid";
import { TopicClusterLinks } from "@/components/TopicClusterLinks";
import { getUpcomingTGEs } from "@/lib/content-loader";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { getTgeEvidenceCount, type TgeLifecycleStatus, type UpcomingTge } from "@/lib/tge";

const PAGE_TITLE = "Upcoming Crypto Launches & TGE Tracker";
const PAGE_DESCRIPTION =
  "Track upcoming crypto launches with source evidence, confidence scoring, status filters, and post-launch graduation signals.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/upcoming",
  },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/upcoming" }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

function countByStatus(tges: UpcomingTge[], status: TgeLifecycleStatus): number {
  return tges.filter((tge) => tge.lifecycleStatus === status).length;
}

function newestVerification(tges: UpcomingTge[]): string {
  const latest = tges
    .map((tge) => new Date(tge.lastVerifiedAt || tge.discoveredAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];

  if (!latest) return "Pending";
  return new Date(latest).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function UpcomingPage() {
  const tges = await getUpcomingTGEs();
  const confirmedCount = countByStatus(tges, "confirmed_tge");
  const watchlistCount = countByStatus(tges, "watchlist");
  const candidateCount = countByStatus(tges, "candidate");
  const staleCount = countByStatus(tges, "stale");
  const graduatedCount = countByStatus(tges, "graduated");
  const totalSignals = tges.reduce((sum, tge) => sum + getTgeEvidenceCount(tge), 0);
  const lastChecked = newestVerification(tges);

  return (
    <div style={{ paddingBottom: "var(--space-4xl)" }}>
      <section className="container" style={{ padding: "var(--space-3xl) var(--space-lg) var(--space-2xl)" }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-end">
          <div className="lg:col-span-2">
            <span className="badge badge-accent" style={{ marginBottom: "var(--space-md)" }}>
              Evidence-based launch tracker
            </span>
            <h1 className="animate-in" style={{ maxWidth: 900 }}>
              Upcoming Crypto Launches & <span className="gradient-text animated">TGE Tracker</span>
            </h1>
            <p className="hero-subtitle animate-in animate-delay-1" style={{ textAlign: "left", marginLeft: 0, maxWidth: 760 }}>
              A structured watchlist for token launches, airdrops, migrations, and post-launch graduation. Each record is labeled by evidence quality instead of hype alone.
            </p>
            <div className="hero-cta animate-in animate-delay-2" style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap", justifyContent: "flex-start" }}>
              <MagneticEffect>
                <Link href="https://t.me/Token_Radar_Official" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TelegramIcon size={18} /> Telegram Alerts
                </Link>
              </MagneticEffect>
              <MagneticEffect>
                <Link href="https://x.com/tokenradarco" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <XIcon size={18} /> Follow Research Feed
                </Link>
              </MagneticEffect>
            </div>
          </div>

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <div className="stat-label">Tracker Snapshot</div>
            <div className="grid grid-cols-2 gap-3" style={{ marginTop: "var(--space-md)" }}>
              <div>
                <div className="stat-value">{confirmedCount}</div>
                <div className="stat-label">Confirmed</div>
              </div>
              <div>
                <div className="stat-value">{watchlistCount}</div>
                <div className="stat-label">Watchlist</div>
              </div>
              <div>
                <div className="stat-value">{graduatedCount}</div>
                <div className="stat-label">Graduated</div>
              </div>
              <div>
                <div className="stat-value">{lastChecked}</div>
                <div className="stat-label">Last Checked</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ marginBottom: "var(--space-2xl)", width: "100vw", position: "relative", left: "50%", right: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <AlphaTicker />
      </div>

      <main className="container">
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-header" style={{ alignItems: "flex-start", textAlign: "left" }}>
            <h2>Launch Records</h2>
            <p>
              Filter by lifecycle status, category, confidence, and source evidence. Candidates are not confirmed launches until stronger signals appear.
            </p>
          </div>
          {tges.length > 0 ? (
            <TgeGrid tges={tges} />
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "var(--space-3xl) var(--space-xl)" }}>
              <Radar size={36} style={{ color: "var(--accent-primary)", margin: "0 auto var(--space-md)" }} />
              <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>No launch records are available</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                The discovery job has not produced a validated TGE watchlist yet.
              </p>
              <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-lg)" }}>
                <Link href="https://t.me/Token_Radar_Official" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <Bell size={18} style={{ marginRight: "0.5rem" }} /> Get Alerts
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="section" id="methodology">
          <div className="section-header" style={{ alignItems: "flex-start", textAlign: "left" }}>
            <h2>Methodology</h2>
            <p>
              The tracker separates discovery from confirmation. A strong narrative score can move a project up the watchlist, but it does not graduate the asset.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="card h-full">
              <FileCheck2 size={28} style={{ color: "var(--accent-primary)", marginBottom: "var(--space-md)" }} />
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Source Evidence</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                Records start from monitored feeds and are normalized into explicit signals such as TGE, airdrop, listing, migration, funding, or product news.
              </p>
            </article>

            <article className="card h-full">
              <SlidersHorizontal size={28} style={{ color: "var(--accent-primary)", marginBottom: "var(--space-md)" }} />
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Confidence Labels</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                Confidence reflects verification quality. Product launches and funding stories stay candidates unless they include direct token evidence.
              </p>
            </article>

            <article className="card h-full">
              <ShieldCheck size={28} style={{ color: "var(--accent-primary)", marginBottom: "var(--space-md)" }} />
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Graduation Rules</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
                Graduation requires market evidence such as a verified aggregator listing, active trading data, or a contract-backed liquidity signal.
              </p>
            </article>
          </div>

          <div className="stats-grid" style={{ marginTop: "var(--space-xl)" }}>
            <div className="stat-card">
              <div className="stat-label">Total Records</div>
              <div className="stat-value">{tges.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Evidence Signals</div>
              <div className="stat-value">{totalSignals}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Research Candidates</div>
              <div className="stat-value">{candidateCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Needs Recheck</div>
              <div className="stat-value">{staleCount}</div>
            </div>
          </div>
        </section>
        <TopicClusterLinks current="launches" />
      </main>
    </div>
  );
}
