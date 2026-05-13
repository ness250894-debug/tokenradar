import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, FONTS } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";

export const DataCard: React.FC<{
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCapRank?: number;
  volume24h?: number;
}> = ({ tokenName, symbol, price, priceChange24h, marketCapRank, volume24h }) => {
  const isPositive = priceChange24h >= 0;
  const changeColor = isPositive ? COLORS.positive : COLORS.negative;

  const formatCompact = (value: number | undefined) => {
    if (!value) return "N/A";
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const rankLabel = marketCapRank ? `Rank #${marketCapRank}` : "Rank N/A";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ProfessionalCard
        accentColor={changeColor}
        style={{
          textAlign: "center",
          fontFamily: FONTS.primary,
        }}
        width={810}
        padding={52}
        borderRadius={40}
      >
        <RevealText delay={5} style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 800, marginBottom: 10 }}>
          {symbol}
        </RevealText>
        <RevealText delay={8} style={{ fontSize: 86, color: COLORS.text, fontWeight: 900, marginBottom: 30 }}>
          {tokenName}
        </RevealText>

        <RevealText delay={12} style={{ fontSize: 110, color: COLORS.text, fontWeight: 900 }}>
          ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </RevealText>

        <RevealText
          delay={15}
          style={{
            fontSize: 60,
            color: changeColor,
            fontWeight: 800,
            marginTop: 16,
          }}
        >
          {isPositive ? "+" : ""}{priceChange24h.toFixed(2)}%
        </RevealText>

        <RevealText
          delay={18}
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 18,
            marginTop: 32,
            color: COLORS.textMuted,
            fontSize: 28,
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          <div>{rankLabel}</div>
          <div style={{ color: COLORS.surfaceHighlight }}>|</div>
          <div>Vol {formatCompact(volume24h)}</div>
        </RevealText>
      </ProfessionalCard>
    </AbsoluteFill>
  );
};
