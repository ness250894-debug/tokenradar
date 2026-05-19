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
  bottom: 620, // Keep critical text above captions, CTAs, and action buttons.
  horizontal: 80, // Prevent text from hitting the very edges
};

export const FONTS = {
  primary: "Inter, sans-serif",
};

export type Verdict = "CONSTRUCTIVE" | "POSITIVE DATA" | "NEUTRAL" | "RISK ELEVATED";

export function getVerdict(riskScore: number, priceChange24h: number): Verdict {
  if (riskScore < 2.5 && priceChange24h > 0) return "CONSTRUCTIVE";
  if (riskScore < 4.0) return "POSITIVE DATA";
  if (riskScore < 6.0) return "NEUTRAL";
  return "RISK ELEVATED";
}

export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "CONSTRUCTIVE":
      return COLORS.positive;
    case "POSITIVE DATA":
      return "#34D399"; // Lighter green
    case "NEUTRAL":
      return COLORS.warning;
    case "RISK ELEVATED":
      return COLORS.negative;
    default:
      return COLORS.text;
  }
}
