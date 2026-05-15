import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { SentimentPoll } from "@/components/SentimentPoll";
import { TokenIcon } from "@/components/TokenIcon";
import { type TokenCardData } from "@/components/TokenCard";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCompact, formatPercent, formatPrice } from "@/lib/formatters";
import { getTgeEvidenceCount, getTgeStatusLabel, type UpcomingTge } from "@/lib/tge";

interface HomeRadarBriefProps {
  tokens: TokenCardData[];
  scoredTokens: TokenCardData[];
  upcomingTges: UpcomingTge[];
  marketMood: string;
  marketChange24h: number;
}

interface RadarCalloutProps {
  label: string;
  note: string;
  token: TokenCardData;
  icon: LucideIcon;
  tone: "green" | "yellow" | "red" | "blue";
}

function getMomentumLeader(tokens: TokenCardData[]): TokenCardData | undefined {
  return [...tokens]
    .filter((token) => Number.isFinite(token.priceChange24h))
    .sort((a, b) => b.priceChange24h - a.priceChange24h)[0];
}

function getLowestRiskToken(scoredTokens: TokenCardData[], fallbackTokens: TokenCardData[]): TokenCardData | undefined {
  const candidates = scoredTokens.length ? scoredTokens : fallbackTokens;
  return [...candidates].sort((a, b) => a.riskScore - b.riskScore || b.marketCap - a.marketCap)[0];
}

function getHighRiskMover(scoredTokens: TokenCardData[], fallbackTokens: TokenCardData[]): TokenCardData | undefined {
  const candidates = scoredTokens.length ? scoredTokens : fallbackTokens;
  const highRiskTokens = candidates.filter((token) => token.riskScore >= 7);
  return [...(highRiskTokens.length ? highRiskTokens : candidates)].sort(
    (a, b) => b.riskScore - a.riskScore || b.priceChange24h - a.priceChange24h,
  )[0];
}

function getUniqueTokens(tokens: Array<TokenCardData | undefined>): TokenCardData[] {
  const seen = new Set<string>();
  return tokens.filter((token): token is TokenCardData => {
    if (!token || seen.has(token.id)) return false;
    seen.add(token.id);
    return true;
  });
}

function formatLaunchWindow(tge: UpcomingTge): string {
  if (tge.graduatedAt) {
    const date = new Date(tge.graduatedAt);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  }

  return tge.expectedTge || "Window pending";
}

function getRiskTone(score: number): "green" | "yellow" | "red" {
  if (score <= 3) return "green";
  if (score <= 6) return "yellow";
  return "red";
}

function RadarCallout({ label, note, token, icon: Icon, tone }: RadarCalloutProps) {
  const changeIcon = token.priceChange24h >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />;

  return (
    <Link href={`/${token.id}`} className={`home-radar-callout home-radar-callout-${tone}`}>
      <div className="home-radar-callout-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div className="home-radar-callout-body">
        <span className="home-radar-label">{label}</span>
        <div className="home-radar-token-line">
          <TokenIcon
            symbol={token.symbol}
            name={token.name}
            id={token.id}
            imageUrl={token.imageUrl}
            size={28}
          />
          <strong>{token.name}</strong>
          <span>{token.symbol.toUpperCase()}</span>
        </div>
        <p>{note}</p>
        <div className="home-radar-metrics">
          <span className={token.priceChange24h >= 0 ? "price-up" : "price-down"}>
            {changeIcon}
            {formatPercent(token.priceChange24h || 0)}
          </span>
          <span className={`badge badge-${getRiskTone(token.riskScore)}`}>Risk {token.riskScore}/10</span>
          <span>{formatPrice(token.price)}</span>
        </div>
      </div>
    </Link>
  );
}

