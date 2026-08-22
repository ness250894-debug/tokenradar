import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Database, Download, ShieldAlert, TrendingUp } from "lucide-react";

import { JsonLd } from "@/components/JsonLd";
import { TopicClusterLinks } from "@/components/TopicClusterLinks";
import { getAllTokens, getTokenMetrics } from "@/lib/content-loader";
import { buildMarketRiskSnapshot } from "@/lib/research-snapshot";
import { canonicalUrl } from "@/lib/seo";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

const PAGE_TITLE = "TokenRadar Market Risk Index & Crypto Research";
const PAGE_DESCRIPTION =
  "Original TokenRadar research: equal-weighted risk distribution, category comparisons, liquid high-risk assets, data sources, and reproducible methodology.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/research" },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/research" }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function ResearchPage() {
  const tokens = await getAllTokens();
  const metricRows = await Promise.all(tokens.map(async (token) => [token.id, await getTokenMetrics(token.id)] as const));
  const metricsByTokenId = new Map(metricRows.flatMap(([tokenId, metrics]) => metrics ? [[tokenId, metrics] as const] : []));
  const snapshot = buildMarketRiskSnapshot(tokens, metricsByTokenId);
  const highRiskBucket = snapshot.buckets.find((bucket) => bucket.id === "high");
  const datasetUrl = canonicalUrl("/data/tokenradar-market-risk-snapshot.json");

  return (
    <main className="container">
      <JsonLd
        id="market-risk-dataset-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "TokenRadar Market Risk Snapshot",
          description: PAGE_DESCRIPTION,
          url: canonicalUrl("/research"),
          sameAs: datasetUrl,
          dateModified: snapshot.generatedAt,
          creator: { "@type": "Organization", name: "TokenRadar", url: canonicalUrl("/") },
          isBasedOn: "CoinGecko market data and TokenRadar deterministic scoring metrics",
          measurementTechnique: "Equal-weighted aggregation of TokenRadar risk and volatility metrics",
          variableMeasured: [
            "TokenRadar Market Risk Index",
            "Risk score distribution",
            "Category average risk",
            "Category average volatility",
            "Average 24-hour price change",
          ],
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: datasetUrl,
            },
            {
              "@type": "DataDownload",
              encodingFormat: "text/csv",
              contentUrl: canonicalUrl("/data/tokenradar-category-risk-snapshot.csv"),
            },
          ],
        }}
      />

      <section className="section research-index-hero" aria-labelledby="research-title">
        <div>
          <p className="eyebrow-text">Original data research · zero generative-AI calls</p>
          <h1 id="research-title">
            TokenRadar <span className="gradient-text">Market Risk Index</span>
          </h1>
          <p className="hero-subtitle" style={{ textAlign: "left", marginLeft: 0, maxWidth: 780 }}>
            A reproducible snapshot of observed crypto market risk across {snapshot.sampleSize.toLocaleString("en-US")} scored assets.
            The index is calculated from local market data and documented formulas, not generated commentary.
          </p>
          <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
            <a className="btn btn-primary" href="/data/tokenradar-category-risk-snapshot.csv" download>
              <Download size={16} aria-hidden="true" /> Download category data
            </a>
            <Link className="btn btn-secondary" href="/about#methodology">Review scoring formula</Link>
          </div>
          <p className="last-updated">Metrics computed: {formatDate(snapshot.generatedAt)} · Informational research, not financial advice.</p>
        </div>
      </section>

      <section className="section" aria-label="Market Risk Index summary">
        <div className="stats-grid research-index-stats">
          <div className="stat-card-premium">
            <ShieldAlert className="stat-watermark" aria-hidden="true" />
            <div className="stat-label">Market Risk Index</div>
            <div className="stat-value gradient-text">{snapshot.riskIndex}<span className="stat-value-suffix">/100</span></div>
            <div className="stat-footnote">Equal-weighted; average score {snapshot.averageRisk}/10</div>
          </div>
          <div className="stat-card-premium">
            <Database className="stat-watermark" aria-hidden="true" />
            <div className="stat-label">Scored Sample</div>
            <div className="stat-value gradient-text">{snapshot.sampleSize.toLocaleString("en-US")}</div>
            <div className="stat-footnote">Of {snapshot.trackedTokenCount.toLocaleString("en-US")} tracked assets</div>
          </div>
          <div className="stat-card-premium">
            <BarChart3 className="stat-watermark" aria-hidden="true" />
            <div className="stat-label">Higher-Risk Share</div>
            <div className="stat-value gradient-text">{highRiskBucket?.share || 0}%</div>
            <div className="stat-footnote">Assets scoring 7–10</div>
          </div>
          <div className="stat-card-premium">
            <TrendingUp className="stat-watermark" aria-hidden="true" />
            <div className="stat-label">Average 24h Move</div>
            <div className="stat-value gradient-text">{snapshot.averageChange24h > 0 ? "+" : ""}{snapshot.averageChange24h}%</div>
            <div className="stat-footnote">Equal-weighted across the sample</div>
          </div>
        </div>
      </section>

      <section className="section" id="risk-distribution" aria-labelledby="risk-distribution-title">
        <div className="section-header" style={{ alignItems: "flex-start", textAlign: "left" }}>
          <p className="eyebrow-text">Observed risk distribution</p>
          <h2 id="risk-distribution-title">How the scored market is distributed</h2>
          <p>Bucket shares are calculated from the same 1–10 score displayed on TokenRadar token profiles.</p>
        </div>
        <div className="research-risk-distribution">
          {snapshot.buckets.map((bucket) => (
            <article className="card research-risk-bucket" key={bucket.id}>
              <div>
                <h3>{bucket.label}</h3>
                <span>{bucket.min}–{bucket.max} score</span>
              </div>
              <strong>{bucket.share}%</strong>
              <div className="research-risk-track" aria-label={`${bucket.share}% of the scored sample`}>
                <span style={{ width: `${bucket.share}%` }} />
              </div>
              <p>{bucket.count.toLocaleString("en-US")} assets</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="category-comparison" aria-labelledby="category-comparison-title">
        <div className="section-header" style={{ alignItems: "flex-start", textAlign: "left" }}>
          <p className="eyebrow-text">Category comparison</p>
          <h2 id="category-comparison-title">Risk, volatility, and market movement by category</h2>
          <p>Only categories with at least five scored assets are included. Tokens can belong to more than one category.</p>
        </div>
        <div className="research-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Sample</th>
                <th>Avg risk</th>
                <th>Avg volatility</th>
                <th>Avg 24h</th>
                <th>Market cap represented</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.categories.map((row) => (
                <tr key={row.category}>
                  <td><strong>{row.category}</strong></td>
                  <td>{row.tokenCount}</td>
                  <td>{row.averageRisk}/10</td>
                  <td>{row.averageVolatility}/100</td>
                  <td className={row.averageChange24h >= 0 ? "price-up" : "price-down"}>
                    {row.averageChange24h > 0 ? "+" : ""}{row.averageChange24h}%
                  </td>
                  <td>{formatCompactUsd(row.totalMarketCap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="liquid-risk-title">
        <div className="section-header" style={{ alignItems: "flex-start", textAlign: "left" }}>
          <p className="eyebrow-text">Liquidity-controlled comparison</p>
          <h2 id="liquid-risk-title">Highest observed risk among liquid tracked assets</h2>
          <p>
            This table excludes assets below $1 million in 24-hour volume, then sorts by risk and volatility. It is a screening list, not a ranking of investment quality.
          </p>
        </div>
        <div className="research-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Rank</th>
                <th>Risk</th>
                <th>Volatility</th>
                <th>24h volume</th>
                <th>24h move</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.liquidRiskLeaders.map((row) => (
                <tr key={row.id}>
                  <td><Link href={`/${row.id}`}><strong>{row.name}</strong> ({row.symbol.toUpperCase()})</Link></td>
                  <td>#{row.rank}</td>
                  <td>{row.riskScore}/10</td>
                  <td>{row.volatilityIndex}/100</td>
                  <td>{formatCompactUsd(row.volume24h)}</td>
                  <td className={row.priceChange24h >= 0 ? "price-up" : "price-down"}>
                    {row.priceChange24h > 0 ? "+" : ""}{row.priceChange24h.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" id="methodology" aria-labelledby="research-methodology-title">
        <div className="card research-methodology-card">
          <p className="eyebrow-text">Sources and methodology</p>
          <h2 id="research-methodology-title">How to reproduce and interpret this snapshot</h2>
          <ol>
            <li>Start with TokenRadar&apos;s tracked CoinGecko-backed market registry.</li>
            <li>Include only assets with a completed TokenRadar metric record.</li>
            <li>Calculate the Risk Index as the simple average risk score multiplied by 10.</li>
            <li>Assign scores 1–3 to lower, 4–6 to moderate, and 7–10 to higher observed risk buckets.</li>
            <li>Calculate category averages equally by asset; do not market-cap weight them.</li>
          </ol>
          <p>
            Limitations: category membership can overlap, market data changes continuously, volume does not guarantee executable liquidity,
            and the score does not measure every smart-contract, governance, legal, or counterparty risk. Review the full{" "}
            <Link href="/about#methodology">scoring methodology</Link> and the{" "}
            <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer">CoinGecko data source</a>.
          </p>
          <p>
            Machine-readable files: <a href="/data/tokenradar-market-risk-snapshot.json">JSON snapshot</a> and{" "}
            <a href="/data/tokenradar-category-risk-snapshot.csv">category CSV</a>.
          </p>
        </div>
      </section>

      <TopicClusterLinks current="research" />
    </main>
  );
}
