import { ImageResponse } from "next/og";
import { formatPrice } from "./formatters";

export interface OgImageProps {
  name: string;
  symbol: string;
  price: number;
  riskScore: number;
  subtitle?: string;
}

export function generateTokenOgImage({
  name,
  symbol,
  price,
  riskScore,
  subtitle
}: OgImageProps): ImageResponse {
  // Determine risk color mapping
  const getRiskColor = (score: number) => {
    if (score <= 3) return "#00e676"; // green
    if (score <= 6) return "#ffd740"; // yellow
    return "#ff5252"; // red
  };

  const riskColor = getRiskColor(riskScore);
  const displaySubtitle = subtitle || "Full Token Analysis & Risk Score";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          backgroundColor: "#0a0b0f",
          backgroundImage: "linear-gradient(135deg, #0a0b0f 0%, #181922 100%)",
          color: "#f0f0f5",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Top Info: Logo / Branding */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Token<span style={{ color: "#d97706" }}>Radar</span>
        </div>

        {/* Main Content Area */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 32, color: "#9395a5", marginBottom: 12, fontWeight: 500 }}>
              {displaySubtitle}
            </span>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.03em", marginRight: 24 }}>
                {name}
              </span>
              <span style={{ fontSize: 42, color: "#d97706", fontWeight: 700 }}>
                {symbol.toUpperCase()}
              </span>
            </div>
            
            <div style={{ display: "flex", marginTop: 20, fontSize: 56, fontWeight: 800 }}>
              {formatPrice(price)}
            </div>
          </div>

          {/* Right Container: Risk Score Badge (very prominent) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "#12131a",
              padding: "40px",
              borderRadius: "24px",
              border: `2px solid ${riskColor}40`,
              boxShadow: `0 0 40px ${riskColor}20`
            }}
          >
            <div style={{ display: "flex", fontSize: 24, color: "#9395a5", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
              Risk Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 96, fontWeight: 800, color: riskColor, marginTop: 10 }}>
              {riskScore}<span style={{ display: "flex", fontSize: 48, color: "#5d5f72", marginLeft: 8 }}>/10</span>
            </div>
          </div>
        </div>

        {/* Footer: Social Handles */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 32,
            fontSize: 22,
            color: "#5d5f72",
            fontWeight: 500,
            borderTop: "1px solid #1e2030",
            paddingTop: 20,
          }}
        >
          <span style={{ display: "flex", alignItems: "center" }}>🌐 tokenradar.co</span>
          <span style={{ display: "flex", alignItems: "center" }}>𝕏 @tokenradarco</span>
          <span style={{ display: "flex", alignItems: "center" }}>✈️ t.me/TokenRadarCo</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
