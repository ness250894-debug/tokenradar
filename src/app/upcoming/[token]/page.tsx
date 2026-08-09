import { getUpcomingTGEs, getArticle, getTokenDetail } from "@/lib/content-loader";
import { markdownToHtml } from "@/lib/markdown";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LastUpdated } from "@/components/LastUpdated";
import { StickyConversionHeader } from "@/components/StickyConversionHeader";
import { CountUp } from "@/components/CountUp";
import { ResearchFreshnessNotice } from "@/components/ResearchFreshnessNotice";
import {
  buildEntitySeoTitle,
  buildSeoDescription,
  choosePreferredTgeId,
  getTgeDuplicateKey,
  getTgeIndexDecision,
} from "@/lib/seo";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { getTgeEvidenceCount, getTgeSourceHost, getTgeStatusLabel } from "@/lib/tge";

interface TgePageProps {
  params: Promise<{ token: string }>;
}

function formatDate(value: string | undefined): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function generateStaticParams() {
  const tges = await getUpcomingTGEs();
  if (tges.length === 0) return [];
  return tges.map((tge) => ({
    token: tge.id,
  }));
}

export async function generateMetadata({ params }: TgePageProps): Promise<Metadata> {
  const tges = await getUpcomingTGEs();
  const { token } = await params;
  const tge = tges.find((t) => t.id === token);

  if (!tge) return { title: "Upcoming TGE" };

  const isReleased = tge.status === "released";
  const title = buildEntitySeoTitle({
    name: tge.name,
    symbol: tge.symbol,
    after: isReleased ? " Launch Recap" : " TGE Watchlist",
  });
  const description = buildSeoDescription(isReleased
    ? `${tge.name} has launched and is now trading. Read our launch recap and analysis of this ${tge.category} project.`
    : `Evidence-based launch watchlist for ${tge.name}, including TGE status, confidence, source signals, and graduation criteria.`);

  const duplicateKey = getTgeDuplicateKey(tge);
  const duplicates = tges.filter((item) => getTgeDuplicateKey(item) === duplicateKey);
  const candidates = await Promise.all(duplicates.map(async (item) => ({
    tge: item,
    article: await getArticle(item.id, "tge-preview"),
    hasLiveToken: item.status === "released" && Boolean(await getTokenDetail(item.id)),
  })));
  const preferredTgeId = choosePreferredTgeId(candidates) || tge.id;
  const currentCandidate = candidates.find((candidate) => candidate.tge.id === tge.id) || {
    tge,
    article: null,
    hasLiveToken: false,
  };
  const decision = getTgeIndexDecision(currentCandidate, preferredTgeId);

  return {
    title,
    description,
    robots: {
      index: decision.indexable,
      follow: true,
    },
    alternates: {
      canonical: decision.canonical,
    },
    openGraph: buildOpenGraphMetadata({ title, description, type: "article" }),
    twitter: buildTwitterMetadata({ title, description }),
  };
}

export default async function TgePage({ params }: TgePageProps) {
  const tges = await getUpcomingTGEs();
  const { token } = await params;
  const tge = tges.find((t) => t.id === token);

  if (!tge) return notFound();

  const isReleased = tge.status === "released";
  const article = await getArticle(tge.id, "tge-preview");
  const detail = isReleased ? await getTokenDetail(tge.id) : null;
  const hasMainPage = isReleased ? !!detail : false;
  const statusLabel = getTgeStatusLabel(tge);
  const evidenceCount = getTgeEvidenceCount(tge);
  const sourceHost = getTgeSourceHost(tge.dataSource);

  const tokenData = {
    id: detail?.id ?? tge.id,
    name: tge.name,
    symbol: tge.symbol,
    price: detail?.market?.price ?? 0,
    marketCap: detail?.market?.marketCap,
    marketCapRank: detail?.market?.marketCapRank ?? tge.coingeckoRank,
    priceChange24h: detail?.market?.priceChange24h,
    imageUrl: detail?.imageUrl
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
            {statusLabel}
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
            ? `Launch recap for ${tge.name}, a ${tge.category} project now trading with market coverage.`
            : `Evidence-based launch watchlist for this ${tge.category} project.`}
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
          <div className="stat-label">Signal Strength</div>
          <div className="stat-value" style={{ color: "var(--yellow)", display: "flex", alignItems: "baseline", gap: "2px" }}>
            <CountUp end={tge.narrativeStrength} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>/100</span>
          </div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>Narrative attention</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confidence</div>
          <div className="stat-value" style={{ color: "var(--accent-primary)", display: "flex", alignItems: "baseline", gap: "2px" }}>
            <CountUp end={tge.confidence || 0} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>/100</span>
          </div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>{statusLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{isReleased ? "CoinGecko Rank" : "Source"}</div>
          <div className="stat-value" style={{ fontSize: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: "4px" }}>
            {isReleased && tge.coingeckoRank
              ? <><CountUp end={tge.coingeckoRank} prefix="#" /></>
              : sourceHost}
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

      <section className="section" style={{ marginBottom: "var(--space-3xl)", padding: 0 }}>
        <div className="section-header" style={{ marginBottom: "var(--space-lg)", alignItems: "flex-start", textAlign: "left" }}>
          <h2 style={{ fontSize: "var(--text-2xl)" }}>Launch Evidence</h2>
          <p>
            TokenRadar separates early discovery from confirmation. This project currently has {evidenceCount} structured evidence signal{evidenceCount === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(tge.signals || []).map((signal) => (
            <a
              key={`${signal.type}-${signal.url}`}
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card"
              style={{ textDecoration: "none", color: "inherit", padding: "var(--space-md)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
                <span className="badge badge-accent" style={{ fontSize: "0.7rem" }}>{signal.type.replace(/_/g, " ")}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{signal.sourceType}</span>
              </div>
              <strong style={{ display: "block", marginTop: "var(--space-sm)", fontSize: "var(--text-sm)" }}>
                {signal.title || getTgeSourceHost(signal.url)}
              </strong>
              <span style={{ display: "block", marginTop: "var(--space-xs)", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                Observed {formatDate(signal.observedAt)}
              </span>
            </a>
          ))}
        </div>

        <div style={{ marginTop: "var(--space-lg)", padding: "var(--space-md)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Graduation requires verified trading evidence, such as an aggregator listing, a contract-backed liquidity pool, or reliable market data. Until then, price and market cap fields remain unavailable.
        </div>
      </section>

      <div className="article-content" style={{ position: "relative" }}>
        {article ? (
          <div>
            <ResearchFreshnessNotice
              contentUpdatedAt={article.generatedAt}
              marketDataAt={detail?.fetchedAt}
              evidenceCheckedAt={tge.lastVerifiedAt}
            />
            <div dangerouslySetInnerHTML={{ __html: await markdownToHtml(article.content, tokenData) }} />
            
            <div style={{ marginTop: "var(--space-lg)" }}>
              <LastUpdated date={article.generatedAt} />
            </div>
          </div>
        ) : (
          <div>
            <h2>{isReleased ? "Launch Summary" : "Pre-Launch Summary"}</h2>
            <p>
              {tge.name} is a {isReleased ? "recently launched" : "tracked"} project in the <strong>{tge.category}</strong> sector.{" "}
              {isReleased
                ? "This token has graduated from the upcoming launches tracker and now has market coverage."
                : "The project remains on the watchlist until stronger official, exchange, aggregator, or on-chain evidence appears."}
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
                : "This is a pre-launch summary. Price analysis and risk scoring become available after reliable market liquidity is established."}
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
        <a href="https://t.me/Token_Radar_Official" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          Join Telegram Alert Hub
        </a>
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
