import type { Metadata } from "next";
import Link from "next/link";
import {
  getTokenDetail,
  getTokenMetrics,
  getPriceHistory,
  getTokenIds,
  formatPrice,
  formatCompact,
  formatSupply,
} from "@/lib/content-loader";
import { PriceChart } from "@/components/PriceChart";
import { RiskScoreCard } from "@/components/RiskScoreCard";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

/**
 * Generate static paths for top token combinations.
 * Building all 250*250 combinations (31,250 pages) is too heavy for build times.
 * We limit static generation to the Top 20 tokens.
 */
export async function generateStaticParams() {
  const ids = getTokenIds().slice(0, 20); // Only static-build top 20 tokens
  const params: { slug: string }[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      params.push({ slug: `${ids[i]}-vs-${ids[j]}` });
    }
  }

  return params;
}

/** Extract token IDs from the slug. */
function parseSlug(slug: string): { tokenA: string; tokenB: string } | null {
  const parts = slug.split("-vs-");
  if (parts.length !== 2) return null;
  return { tokenA: parts[0], tokenB: parts[1] };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: "Comparison Not Found" };

  const a = getTokenDetail(parsed.tokenA);
  const b = getTokenDetail(parsed.tokenB);
  if (!a || !b) return { title: "Comparison Not Found" };

  const title = `${a.name} vs ${b.name} — Side-by-Side Comparison`;
  const description = `Compare ${a.name} (${a.symbol.toUpperCase()}) and ${b.name} (${b.symbol.toUpperCase()}) — price, market cap, risk score, growth potential, and more.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/compare/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function ComparePage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseSlug(slug);

  if (!parsed) {
    return (
      <div className="container">
        <section className="section" style={{ textAlign: "center" }}>
          <h1>Invalid Comparison</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Use the format: /compare/token-a-vs-token-b
          </p>
        </section>
      </div>
    );
  }

  const detailA = getTokenDetail(parsed.tokenA);
  const detailB = getTokenDetail(parsed.tokenB);

  if (!detailA || !detailB) {
    return (
      <div className="container">
        <section className="section" style={{ textAlign: "center" }}>
          <h1>Tokens Not Found</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            One or both tokens don&apos;t have data yet.
          </p>
        </section>
      </div>
    );
  }

  const metricsA = getTokenMetrics(parsed.tokenA);
  const metricsB = getTokenMetrics(parsed.tokenB);
  const pricesA = getPriceHistory(parsed.tokenA);
  const pricesB = getPriceHistory(parsed.tokenB);

  const rows = buildComparisonRows(detailA, detailB, metricsA, metricsB);

  return (
    <div className="container">
      <section className="section">
        {/* Breadcrumbs */}
        <nav style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-xl)" }}>
          <Link href="/" style={{ color: "var(--accent-secondary)" }}>Home</Link>
          {" / "}
          <span>Compare</span>
        </nav>

        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
          {detailA.name} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
          <span className="gradient-text">{detailB.name}</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-md)", fontSize: "var(--text-lg)" }}>
          Side-by-side comparison of {detailA.symbol.toUpperCase()} and {detailB.symbol.toUpperCase()} based on real-time data and proprietary metrics.
        </p>

        {/* Comparison Table */}
        <div style={{ marginTop: "var(--space-xl)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>
                  <Link href={`/${parsed.tokenA}`} style={{ color: "var(--accent-secondary)" }}>
                    {detailA.name} ({detailA.symbol.toUpperCase()})
                  </Link>
                </th>
                <th style={thStyle}>
                  <Link href={`/${parsed.tokenB}`} style={{ color: "var(--accent-secondary)" }}>
                    {detailB.name} ({detailB.symbol.toUpperCase()})
                  </Link>
                </th>
                <th style={thStyle}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {row.label}
                  </td>
                  <td style={{ ...tdStyle, color: row.winner === "A" ? "#00e676" : "var(--text-primary)" }}>
                    {row.valueA}
                  </td>
                  <td style={{ ...tdStyle, color: row.winner === "B" ? "#00e676" : "var(--text-primary)" }}>
                    {row.valueB}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {row.winner === "A" ? "◀" : row.winner === "B" ? "▶" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Price Charts Side by Side */}
        <div style={{ marginTop: "var(--space-2xl)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
            30-Day <span className="gradient-text">Price History</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              {pricesA && pricesA.chart30d.length > 0 ? (
                <PriceChart
                  data={pricesA.chart30d}
                  height={200}
                  isPositive={detailA.market.priceChange30d >= 0}
                  label={detailA.name}
                />
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No chart data
                </div>
              )}
            </div>
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              {pricesB && pricesB.chart30d.length > 0 ? (
                <PriceChart
                  data={pricesB.chart30d}
                  height={200}
                  isPositive={detailB.market.priceChange30d >= 0}
                  label={detailB.name}
                />
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No chart data
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Risk Scores */}
        {metricsA && metricsB && (
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-lg)" }}>
              Risk <span className="gradient-text">Assessment</span>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
              <div className="card" style={{ padding: "var(--space-lg)", textAlign: "center" }}>
                <div style={{ fontWeight: 700, marginBottom: "var(--space-md)" }}>{detailA.name}</div>
                <RiskScoreCard score={metricsA.riskScore} />
              </div>
              <div className="card" style={{ padding: "var(--space-lg)", textAlign: "center" }}>
                <div style={{ fontWeight: 700, marginBottom: "var(--space-md)" }}>{detailB.name}</div>
                <RiskScoreCard score={metricsB.riskScore} />
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <strong>Disclaimer:</strong> This comparison is for informational purposes only.
          Data sourced from CoinGecko API. Proprietary metrics are computed by TokenRadar.
          Not financial advice — always DYOR.
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${detailA.name} vs ${detailB.name} — Comparison`,
            description: `Compare ${detailA.name} (${detailA.symbol.toUpperCase()}) and ${detailB.name} (${detailB.symbol.toUpperCase()}) — price, market cap, risk score, growth potential, and more.`,
            image: "https://tokenradar.co/og-image.png",
            author: { "@type": "Organization", name: "TokenRadar", url: "https://tokenradar.co" },
            publisher: { 
              "@type": "Organization", 
              name: "TokenRadar",
              logo: {
                "@type": "ImageObject",
                url: "https://tokenradar.co/icon.png"
              }
            },
            datePublished: detailA.fetchedAt,
            dateModified: detailA.fetchedAt > detailB.fetchedAt ? detailA.fetchedAt : detailB.fetchedAt,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://tokenradar.co/"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": `${detailA.name} vs ${detailB.name}`,
                "item": `https://tokenradar.co/compare/${slug}`
              }
            ]
          }),
        }}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

