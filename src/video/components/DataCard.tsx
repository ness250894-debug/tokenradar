import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, FONTS } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

export const DataCard: React.FC<{
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCapRank?: number;
  volume24h?: number;
  sceneLabel?: string;
  visualRecipe?: VideoVisualRecipe;
}> = ({ tokenName, symbol, price, priceChange24h, marketCapRank, volume24h, sceneLabel = "Token Reveal", visualRecipe }) => {
  const isPositive = priceChange24h >= 0;
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);
  const changeColor = isPositive ? theme.positive : theme.negative;
  const isSplit = recipe.layoutPack === "split_report";
  const isTerminal = recipe.layoutPack === "terminal_feed";
  const isScoreboard = recipe.layoutPack === "scoreboard";

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
        alignItems: isSplit ? "stretch" : "center",
        padding: isSplit ? "0 72px" : undefined,
      }}
    >
      <ProfessionalCard
        accentColor={changeColor}
        style={{
          textAlign: isSplit || isTerminal ? "left" : "center",
          fontFamily: FONTS.primary,
        }}
        width={isSplit ? 900 : isScoreboard ? 900 : 810}
        padding={isTerminal ? "48px 46px" : 52}
        borderRadius={isTerminal ? 6 : isScoreboard ? 18 : 40}
      >
        <RevealText delay={3} style={{ fontSize: 30, color: changeColor, fontWeight: 900, marginBottom: 18, textTransform: "uppercase", letterSpacing: 2 }}>
          {sceneLabel}
        </RevealText>
        <div style={{ display: isSplit ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 26, alignItems: "center" }}>
          <div>
            <RevealText delay={5} style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 800, marginBottom: 10 }}>
              {symbol}
            </RevealText>
            <RevealText delay={8} style={{ fontSize: isSplit ? 64 : 86, color: COLORS.text, fontWeight: 900, marginBottom: 30, lineHeight: 1.05 }}>
              {tokenName}
            </RevealText>
          </div>

          <div style={{ textAlign: isSplit ? "right" : "inherit" }}>
            <RevealText delay={12} style={{ fontSize: isSplit ? 74 : isScoreboard ? 126 : 110, color: COLORS.text, fontWeight: 900, lineHeight: 1 }}>
              ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </RevealText>

            <RevealText
              delay={15}
              style={{
                fontSize: isSplit ? 46 : 60,
                color: changeColor,
                fontWeight: 800,
                marginTop: 16,
              }}
            >
              {isPositive ? "+" : ""}{priceChange24h.toFixed(2)}%
            </RevealText>
          </div>
        </div>

        <RevealText
          delay={18}
          style={{
            display: "flex",
            justifyContent: isSplit || isTerminal ? "flex-start" : "center",
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
        {(recipe.layoutPack === "market_map" || recipe.layoutPack === "ticker_stack") && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 8,
              marginTop: 34,
            }}
          >
            {Array.from({ length: 16 }).map((_, index) => (
              <div
                key={index}
                style={{
                  height: 24 + (index % 5) * 8,
                  borderRadius: 4,
                  background: index % 3 === 0 ? changeColor : theme.accent,
                  opacity: 0.28 + (index % 4) * 0.12,
                }}
              />
            ))}
          </div>
        )}
      </ProfessionalCard>
    </AbsoluteFill>
  );
};
