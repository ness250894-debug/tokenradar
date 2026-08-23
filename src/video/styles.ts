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

export type Verdict = "DATA SNAPSHOT";

export function getVerdict(_riskScore: number, _priceChange24h: number): Verdict {
  return "DATA SNAPSHOT";
}

export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "DATA SNAPSHOT":
      return COLORS.accent;
    default:
      return COLORS.text;
  }
}
