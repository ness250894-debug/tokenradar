import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../styles";

export const MetricsView: React.FC<{
  marketCap: number;
  riskScore: number;
}> = ({ marketCap, riskScore }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const slideIn = spring({
    frame,
    fps,
    from: 100,
    to: 0,
    config: { mass: 0.5, damping: 14 },
  });

  const formatMarketCap = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`;
    return `$${mc.toLocaleString()}`;
  };

  const riskColor = riskScore < 4 ? COLORS.positive : riskScore < 7 ? COLORS.warning : COLORS.negative;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONTS.primary,
        opacity,
      }}
    >
      <div style={{ transform: `translateY(${slideIn}px)`, width: 800 }}>
        <div style={{ marginBottom: 60, textAlign: "center" }}>
          <div style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 700, marginBottom: 10 }}>
            MARKET CAP
          </div>
          <div style={{ fontSize: 100, color: COLORS.text, fontWeight: 900 }}>
            {formatMarketCap(marketCap)}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 700, marginBottom: 10 }}>
            RISK SCORE (1-10)
          </div>
          <div style={{ fontSize: 120, color: riskColor, fontWeight: 900 }}>
            {riskScore.toFixed(1)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
