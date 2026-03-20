import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financial Disclaimer",
  description:
    "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice.",
  alternates: {
    canonical: "/disclaimer",
  },
  openGraph: {
    title: "Financial Disclaimer | TokenRadar",
    description:
      "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice.",
  },
  twitter: {
    title: "Financial Disclaimer | TokenRadar",
    description:
      "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice.",
  },
};

/**
 * Financial disclaimer page — legally required for any crypto content site.
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

          <h2>Third-Party Data</h2>
          <p>
            Market data displayed on TokenRadar is sourced from third-party
            providers, primarily CoinGecko. While we strive to ensure accuracy,
            we cannot guarantee that all data is error-free at all times.
          </p>

          <h2>AI-Generated Content</h2>
          <p>
            Some content on this site is generated with the assistance of
            artificial intelligence. While all AI-generated content is reviewed
            for accuracy and includes verified data points, it may contain
            errors or omissions. AI-generated content should not be relied upon
            as the sole basis for any financial decision.
          </p>

          <p style={{ marginTop: "var(--space-xl)", color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: March 2026
          </p>
        </div>
      </section>
    </div>
  );
}