interface ComparisonRow {
  label: string;
  valueA: string;
  valueB: string;
  winner: "A" | "B" | "tie";
}

function buildComparisonRows(
  a: ReturnType<typeof getTokenDetail>,
  b: ReturnType<typeof getTokenDetail>,
  ma: ReturnType<typeof getTokenMetrics>,
  mb: ReturnType<typeof getTokenMetrics>
): ComparisonRow[] {
  if (!a || !b) return [];

  const rows: ComparisonRow[] = [
    {
      label: "Price",
      valueA: formatPrice(a.market?.price || 0),
      valueB: formatPrice(b.market?.price || 0),
      winner: "tie",
    },
    {
      label: "Market Cap",
      valueA: formatCompact(a.market?.marketCap || 0),
      valueB: formatCompact(b.market?.marketCap || 0),
      winner: (a.market?.marketCap || 0) > (b.market?.marketCap || 0) ? "A" : "B",
    },
    {
      label: "24h Volume",
      valueA: formatCompact(a.market?.volume24h || 0),
      valueB: formatCompact(b.market?.volume24h || 0),
      winner: (a.market?.volume24h || 0) > (b.market?.volume24h || 0) ? "A" : "B",
    },
    {
      label: "24h Change",
      valueA: `${(a.market?.priceChange24h || 0) >= 0 ? "+" : ""}${(a.market?.priceChange24h || 0).toFixed(2)}%`,
      valueB: `${(b.market?.priceChange24h || 0) >= 0 ? "+" : ""}${(b.market?.priceChange24h || 0).toFixed(2)}%`,
      winner: (a.market?.priceChange24h || 0) > (b.market?.priceChange24h || 0) ? "A" : "B",
    },
    {
      label: "30d Change",
      valueA: `${(a.market?.priceChange30d || 0) >= 0 ? "+" : ""}${(a.market?.priceChange30d || 0).toFixed(2)}%`,
      valueB: `${(b.market?.priceChange30d || 0) >= 0 ? "+" : ""}${(b.market?.priceChange30d || 0).toFixed(2)}%`,
      winner: (a.market?.priceChange30d || 0) > (b.market?.priceChange30d || 0) ? "A" : "B",
    },
    {
      label: "ATH",
      valueA: formatPrice(a.market?.ath || 0),
      valueB: formatPrice(b.market?.ath || 0),
      winner: "tie",
    },
    {
      label: "Distance from ATH",
      valueA: `${(a.market?.athChangePercentage || 0).toFixed(1)}%`,
      valueB: `${(b.market?.athChangePercentage || 0).toFixed(1)}%`,
      winner: (a.market?.athChangePercentage || 0) > (b.market?.athChangePercentage || 0) ? "A" : "B",
    },
    {
      label: "Circulating Supply",
      valueA: formatSupply(a.market?.circulatingSupply || 0),
      valueB: formatSupply(b.market?.circulatingSupply || 0),
      winner: "tie",
    },
  ];

  if (ma && mb) {
    rows.push(
      {
        label: "Risk Score",
        valueA: `${ma.riskScore}/10`,
        valueB: `${mb.riskScore}/10`,
        winner: ma.riskScore < mb.riskScore ? "A" : ma.riskScore > mb.riskScore ? "B" : "tie",
      },
      {
        label: "Growth Potential",
        valueA: `${ma.growthPotentialIndex}/100`,
        valueB: `${mb.growthPotentialIndex}/100`,
        winner: ma.growthPotentialIndex > mb.growthPotentialIndex ? "A" : "B",
      },
      {
        label: "Narrative Strength",
        valueA: `${ma.narrativeStrength}/100`,
        valueB: `${mb.narrativeStrength}/100`,
        winner: ma.narrativeStrength > mb.narrativeStrength ? "A" : "B",
      },
      {
        label: "Volatility",
        valueA: `${ma.volatilityIndex}/100`,
        valueB: `${mb.volatilityIndex}/100`,
        winner: ma.volatilityIndex < mb.volatilityIndex ? "A" : ma.volatilityIndex > mb.volatilityIndex ? "B" : "tie",
      }
    );
  }

  return rows;
}

const thStyle: React.CSSProperties = {
  padding: "var(--space-md)",
  textAlign: "left",
  fontSize: "var(--text-sm)",
  fontWeight: 700,
  borderBottom: "2px solid var(--border-color)",
  color: "var(--text-primary)",
};

const tdStyle: React.CSSProperties = {
  padding: "var(--space-sm) var(--space-md)",
  fontSize: "var(--text-sm)",
};
