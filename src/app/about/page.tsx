import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { TopicClusterLinks } from "@/components/TopicClusterLinks";
import { getAllTokens, getUpcomingTGEs } from "@/lib/content-loader";
import { getSiteUrl } from "@/lib/seo";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { buildAuthorPersonSchema, buildPublisherSchema } from "@/lib/schema-entities";

const METHODOLOGY_VERSION = "v1.5";
const METHODOLOGY_LAST_REVIEWED = "2026-08-10";
const PAGE_TITLE = "TokenRadar Methodology & Data Sources";
const PAGE_DESCRIPTION =
  "How TokenRadar scores 500+ crypto assets using CoinGecko market data, documented risk formulas, launch evidence, AI-assisted research, and disclosure rules.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/about",
  },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function getRankRange(ranks: number[]): string {
  if (!ranks.length) return "Rank data pending";
  return `#${formatInteger(Math.min(...ranks))} to #${formatInteger(Math.max(...ranks))}`;
}

function getReviewedLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

const noteStyle = {
  color: "var(--text-secondary)",
  fontSize: "var(--text-sm)",
} as const;

const tableScrollStyle = {
  overflowX: "auto",
  margin: "var(--space-2xl) 0",
} as const;

const tableStyle = {
  minWidth: 680,
  margin: 0,
} as const;

const metricTableRows = [
  {
    metric: "Risk Score",
    scale: "1-10",
    inputs: "30-day volatility, market cap, 24h volume-to-cap, ATH drawdown",
    interpretation: "Higher score means higher observed market risk.",
  },
  {
    metric: "Growth Potential Index",
    scale: "0-100",
    inputs: "ATH drawdown, category-relative market cap, 30-day momentum",
    interpretation: "Higher score means more recovery or peer-relative upside potential.",
  },
  {
    metric: "Narrative Strength",
    scale: "0-100",
    inputs: "Curated category score inherited from the token's strongest category",
    interpretation: "Higher score means the asset belongs to a stronger current market narrative.",
  },
  {
    metric: "Volatility Index",
    scale: "0-100",
    inputs: "30-day coefficient of variation",
    interpretation: "Higher score means wider recent price swings.",
  },
  {
    metric: "Value vs ATH",
    scale: "0-100%",
    inputs: "CoinGecko all-time-high change percentage",
    interpretation: "100 means at ATH; 10 means roughly 90% below ATH.",
  },
] as const;

