export const COLORS = {
  background: "#0A0A0B",
  surface: "#1A1A1E",
  surfaceHighlight: "#24242A",
  text: "#FFFFFF",
  textMuted: "#888891",
  accent: "#4F46E5", // Indigo
  positive: "#10B981", // Green
  negative: "#EF4444", // Red
  warning: "#F59E0B", // Amber
};

export const SAFE_ZONES = {
  top: 260, // Keep critical text below top platform chrome.
  bottom: 520, // Keep critical text above platform captions and playback controls.
  horizontal: 80, // Prevent text from hitting the very edges.
  actionRail: 220, // Reserve the right edge used by TikTok/Shorts action buttons.
  narrationBottom: 580,
  sourceBottom: 470,
};

export const FONTS = {
  primary: "Inter, sans-serif",
};

export type Verdict =
  | "DATA SNAPSHOT"
  | "TURNOVER SPIKE"
  | "ELEVATED RISK"
  | "DILUTION WATCH"
  | "CYCLE DRAWDOWN"
  | "SCORECARD READ";

export interface VerdictOptions {
  volume24h?: number;
  marketCap?: number;
  fdv?: number;
  athChangePercentage?: number;
}

/**
 * Derive a semantic Act-5 scorecard classification from supplied market metrics.
 */
export function getVerdict(
  riskScore: number,
  priceChange24h: number,
  options: VerdictOptions = {},
): Verdict {
  const turnover = typeof options.volume24h === "number" &&
    typeof options.marketCap === "number" &&
    options.marketCap > 0
    ? (options.volume24h / options.marketCap) * 100
    : 0;
  if (turnover >= 15) return "TURNOVER SPIKE";
  if (Number.isFinite(riskScore) && riskScore >= 6.5 && Math.abs(priceChange24h) >= 5) {
    return "ELEVATED RISK";
  }
  if (
    typeof options.fdv === "number" &&
    typeof options.marketCap === "number" &&
    options.marketCap > 0 &&
    options.fdv / options.marketCap >= 2.0
  ) {
    return "DILUTION WATCH";
  }
  if (
    priceChange24h >= 3 &&
    typeof options.athChangePercentage === "number" &&
    options.athChangePercentage <= -55
  ) {
    return "CYCLE DRAWDOWN";
  }
  if (Number.isFinite(riskScore) && riskScore > 0) {
    return "SCORECARD READ";
  }
  return "DATA SNAPSHOT";
}

/** Map a `Verdict` category to its primary accent color. */
export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "ELEVATED RISK":
      return COLORS.negative;
    case "TURNOVER SPIKE":
    case "DILUTION WATCH":
    case "CYCLE DRAWDOWN":
      return COLORS.warning;
    case "SCORECARD READ":
      return COLORS.positive;
    case "DATA SNAPSHOT":
    default:
      return COLORS.accent;
  }
}
