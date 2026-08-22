import type { Metadata } from "next";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

const lastUpdated = "May 11, 2026";
const PAGE_DESCRIPTION =
  "TokenRadar disclaimer: All content is for informational purposes only and does not constitute financial advice. Includes affiliate disclosure.";

export const metadata: Metadata = {
  title: "Financial Disclaimer",
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/disclaimer",
  },
  openGraph: buildOpenGraphMetadata({ title: "Financial Disclaimer", description: PAGE_DESCRIPTION, url: "/disclaimer" }),
  twitter: buildTwitterMetadata({ title: "Financial Disclaimer", description: PAGE_DESCRIPTION }),
};

export default function DisclaimerPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Financial Disclaimer</h1>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: {lastUpdated}
          </p>

          <h2>Not Financial Advice</h2>
          <p>
            The information provided on TokenRadar (tokenradar.co) is for
            <strong> general informational and educational purposes only</strong>.
            Nothing on this website constitutes financial advice, investment
            advice, trading advice, tax advice, legal advice, accounting advice,
            or any other professional advice. You should not treat any content,
            score, scenario, guide, post, link, or alert as advice tailored to
            your financial situation.
          </p>

          <h2>No Professional or Fiduciary Relationship</h2>
          <p>
            TokenRadar is not a registered investment adviser, broker-dealer,
            securities exchange, commodity trading adviser, futures commission
            merchant, tax adviser, law firm, custodian, or financial
            institution. Using the site does not create an adviser-client,
            broker-client, fiduciary, attorney-client, tax-preparer, or similar
            professional relationship.
          </p>

          <h2>No Offers or Recommendations</h2>
          <p>
            TokenRadar does not recommend that any cryptocurrency, token,
            security, commodity, product, exchange, wallet, software service, or
            strategy should be bought, sold, held, staked, lent, borrowed,
            shorted, or used by you. Nothing on TokenRadar is an offer,
            solicitation, endorsement, underwriting, or invitation to enter into
            any transaction.
          </p>

          <h2>Crypto Risk Acknowledgment</h2>
          <p>
            Crypto assets are speculative, volatile, and may lose all value.
            Risks include market volatility, limited liquidity, exchange failure,
            insolvency, hacks, phishing, smart-contract bugs, bridge failures,
            oracle failures, custody mistakes, wallet compromise, stablecoin
            depegging, governance attacks, regulatory changes, tax consequences,
            forks, delistings, token unlocks, insider concentration, and market
            manipulation. Past performance is not indicative of future results.
          </p>
          <p>
            Leveraged products, derivatives, margin trading, perpetuals,
            options, lending, borrowing, yield farming, staking, restaking, and
            pre-launch allocations can amplify losses and may not be suitable
            for most users. Only risk capital you can afford to lose.
          </p>

          <h2>Affiliate Disclosure</h2>
          <p>
            Some pages on TokenRadar, particularly &quot;How to Buy&quot;
            guides, contain <strong>paid links or affiliate links</strong> to cryptocurrency
            exchanges, including but not limited to Binance, Bybit, OKX, and
            KuCoin. If you sign up or make a purchase through these links,
            TokenRadar may receive a commission at no additional cost to you.
          </p>
          <p>
            Other pages may contain paid links to hardware wallet manufacturers,
            crypto tax software, charting tools, and similar third-party
            services. If you sign up, subscribe, or buy through those links,
            TokenRadar may receive compensation at no additional cost to you.
          </p>
          <p>
            These affiliate relationships do not influence our analysis,
            metrics, or editorial content. Our proprietary metrics (Risk Score,
            Recovery Room Index, etc.) are computed algorithmically from
            market data and are never altered based on affiliate partnerships.
          </p>
          <p>
            Availability, eligibility, fees, promotions, and regulatory access
            vary by country and can change without notice. Exchange links are
            not recommendations to trade, and some partners may restrict users
            in the United States or other jurisdictions. Always verify that a
            service is available and lawful in your location before depositing
            funds, buying hardware, or subscribing.
          </p>

          <h2>Sponsored and Paid Content</h2>
          <p>
            If TokenRadar publishes sponsored content, paid placements, or
            advertiser-supported material, we aim to label it clearly. Paid
            placement does not guarantee that a product is safe, suitable,
            lawful, available, or profitable.
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
          <p>
            Token sale, airdrop, whitelist, points, allocation, and listing
            information may change or be withdrawn without notice. You may never
            receive tokens, tokens may have little or no utility, and secondary
            markets may not develop.
          </p>

          <h2>Third-Party Data</h2>
          <p>
            Market data displayed on TokenRadar is sourced from third-party
            providers, primarily CoinGecko. Pre-launch project information is
            sourced from RSS feeds including CoinTelegraph, Airdrop Alert, and
            other aggregators. While we strive to ensure accuracy, we cannot
            guarantee that all data is error-free at all times.
          </p>
          <p>
            TokenRadar is not endorsed by CoinGecko or other data providers
            unless explicitly stated. Third-party data providers, exchanges, and
            project teams are not responsible for your use of TokenRadar.
          </p>

          <h2>AI-Generated Content</h2>
          <p>
            Content on this site, including articles, social media posts on our
            X and Telegram channels, and market update summaries, is generated
            with the assistance of artificial intelligence. While all
            AI-generated content undergoes automated quality checks and includes
            verified data points, it may contain errors or omissions.
            AI-generated content should not be relied upon as the sole basis for
            any financial decision.
          </p>

          <h2>Tax and Legal Matters</h2>
          <p>
            Crypto tax rules and legal restrictions vary by jurisdiction and can
            change. TokenRadar tax guides and regulatory comments are general
            education only. Consult qualified professionals for advice about
            your specific situation.
          </p>

          <h2>Your Responsibility</h2>
          <p>
            You are responsible for independently verifying information,
            evaluating risk, checking jurisdictional eligibility, securing your
            devices and wallets, understanding fees and taxes, and deciding
            whether any action is appropriate for you.
          </p>
        </div>
      </section>
    </div>
  );
}
