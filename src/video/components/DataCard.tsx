import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { COLORS, FONTS } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";
import { PriceRangeBar, SparklineChart } from "./SparklineChart";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

export const DataCard: React.FC<{
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCapRank?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  tokenIconDataUrl?: string;
  sparklinePrices?: number[];
  sceneLabel?: string;
  visualRecipe?: VideoVisualRecipe;
}> = ({
  tokenName,
  symbol,
  price,
  priceChange24h,
  marketCapRank,
  volume24h,
  high24h,
  low24h,
  tokenIconDataUrl,
  sparklinePrices,
  sceneLabel = "Token Reveal",
  visualRecipe,
}) => {
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
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: isSplit ? 0 : 20, justifyContent: isSplit || isTerminal ? "flex-start" : "center" }}>
            {tokenIconDataUrl ? (
              <Img
                src={tokenIconDataUrl}
                alt={tokenName}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `2.5px solid ${changeColor}`,
                  boxShadow: `0 0 18px ${changeColor}66`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${theme.accent}44, ${changeColor}44)`,
                  border: `2px solid ${changeColor}`,
                  boxShadow: `0 0 16px ${changeColor}44`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: COLORS.text,
                  fontSize: 22,
                  fontWeight: 900,
                }}
              >
                {symbol.slice(0, 3)}
              </div>
            )}
            <div style={{ textAlign: "left" }}>
              <RevealText delay={5} style={{ fontSize: 32, color: COLORS.textMuted, fontWeight: 800 }}>
                {symbol}
              </RevealText>
              <RevealText delay={8} style={{ fontSize: isSplit ? 52 : 64, color: COLORS.text, fontWeight: 900, lineHeight: 1.05 }}>
                {tokenName}
              </RevealText>
            </div>
          </div>

          <div style={{ textAlign: isSplit ? "right" : "inherit" }}>
            <RevealText delay={12} style={{ fontSize: isSplit ? 70 : isScoreboard ? 116 : 98, color: COLORS.text, fontWeight: 900, lineHeight: 1 }}>
              ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </RevealText>

            <RevealText
              delay={15}
              style={{
                fontSize: isSplit ? 44 : 54,
                color: changeColor,
                fontWeight: 800,
                marginTop: 14,
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
            marginTop: 26,
            color: COLORS.textMuted,
            fontSize: 26,
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          <div>{rankLabel}</div>
          <div style={{ color: COLORS.surfaceHighlight }}>|</div>
          <div>Vol {formatCompact(volume24h)}</div>
        </RevealText>

        {sparklinePrices && sparklinePrices.length > 2 ? (
          <SparklineChart prices={sparklinePrices} color={changeColor} width={isSplit ? 760 : 700} />
        ) : high24h && low24h && high24h > low24h ? (
          <PriceRangeBar current={price} low={low24h} high={high24h} color={changeColor} width={isSplit ? 760 : 700} />
        ) : null}
      </ProfessionalCard>
    </AbsoluteFill>
  );
};
