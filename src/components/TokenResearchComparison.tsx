import Link from "next/link";
import type { PilotComparison } from "@/lib/token-research-pilot";

const percent = (value: number) => `${value.toFixed(2)}%`;
const factors = [
  ["volatility", "Price-window volatility"],
  ["marketCap", "Market capitalization"],
  ["turnover", "Volume / market cap"],
  ["drawdown", "Distance from all-time high"],
] as const;

export function TokenResearchComparison({ comparison }: { comparison: PilotComparison }) {
  const { asset, cohort, sampleSize, medianDrawdown, medianRisk, medianTurnover, meanFactors } = comparison;
  const largestDifference = factors.toSorted(([a], [b]) =>
    Math.abs(asset.factors[b] - meanFactors[b]) - Math.abs(asset.factors[a] - meanFactors[a]))[0];
  const [key, label] = largestDifference;
  return (
    <section className="card research-pilot" id="peer-comparison" aria-labelledby="peer-comparison-title">
      <h2 id="peer-comparison-title">What stands out about {asset.name}?</h2>
      <p>
        In the <time dateTime={asset.marketDataAt}>{asset.marketDay}</time> market snapshot, {asset.name} scores {asset.riskScore}/10
        against a median {medianRisk.toFixed(1)}/10 for {sampleSize} {cohort}. Higher scores mean higher observed market risk.
      </p>
      <div className="research-pilot-table">
        <table>
          <caption>Equal-weighted peer comparison, excluding {asset.name}</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">{asset.name}</th><th scope="col">Peer median</th></tr></thead>
          <tbody>
            <tr><th scope="row">Risk score (1–10)</th><td>{asset.riskScore}</td><td>{medianRisk.toFixed(1)}</td></tr>
            <tr><th scope="row">Below all-time high</th><td>{percent(asset.drawdown)}</td><td>{percent(medianDrawdown)}</td></tr>
            <tr><th scope="row">24h volume / market cap</th><td>{percent(asset.turnover)}</td><td>{percent(medianTurnover)}</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        {label} makes the largest contribution difference: {asset.factors[key].toFixed(2)} risk points
        versus {meanFactors[key].toFixed(2)} for the peer mean. This input adds {asset.factors[key] < meanFactors[key] ? "fewer" : asset.factors[key] > meanFactors[key] ? "more" : "the same number of"} points.
        The table below explains the four inputs; each contributes up to 2.5 points before the total is rounded and clamped to 1–10.
      </p>
      <div className="research-pilot-table">
        <table>
          <caption>Risk-score contributions, in points</caption>
          <thead><tr><th scope="col">Input</th><th scope="col">{asset.name}</th><th scope="col">Peer mean</th></tr></thead>
          <tbody>{factors.map(([factor, name]) => (
            <tr key={factor}><th scope="row">{name}</th><td>{asset.factors[factor].toFixed(2)}</td><td>{meanFactors[factor].toFixed(2)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p>
        Volume / market cap measures reported trading activity, not order-book depth or executable liquidity.
        Peers must have market inputs from the same UTC date and a risk score reproducible from their cached inputs.
        This is a sample of TokenRadar coverage, not the whole crypto market; peer price windows can differ.
      </p>
      <p>
        {asset.name}&apos;s cached volatility window runs from <time dateTime={asset.priceWindowStart}>{asset.priceWindowStart.slice(0, 10)}</time> to{" "}
        <time dateTime={asset.priceWindowEnd}>{asset.priceWindowEnd.slice(0, 10)}</time>.
        {asset.priceWindowEnd.slice(0, 10) < asset.marketDay
          ? "It is older than the market snapshot and does not measure volatility since that date."
          : "This is a historical price window, not a forecast of future volatility."}
        Validator, custody, security and token-unlock risks are outside this score.
      </p>
      <p>
        Verify the inputs in the <a href="/data/tokenradar-editorial-pilots.json" download>comparison data and peer inventory (JSON)</a>,
        check <a href={`https://www.coingecko.com/en/coins/${asset.id}`}>CoinGecko&apos;s {asset.name} market record</a>,
        and read the <Link href="/about#methodology">risk methodology</Link> and <Link href="/research#risk-distribution">market risk distribution</Link>.
      </p>
    </section>
  );
}