export default async function AboutPage() {
  const [tokens, upcomingTges] = await Promise.all([getAllTokens(), getUpcomingTGEs()]);
  const ranks = tokens.map((token) => token.rank).filter((rank) => Number.isFinite(rank) && rank > 0);
  const reviewedLabel = getReviewedLabel(METHODOLOGY_LAST_REVIEWED);
  const siteUrl = getSiteUrl();

  return (
    <div className="container">
      <JsonLd
        id="about-page-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "TokenRadar Methodology & Data Sources",
          url: `${siteUrl}/about`,
          dateModified: METHODOLOGY_LAST_REVIEWED,
          isPartOf: {
            "@type": "WebSite",
            name: "TokenRadar",
            url: siteUrl,
          },
          publisher: buildPublisherSchema(siteUrl),
          author: buildAuthorPersonSchema(siteUrl),
          about: [
            "Crypto token risk methodology",
            "Cryptocurrency market data sources",
            "AI-assisted crypto research process",
          ],
        }}
      />

      <section className="section">
        <div className="article-content">
          <p className="last-updated" style={{ marginBottom: "var(--space-md)" }}>
            Methodology {METHODOLOGY_VERSION} · Last reviewed: {reviewedLabel}
          </p>

          <h1>
            TokenRadar <span className="gradient-text">Methodology</span>
          </h1>
          <p style={{ fontSize: "var(--text-lg)", marginTop: "var(--space-lg)" }}>
            TokenRadar is an independent crypto research platform that turns market
            data, source evidence, and documented scoring rules into explainable
            token research. Our scores are analytical signals, not buy/sell
            recommendations, investment advice, or guarantees of future returns.
          </p>

          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "var(--space-md)",
              margin: "var(--space-xl) 0 var(--space-2xl)",
            }}
          >
            <div className="stat-card">
              <div className="stat-label">Tracked Assets</div>
              <div className="stat-value">{formatInteger(tokens.length)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Rank Coverage</div>
              <div className="stat-value" style={{ fontSize: "var(--text-xl)" }}>
                {getRankRange(ranks)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">TGE Records</div>
              <div className="stat-value">{formatInteger(upcomingTges.length)}</div>
            </div>
          </div>

          <h2 id="methodology">What We Measure</h2>
          <p>
            Every token profile starts with third-party market data, then adds
            TokenRadar metrics computed from transparent inputs. Some inputs are
            objective market fields; others, such as category narrative scores,
            are curated assumptions that we document instead of presenting as
            hard facts.
          </p>

          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Scale</th>
                  <th>Inputs</th>
                  <th>How to read it</th>
                </tr>
              </thead>
              <tbody>
                {metricTableRows.map((row) => (
                  <tr key={row.metric}>
                    <td>
                      <strong>{row.metric}</strong>
                    </td>
                    <td>{row.scale}</td>
                    <td>{row.inputs}</td>
                    <td>{row.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Risk Score Formula</h2>
          <p>
            The Risk Score is a 1-10 score. It is rounded to the nearest whole
            number and clamped between 1 and 10. Higher scores indicate higher
            observed market risk.
          </p>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Weight</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>30-day volatility</td>
                  <td>0-2.5 pts</td>
                  <td>Coefficient of variation. CV at or above 20% reaches max contribution.</td>
                </tr>
                <tr>
                  <td>Market cap</td>
                  <td>0-2.5 pts</td>
                  <td>$10B+ contributes 0; $500M or lower contributes 2.5; between them is linear.</td>
                </tr>
                <tr>
                  <td>Volume-to-cap proxy</td>
                  <td>0-2.5 pts</td>
                  <td>24h volume / market cap. Above 10% contributes 0; below 1% contributes 2.5.</td>
                </tr>
                <tr>
                  <td>ATH drawdown</td>
                  <td>0-2.5 pts</td>
                  <td>Drawdown reaches max contribution around 90% below all-time high.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={noteStyle}>
            Limitation: the liquidity input is a volume-based proxy. It does not
            directly measure live order-book depth, bid/ask spread, DEX pool
            depth, or expected slippage for a specific trade size.
          </p>

          <h2>Growth Potential Index</h2>
          <p>
            Growth Potential is a 0-100 score designed to show recovery room and
            peer-relative room, not a forecast. It combines three factors:
          </p>
          <ul>
            <li>
              <strong>Distance from ATH, up to 40 points:</strong> deeper
              drawdowns receive more recovery-room credit, capped near a 95%
              drawdown.
            </li>
            <li>
              <strong>Market cap vs category median, up to 40 points:</strong>{" "}
              tokens below their category median market cap receive more
              relative-upside credit.
            </li>
            <li>
              <strong>30-day momentum, up to 20 points:</strong> positive
              30-day price change contributes up to the cap; negative momentum
              contributes 0.
            </li>
          </ul>
          <p style={noteStyle}>
            Limitation: a token trading far below ATH may be permanently impaired.
            This metric is a screening aid, not evidence that a prior high will
            be revisited.
          </p>

          <h2>Narrative Strength</h2>
          <p>
            Narrative Strength is a curated category score. Each token inherits
            the highest score from its matched categories. Current high-scoring
            categories include <strong>AI</strong> (95),{" "}
            <strong>Layer 2</strong> (85),{" "}
            <strong>Real-World Assets</strong> (80),{" "}
            <strong>DePIN</strong> (78), <strong>meme</strong> (75), and{" "}
            <strong>gaming</strong> (70).
          </p>
          <p style={noteStyle}>
            Limitation: narrative scores are editorial assumptions about market
            attention. They are reviewed periodically, but they are not objective
            measurements like price, volume, or market cap.
          </p>

          <h2>Volatility & Value vs ATH</h2>
          <p>
            The Volatility Index uses the 30-day coefficient of variation for
            daily prices and scales it to a 0-100 display range. Value vs ATH
            shows the current price as a percentage of the all-time high using
            the source ATH change percentage.
          </p>
          <p style={noteStyle}>
            Limitation: both metrics are backward-looking. They describe recent
            price behavior and historical peak distance, not future direction.
          </p>

          <h2>Data Sources</h2>
          <p>
            Market price, volume, market capitalization, rank, supply, ATH, ATL,
            and category data are sourced primarily from the{" "}
            <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer">
              CoinGecko API
            </a>
            . TokenRadar refreshes market data through automated pipelines and
            recomputes proprietary metrics after each refresh.
          </p>
          <p>
            CoinGecko data is third-party data. We do not claim CoinGecko
            endorses TokenRadar, and users should verify critical market fields
            against primary sources before making financial decisions.
          </p>

          <h2>Pre-Launch TGE Discovery</h2>
          <p>
            TokenRadar monitors RSS and source feeds from{" "}
            <strong>Airdrop Alert</strong>, <strong>ICO Watch List</strong>,{" "}
            <strong>CoinTelegraph</strong>, <strong>Decrypt</strong>, and{" "}
            <strong>CoinDesk</strong> to identify possible token launches,
            token sales, airdrops, exchange listings, migrations, and graduation
            events.
          </p>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Candidate</td>
                  <td>Weak or early signal that needs additional source evidence.</td>
                </tr>
                <tr>
                  <td>Watchlist</td>
                  <td>Credible non-official evidence or multiple partial signals.</td>
                </tr>
                <tr>
                  <td>Confirmed TGE</td>
                  <td>Official, exchange, sale, airdrop, migration, or listing evidence with stronger confidence.</td>
                </tr>
                <tr>
                  <td>Trading / Listed / Graduated</td>
                  <td>Market evidence appears on a DEX, aggregator, or local CoinGecko-backed token record.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={noteStyle}>
            Limitation: pre-launch records are inherently speculative. A funding
            round, testnet, or product launch is not treated as proof of a token
            unless the source explicitly connects it to token launch evidence.
          </p>
          <p>
            See the live{" "}
            <Link href="/upcoming">Upcoming Crypto Launches &amp; TGE Tracker</Link>{" "}
            for current source evidence and lifecycle labels.
          </p>

          <h2>AI & Editorial Process</h2>
          <p>
            TokenRadar uses AI to structure research drafts, summarize market
            context, compare peer positioning, and prepare social updates. The
            AI is given structured market data, computed metrics, source facts,
            and content rules. It is not asked to invent tokenomics, investors,
            contracts, unlock schedules, or official links.
          </p>
          <ul>
            <li>
              <strong>Automated quality gates:</strong> generated articles are
              checked for minimum length, FAQ presence, financial disclaimers,
              numeric data points, and prohibited advice phrases.
            </li>
            <li>
              <strong>Indexing gate:</strong> token articles need sufficient
              liquidity, enough substantive content, required disclaimers, and no
              prohibited financial-advice phrasing before they are indexable.
            </li>
            <li>
              <strong>Known limitation:</strong> automated checks can catch
              obvious omissions, but they do not prove every sentence is complete
              or correct. Readers should verify important claims.
            </li>
          </ul>

          <h2>Original Research & Reproducibility</h2>
          <p>
            The <Link href="/research">TokenRadar Market Risk Index</Link> is a
            deterministic research product. It aggregates local token and metric
            records with documented arithmetic and does not call Gemini, Claude,
            or another text-generation model.
          </p>
          <ul>
            <li>
              <strong>Equal-weighted index:</strong> the mean 1–10 Risk Score is
              multiplied by 10 to produce a 0–100 market snapshot.
            </li>
            <li>
              <strong>Published evidence:</strong> category aggregates are
              available as JSON and CSV with sample sizes and timestamps.
            </li>
            <li>
              <strong>Known limitations:</strong> categories can overlap, market
              data changes continuously, and the score does not cover every
              contract, governance, legal, or counterparty risk.
            </li>
          </ul>

          <h2>Corrections & Data Issues</h2>
          <p>
            Crypto data changes quickly and third-party APIs can contain stale or
            incomplete fields. If you notice an incorrect price, supply figure,
            broken source, misleading TGE label, or article issue, send the token
            name and the specific correction through our{" "}
            <Link href="/contact">contact page</Link>.
          </p>

          <h2>Commercial Relationships</h2>
          <p>
            Some TokenRadar pages contain paid links to exchanges, hardware
            wallet manufacturers, tax software, charting tools, and similar
            third-party services. TokenRadar may earn a commission if a user
            signs up, subscribes, or buys through those links at no additional
            cost to the user.
          </p>
          <p>
            Affiliate relationships do not alter Risk Score, Growth Potential,
            Narrative Strength, Volatility Index, Value vs ATH, TGE confidence,
            or whether a token is included in coverage. See the full{" "}
            <Link href="/disclaimer">financial and affiliate disclosure</Link>.
          </p>

          <h2>Methodology Changelog</h2>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Date</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{METHODOLOGY_VERSION}</td>
                  <td>{reviewedLabel}</td>
                  <td>
                    Added reproducible Market Risk Index evidence, machine-readable
                    category aggregates, zero-AI SEO maintenance, and stronger
                    research topic connections.
                  </td>
                </tr>
                <tr>
                  <td>v1.4</td>
                  <td>August 9, 2026</td>
                  <td>
                    Updated coverage snapshot, clarified score limitations, added
                    AI/editorial process detail, corrected TGE sources, and added
                    commercial relationship disclosure.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>Contact</h2>
          <p>
            For questions, corrections, or partnership inquiries, use the{" "}
            <Link href="/contact">contact page</Link> or email{" "}
            <a href="mailto:contact@tokenradar.co">contact@tokenradar.co</a>.
          </p>
        </div>
      </section>
      <TopicClusterLinks current="risk" />
    </div>
  );
}
