import { RiskMeterGauge } from "./RiskMeterGauge";
import { Activity } from "lucide-react";

interface RiskScoreCardProps {
  /** Risk score from 1 (low risk) to 10 (high risk) */
  score: number;
  /** Optional label override */
  label?: string;
}

/**
 * Visual risk meter with 10-bar indicator.
 * Colors: green (1-3), yellow (4-6), red (7-10).
 * Core proprietary metric displayed on every token page.
 */
export function RiskScoreCard({ score, label = "Risk Score" }: RiskScoreCardProps) {
  const clampedScore = Math.max(1, Math.min(10, Math.round(score)));
  const riskLevel = clampedScore <= 3 ? "low" : clampedScore <= 6 ? "medium" : "high";
  const riskLabel = clampedScore <= 3 ? "Low Risk" : clampedScore <= 6 ? "Medium Risk" : "High Risk";

  return (
    <div className="stat-card-premium" id="risk-score-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <Activity className="stat-watermark" />
      <div className="stat-label" style={{ alignSelf: "flex-start", width: "100%", marginBottom: "var(--space-md)" }}>{label}</div>
      <RiskMeterGauge score={clampedScore} />
      <div className="stat-change" style={{ marginTop: "var(--space-sm)", fontWeight: 700, color: `var(--${riskLevel === "low" ? "green" : riskLevel === "medium" ? "yellow" : "red"})` }}>
        {riskLabel}
      </div>
    </div>
  );
}
