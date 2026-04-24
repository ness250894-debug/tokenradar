import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financial Disclaimer",
  description:
    "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice. Includes affiliate disclosure.",
  alternates: {
    canonical: "/disclaimer",
  },
  openGraph: {
    title: "Financial Disclaimer",
    description:
      "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice. Includes affiliate disclosure.",
  },
  twitter: {
    title: "Financial Disclaimer",
    description:
      "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice. Includes affiliate disclosure.",
  },
};

/**
 * Financial disclaimer page — legally required for any crypto content site.
 * Includes affiliate disclosure for exchange referral links.
 */
export default function DisclaimerPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Disclaimer</h1>

          <h2>Not Financial Advice</h2>
          <p>
            The information provided on TokenRadar (tokenradar.co) is for
            <strong> general informational and educational purposes only</strong>.
            Nothing on this website constitutes financial advice, investment
            advice, trading advice, or any other sort of advice, and you should
            not treat any of the website&apos;s content as such.
          </p>

          <h2>Do Your Own Research</h2>
          <p>
            TokenRadar does not recommend that any cryptocurrency should be
            bought, sold, or held by you. Always conduct your own due diligence
            and consult a qualified financial advisor before making any
            investment decisions.
          </p>

          <h2>No Guarantees</h2>
          <p>
            The cryptocurrency market is highly volatile and unpredictable.
            Past performance is not indicative of future results. TokenRadar
            makes no representations or warranties about the accuracy,
            completeness, or timeliness of the information provided.
          </p>

          <h2>Risk Acknowledgment</h2>
          <p>
            Investing in cryptocurrencies involves substantial risk of loss and
            is not suitable for every investor. The valuation of cryptocurrencies
            can fluctuate significantly, and you may lose part or all of your
            investment. You should only invest what you can afford to lose.
          </p>

          <h2>Affiliate Disclosure</h2>
          <p>
            Some pages on TokenRadar — particularly &quot;How to Buy&quot;
            guides — contain <strong>affiliate links</strong> to cryptocurrency
            exchanges, including but not limited to Binance, Bybit, OKX, and
            KuCoin. If you sign up or make a purchase through these links,
            TokenRadar may receive a commission at no additional cost to you.
          </p>
          <p>
            These affiliate relationships do not influence our analysis,
            metrics, or editorial content. Our proprietary metrics (Risk Score,
            Growth Potential Index, etc.) are computed algorithmically from
            market data and are never altered based on affiliate partnerships.
          </p>

          <h2>Pre-Launch &amp; TGE Content</h2>
          <p>
            TokenRadar features analysis of upcoming Token Generation Events
            (TGEs) and pre-launch projects. This content is inherently{" "}
            <strong>more speculative</strong> than our coverage of established,
            traded tokens, as pre-launch projects have no live market data,
            limited track record, and higher uncertainty. Pre-launch content
            should be treated with additional caution.
          </p>

          <h2>Third-Party Data</h2>
          <p>
            Market data displayed on TokenRadar is sourced from third-party
            providers, primarily CoinGecko. Pre-launch project information is
            sourced from RSS feeds including CoinTelegraph, Airdrop Alert, and
            other aggregators. While we strive to ensure accuracy, we cannot
            guarantee that all data is error-free at all times.
          </p>

          <h2>AI-Generated Content</h2>
          <p>
            Content on this site — including articles, social media posts on
            our X and Telegram channels, and market update summaries — is
            generated with the assistance of artificial intelligence. While all
            AI-generated content undergoes automated quality checks and includes
            verified data points, it may contain errors or omissions.
            AI-generated content should not be relied upon as the sole basis
            for any financial decision.
          </p>

          <p style={{ marginTop: "var(--space-xl)", color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
      </section>
    </div>
  );
}
