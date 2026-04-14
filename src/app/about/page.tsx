import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About TokenRadar — Methodology & Data Sources",
  description:
    "Learn how TokenRadar calculates Risk Scores, Growth Indexes, Volatility, and analyzes 200+ crypto tokens using real CoinGecko data, AI-powered research, and pre-launch TGE discovery.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About TokenRadar — Methodology & Data Sources",
    description:
      "Learn how TokenRadar calculates Risk Scores, Growth Indexes, Volatility, and analyzes 200+ crypto tokens using real CoinGecko data, AI-powered research, and pre-launch TGE discovery.",
  },
  twitter: {
    title: "About TokenRadar — Methodology & Data Sources",
    description:
      "Learn how TokenRadar calculates Risk Scores, Growth Indexes, Volatility, and analyzes 200+ crypto tokens using real CoinGecko data, AI-powered research, and pre-launch TGE discovery.",
  },
};

/**
 * About page — E-E-A-T signals page explaining methodology,
 * data sources, and the team behind TokenRadar.
 */
export default function AboutPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>
            About <span className="gradient-text">TokenRadar</span>
          </h1>
          <p style={{ fontSize: "var(--text-lg)", marginTop: "var(--space-lg)" }}>
            TokenRadar is an independent crypto research platform that provides
            unbiased, data-driven analysis for cryptocurrency tokens ranked
            #50–#250 by market capitalization — a range underserved by major
            publications yet actively searched by investors.
          </p>

          <h2 id="methodology">Our Methodology</h2>
          <p>
            Every piece of analysis on TokenRadar is built on verified data —
            never opinions. Market data is refreshed <strong>daily</strong> via
            automated pipelines, and all proprietary metrics are recomputed on
            every refresh cycle. Here&apos;s how our core metrics work:
          </p>

          <h3>Risk Score (1–10)</h3>
          <p>
            Computed from four equally weighted factors, each contributing up to
            2.5 points:
          </p>
          <ul>
            <li>
              <strong>Price volatility</strong> — 30-day coefficient of
              variation (standard deviation ÷ mean price). Higher CV = higher
              risk contribution.
            </li>
            <li>
              <strong>Market capitalization</strong> — tokens above $10B score
              0; tokens below $500M score the maximum 2.5.
            </li>
            <li>
              <strong>Liquidity ratio</strong> — 24-hour trading volume relative
              to market cap. A ratio above 10% is considered highly liquid (low
              risk); below 1% is illiquid (high risk).
            </li>
            <li>
              <strong>ATH drawdown</strong> — how far the current price is from
              the all-time high. Deeper drawdowns contribute more risk.
            </li>
          </ul>
          <p>
            The raw sum is clamped to a <strong>1–10 scale</strong> where 1
            means very low risk and 10 means extremely high risk.
          </p>

          <h3>Growth Potential Index (0–100)</h3>
          <p>
            Measures how much room a token has to grow relative to its peers,
            based on three factors:
          </p>
          <ul>
            <li>
              <strong>Distance from ATH</strong> (up to 40 points) — tokens
              trading far below their all-time high have more recovery
              potential.
            </li>
            <li>
              <strong>Market cap vs category median</strong> (up to 40 points) —
              tokens with a market cap below their category&apos;s median
              (DeFi, Layer 2, AI, etc.) have more relative upside.
            </li>
            <li>
              <strong>30-day momentum</strong> (up to 20 points) — positive
              recent price action suggests building momentum.
            </li>
          </ul>

          <h3>Narrative Strength (0–100)</h3>
          <p>
            Scores the momentum of a token&apos;s category narrative using a
            curated category-level scoring system. Each token inherits the
            score of its strongest category. Current top-scoring categories
            include <strong>AI &amp; Machine Learning</strong> (95),{" "}
            <strong>Layer 2</strong> (85),{" "}
            <strong>Real-World Assets</strong> (80), and{" "}
            <strong>DePIN</strong> (78). Category scores are reviewed
            regularly to reflect shifting market narratives.
          </p>

          <h3>Volatility Index (0–100)</h3>
          <p>
            A normalized measure of 30-day price volatility. Computed as the
            coefficient of variation (CV) of daily closing prices, scaled to a
            0–100 range. Tokens with a Volatility Index above 70 are
            experiencing extreme price swings, while those below 20 are
            relatively stable.
          </p>

          <h3>Value vs ATH</h3>
          <p>
            Shows the current price as a percentage of the all-time high,
            giving investors a quick view of how far a token is from its peak.
            A value of 100 means the token is at its ATH; a value of 10 means
            it&apos;s 90% below its peak.
          </p>

          <h2>Pre-Launch TGE Discovery</h2>
          <p>
            TokenRadar automatically monitors RSS feeds from sources like{" "}
            <strong>CoinTelegraph</strong>, <strong>Airdrop Alert</strong>,{" "}
            <strong>ICO Watch List</strong>, and{" "}
            <strong>Foundico</strong> to discover upcoming Token Generation
            Events (TGEs). Discovered projects are analyzed by AI for
            narrative strength, VC backing, and anti-rug indicators before
            being listed on our{" "}
            <Link href="/upcoming" style={{ color: "var(--accent-secondary)" }}>
              Pre-Launch Spotlight
            </Link>{" "}
            page.
          </p>
          <p>
            When a pre-launch token graduates to trading on CoinGecko, it is
            automatically transitioned into our main token coverage with full
            metrics and article generation.
          </p>

          <h2>Token Comparisons</h2>
          <p>
            Our comparison engine provides programmatic, side-by-side analysis
            for over <strong>62,250 unique token pairings</strong>. Every
            comparison analyzes:
          </p>
          <ul>
            <li>
              <strong>Risk Relativity</strong> — compares proprietary risk
              scores (e.g., Low vs High) to highlight the safer asset.
            </li>
            <li>
              <strong>Market Dominance</strong> — calculates the relative
              market cap size (e.g., &quot;Token A is 10x larger than Token B&quot;).
            </li>
            <li>
              <strong>Performance Delta</strong> — tracks 30-day and 24h price
              divergence using normalized historical data.
            </li>
          </ul>

          <h2>The Action Layer: Essential Toolkit</h2>
          <p>
            Research without action is incomplete. We curate high-intent
            resources specifically vetted for their role in a professional
            crypto workflow:
          </p>
          <ul>
            <li>
              <strong>Hardware Security</strong> — comparisons of industry
              leaders like Ledger and Trezor based on 2026 security audits.
            </li>
            <li>
              <strong>Compliance Automation</strong> — guides and integrations
              for tax automation tools (e.g., Koinly) to manage 2026 reporting
              requirements.
            </li>
            <li>
              <strong>Alpha Connectivity</strong> — direct access to our inner
              circle for TGE alerts and narrative deep-dives.
            </li>
          </ul>

          <h2>Data Sources & Alpha Ticker</h2>
          <p>
            All market data is sourced from the <strong>CoinGecko API</strong> 
            and refreshed every <strong>24 hours</strong>. Our 
            <strong>Alpha Ticker</strong> also tracks real-time narrative 
            momentum across 20+ crypto categories to identify emerging trends 
            before they hit mainstream media.
          </p>
          <p>
            Reference analysis angles are drawn from reputable outlets via
            RSS feeds — we never copy content, only use factual data points as
            style and context reference for AI content generation.
          </p>

          <h2>AI Content Generation</h2>
          <p>
            Articles are generated by AI using structured prompts that include
            verified CoinGecko data, computed proprietary metrics, price
            history summaries, and reference facts. Every article goes through{" "}
            <strong>automated quality checks</strong> to ensure factual
            accuracy, minimum data point citations, proper disclaimers, FAQ
            sections, and no prohibited financial advice.
          </p>
          <p>
            Our social channels (
            <a
              href="https://x.com/tokenradarco"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-secondary)" }}
            >
              X
            </a>{" "}
            and{" "}
            <a
              href="https://t.me/TokenRadarCo"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-secondary)" }}
            >
              Telegram
            </a>
            ) also publish AI-generated market updates, trending alerts, and
            interactive polls — all produced by automated pipelines running
            multiple times per day.
          </p>

          <h2>Contact</h2>
          <p>
            Have questions, feedback, or partnership inquiries? Reach out via
            our{" "}
            <Link
              href="/contact"
              style={{ color: "var(--accent-secondary)" }}
            >
              contact page
            </Link>{" "}
            or email us directly at{" "}
            <a
              href="mailto:contact@tokenradar.co"
              style={{ color: "var(--accent-secondary)" }}
            >
              contact@tokenradar.co
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
