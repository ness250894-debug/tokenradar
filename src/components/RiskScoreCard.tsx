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
    <div className="stat-card" id="risk-score-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {clampedScore}
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginLeft: "4px" }}>
          /10
        </span>
      </div>
      <div
        className="risk-meter"
        role="meter"
        aria-valuenow={clampedScore}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-label={`${label}: ${clampedScore} out of 10 — ${riskLabel}`}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`risk-meter-bar ${i < clampedScore ? `active ${riskLevel}` : ""}`}
          />
        ))}
      </div>
      <div className="stat-change" style={{ color: `var(--${riskLevel === "low" ? "green" : riskLevel === "medium" ? "yellow" : "red"})` }}>
        {riskLabel}
      </div>
    </div>
  );
}