export function HomeRadarBrief({
  tokens,
  scoredTokens,
  upcomingTges,
  marketMood,
  marketChange24h,
}: HomeRadarBriefProps) {
  if (!tokens.length) return null;

  const momentumLeader = getMomentumLeader(tokens);
  const lowestRiskToken = getLowestRiskToken(scoredTokens, tokens);
  const highRiskMover = getHighRiskMover(scoredTokens, tokens);
  const launchSignal = upcomingTges[0];
  const watchlistTokens = getUniqueTokens([momentumLeader, lowestRiskToken, highRiskMover, ...tokens.slice(0, 4)]).slice(0, 4);

  return (
    <section className="section home-radar-section" id="daily-radar">
      <div className="container">
        <div className="home-radar-heading">
          <div>
            <p className="eyebrow-text">Daily Radar</p>
            <h2>
              Today&apos;s <span className="gradient-text">Market Brief</span>
            </h2>
            <p>
              {marketMood} with a {formatPercent(marketChange24h)} average 24h move across the front-page sample.
            </p>
          </div>
          <Link href="/tokens" className="home-preview-link">
            Open full dashboard <ArrowRight size={15} />
          </Link>
        </div>

        <div className="home-radar-layout">
          <div className="home-radar-utility-grid">
            <div className="card home-radar-watchlist-card home-radar-wide-card">
              <div className="home-radar-card-title">
                <Star size={18} />
                <h3>Quick Watchlist</h3>
              </div>
              <div className="home-radar-watchlist home-radar-watchlist-compact">
                {watchlistTokens.map((token) => (
                  <div className="home-radar-watch-tile" key={token.id}>
                    <Link
                      href={`/${token.id}`}
                      className="home-radar-watch-token"
                      aria-label={`Open ${token.name} research profile`}
                      title={token.name}
                    >
                      <TokenIcon
                        symbol={token.symbol}
                        name={token.name}
                        id={token.id}
                        imageUrl={token.imageUrl}
                        size={30}
                      />
                      <span>
                        <strong>{token.symbol.toUpperCase()}</strong>
                      </span>
                    </Link>
                    <span className={`home-radar-watch-change ${token.priceChange24h >= 0 ? "price-up" : "price-down"}`}>
                      {formatPercent(token.priceChange24h || 0)}
                    </span>
                    <WatchlistButton tokenId={token.id} tokenName={token.name} className="home-radar-save" />
                  </div>
                ))}
              </div>
              <Link href="/watchlist" className="home-radar-watchlist-link">
                Saved assets <ArrowRight size={15} />
              </Link>
            </div>

            <SentimentPoll
              tokenId="home-market-pulse"
              title="Market Pulse"
              prompt="Is today's setup risk-on or risk-off?"
              positiveLabel="Risk-on"
              negativeLabel="Risk-off"
              recordedLabel="Vote recorded."
              variant="compact"
              className="home-radar-pulse-card"
            />

            <div className="home-radar-mini-stack">
              <Link href="/upcoming" className="card home-radar-mini-card home-radar-micro-card">
                <div className="home-radar-card-title">
                  <Calendar size={16} />
                  <h3>Launch Queue</h3>
                </div>
                <div className="home-radar-mini-value">{upcomingTges.length}</div>
                {launchSignal && (
                  <span className="home-radar-mini-meta">
                    Next: {launchSignal.symbol.toUpperCase()} / {getTgeEvidenceCount(launchSignal)} signals
                  </span>
                )}
              </Link>

              <Link href="/tokens" className="card home-radar-mini-card home-radar-micro-card">
                <div className="home-radar-card-title">
                  <BarChart3 size={16} />
                  <h3>Market Mood</h3>
                </div>
                <div className="home-radar-mini-value">{formatPercent(marketChange24h)}</div>
                <span className="home-radar-mini-meta">{marketMood}</span>
              </Link>
            </div>
          </div>

          <div className="card home-radar-brief-card">
            <div className="home-radar-card-title">
              <Activity size={18} />
              <h3>Signal Board</h3>
            </div>
            <div className="home-radar-callout-grid">
              {momentumLeader && (
                <RadarCallout
                  label="Momentum Leader"
                  note={`${formatCompact(momentumLeader.marketCap)} market cap in ${momentumLeader.category}.`}
                  token={momentumLeader}
                  icon={Zap}
                  tone="green"
                />
              )}
              {lowestRiskToken && (
                <RadarCallout
                  label="Lowest Screened Risk"
                  note={`Lower relative risk profile among scored assets in today's registry.`}
                  token={lowestRiskToken}
                  icon={ShieldCheck}
                  tone="blue"
                />
              )}
              {highRiskMover && (
                <RadarCallout
                  label="Risk Alert"
                  note={`High-risk profile worth reviewing before following the move.`}
                  token={highRiskMover}
                  icon={ShieldAlert}
                  tone="red"
                />
              )}
            </div>

            {launchSignal && (
              <Link href={`/upcoming/${launchSignal.id}`} className="home-radar-launch-row">
                <span className="home-radar-launch-icon" aria-hidden="true">
                  <Calendar size={18} />
                </span>
                <span className="home-radar-launch-copy">
                  <span className="home-radar-label">Launch Signal</span>
                  <strong>
                    {launchSignal.name} <span>{launchSignal.symbol.toUpperCase()}</span>
                  </strong>
                </span>
                <span className="home-radar-launch-meta">
                  {getTgeStatusLabel(launchSignal)} / {formatLaunchWindow(launchSignal)} / {getTgeEvidenceCount(launchSignal)} signals
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
