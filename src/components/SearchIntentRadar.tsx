import {
  AlertTriangle,
  ArrowRight,
  Database,
  LineChart,
  Radar,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { HypeClassification, TokenSearchIntentSnapshot, TokenSearchIntentTrend } from "@/lib/search-intent";

interface SearchIntentRadarProps {
  intent: TokenSearchIntentSnapshot | null;
  variant?: "full" | "compact";
  trend?: TokenSearchIntentTrend | null;
  links?: {
    hasPricePrediction?: boolean;
    hasHowToBuy?: boolean;
    hasLedgerGuide?: boolean;
    categoryHref?: string;
    categoryName?: string;
  };
}

type SearchIntentActionLink = {
  href: string;
  label: string;
  icon: ReactNode;
};

function classificationTone(classification: HypeClassification): "green" | "yellow" | "red" | "blue" {
  if (classification === "FOMO Spike" || classification === "Supply-Risk Spike" || classification === "Low-Quality Attention") {
    return "red";
  }
  if (classification === "Narrative Rotation" || classification === "Stablecoin Safety Check") return "yellow";
  if (classification === "Quiet Watch") return "blue";
  return "green";
}

function scoreTone(score: number): "green" | "yellow" | "red" | "blue" {
  if (score >= 75) return "red";
  if (score >= 55) return "yellow";
  if (score >= 35) return "blue";
  return "green";
}

function getClassificationIcon(classification: HypeClassification) {
  if (classification === "FOMO Spike" || classification === "Low-Quality Attention") return <AlertTriangle size={18} />;
  if (classification === "Supply-Risk Spike") return <ShieldAlert size={18} />;
  if (classification === "Narrative Rotation") return <Sparkles size={18} />;
  if (classification === "Stablecoin Safety Check") return <Database size={18} />;
  return <SearchCheck size={18} />;
}

function formatDelta(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function DeltaBadge({ value, label }: { value: number | undefined; label: string }) {
  if (typeof value !== "number") return null;
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";

  return (
    <em className={`search-intent-delta search-intent-delta-${tone}`}>
      {formatDelta(value)} {label}
    </em>
  );
}

export function SearchIntentRadar({ intent, variant = "full", trend, links }: SearchIntentRadarProps) {
  if (!intent) return null;

  const tone = classificationTone(intent.classification);
  const compact = variant === "compact";
  const maybeActionLinks: Array<SearchIntentActionLink | null> = [
    links?.hasPricePrediction
      ? { href: `/${intent.tokenId}/price-prediction`, label: "Forecast scenarios", icon: <LineChart size={14} /> }
      : null,
    links?.hasHowToBuy
      ? { href: `/${intent.tokenId}/how-to-buy`, label: "Buying access", icon: <SearchCheck size={14} /> }
      : null,
    links?.hasLedgerGuide
      ? { href: `/${intent.tokenId}/transfer-to-ledger`, label: "Custody workflow", icon: <WalletCards size={14} /> }
      : null,
    links?.categoryHref && links.categoryName
      ? { href: links.categoryHref, label: `${links.categoryName} peers`, icon: <Radar size={14} /> }
      : null,
    { href: "/search-intent", label: "Market intent dashboard", icon: <ArrowRight size={14} /> },
  ];
  const actionLinks = maybeActionLinks.filter((link): link is SearchIntentActionLink => Boolean(link));

  return (
    <section className={`card search-intent-card search-intent-card-${tone}`} id="search-intent-radar">
      <div className="search-intent-header">
        <div className="search-intent-title-block">
          <p className="eyebrow-text">Search Intent Radar</p>
          <h2>
            Why traders may be searching <span className="gradient-text">{intent.symbol.toUpperCase()}</span>
          </h2>
          {!compact && (
            <p>
              Free-data readout from TokenRadar keyword templates, cached market data, supply context, and risk metrics.
            </p>
          )}
        </div>
        <div className={`search-intent-verdict badge badge-${tone}`}>
          {getClassificationIcon(intent.classification)}
          {intent.classification}
        </div>
      </div>

      <div className="search-intent-score-grid">
        <div className={`search-intent-score-tile search-intent-score-${scoreTone(intent.attentionScore)}`}>
          <Radar size={18} />
          <span>Attention</span>
          <strong>{intent.attentionScore}/100</strong>
          <small>{intent.attentionLabel}</small>
          <DeltaBadge value={trend?.attentionDelta} label="vs previous" />
        </div>
        <div className={`search-intent-score-tile search-intent-score-${scoreTone(intent.hypeScore)}`}>
          <LineChart size={18} />
          <span>Hype Pressure</span>
          <strong>{intent.hypeScore}/100</strong>
          <small>vs fundamentals</small>
          <DeltaBadge value={trend?.hypeDelta} label="vs previous" />
        </div>
        <div className={`search-intent-score-tile search-intent-score-${scoreTone(intent.supplyRiskScore)}`}>
          <ShieldAlert size={18} />
          <span>Supply Risk</span>
          <strong>{intent.supplyRiskScore}/100</strong>
          <small>FDV and float gap</small>
          <DeltaBadge value={trend?.supplyRiskDelta} label="vs previous" />
        </div>
      </div>

      <div className="search-intent-layout">
        <div className="search-intent-panel">
          <h3>Top Search Intents</h3>
          <div className="search-intent-bars">
            {intent.intentMix.map((item) => (
              <div className="search-intent-bar-row" key={item.intent}>
                <div className="search-intent-bar-top">
                  <span>{item.label}</span>
                  <strong>{item.score}/100</strong>
                </div>
                <div className="search-intent-bar-track" aria-hidden="true">
                  <span style={{ width: `${item.score}%` }} />
                </div>
                {!compact && item.queries[0] && <small>{item.queries[0]}</small>}
              </div>
            ))}
          </div>
        </div>

        <div className="search-intent-panel">
          <h3>Drivers</h3>
          <ul className="search-intent-list">
            {intent.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
        </div>

        {!compact && (
          <div className="search-intent-panel">
            <h3>Cautions</h3>
            <ul className="search-intent-list search-intent-caution-list">
              {intent.cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!compact && (
        <div className="search-intent-query-strip" aria-label="Search query examples">
          {intent.queryExamples.slice(0, 4).map((query) => (
            <span key={query}>{query}</span>
          ))}
        </div>
      )}

      {actionLinks.length > 0 && (
        <div className="search-intent-action-strip" aria-label="Related TokenRadar research links">
          {actionLinks.map((link) => (
            <Link href={link.href} key={`${link.href}-${link.label}`}>
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
