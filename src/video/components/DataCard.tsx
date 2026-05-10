import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../styles";

export const DataCard: React.FC<{
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
}> = ({ tokenName, symbol, price, priceChange24h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isPositive = priceChange24h >= 0;
  const changeColor = isPositive ? COLORS.positive : COLORS.negative;

  const scale = spring({
    frame,
    fps,
    from: 0.8,
    to: 1,
    config: { mass: 0.5, damping: 12 },
  });

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          backgroundColor: COLORS.surface,
          padding: 60,
          borderRadius: 40,
          boxShadow: `0 20px 40px rgba(0,0,0,0.4)`,
          border: `2px solid ${COLORS.surfaceHighlight}`,
          width: 800,
          textAlign: "center",
          fontFamily: FONTS.primary,
        }}
      >
        <div style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 700, marginBottom: 10 }}>
          {symbol}
        </div>
        <div style={{ fontSize: 90, color: COLORS.text, fontWeight: 900, marginBottom: 40 }}>
          {tokenName}
        </div>

        <div style={{ fontSize: 120, color: COLORS.text, fontWeight: 900 }}>
          ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </div>

        <div
          style={{
            fontSize: 60,
            color: changeColor,
            fontWeight: 800,
            marginTop: 20,
          }}
        >
          {isPositive ? "+" : ""}{priceChange24h.toFixed(2)}%
        </div>
      </div>
    </AbsoluteFill>
  );
};
