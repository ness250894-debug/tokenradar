import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

export const ContextView: React.FC<{
  contextText: string;
  title?: string;
  formatLead?: string;
  tensionBullets?: [string, string];
  takeaway?: string;
  priceChange24h: number;
  marketCapRank?: number;
  volume24h?: number;
  riskScore: number;
  riskLevel?: string;
  growthPotentialIndex?: number;
  visualRecipe?: VideoVisualRecipe;
}> = ({
  contextText,
  title = "Market Context",
  tensionBullets,
  takeaway,
  priceChange24h,
  marketCapRank,
  volume24h,
  riskScore,
  growthPotentialIndex,
  visualRecipe,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);
  const isTerminal = recipe.layoutPack === "terminal_feed";
  const isSplit = recipe.layoutPack === "split_report" || recipe.layoutPack === "ticker_stack";
  const changeColor = priceChange24h >= 0 ? theme.positive : theme.negative;

  const formatCompact = (value: number | undefined) => {
    if (!value) return "N/A";
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const moveLabel = `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(1)}%`;
  const fallbackBullets: [string, string] = [
    `24H MOVE: ${moveLabel}${volume24h ? ` · ${formatCompact(volume24h)} VOL` : ""}`,
    `RISK SCORE: ${riskScore.toFixed(1)}/10${marketCapRank ? ` · RANK #${marketCapRank}` : growthPotentialIndex !== undefined ? ` · GROWTH ${growthPotentialIndex}/100` : ""}`,
  ];
  const bullets = tensionBullets || fallbackBullets;
  const conciseTakeaway = takeaway || (
    contextText.length <= 110
      ? contextText
      : `${contextText.slice(0, 107).trim()}...`
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
        padding: `0 ${SAFE_ZONES.horizontal}px`,
      }}
    >
      <ProfessionalCard
        accentColor={theme.accent}
        width={isSplit ? 940 : 880}
        minHeight={isTerminal ? 560 : 520}
        padding={isTerminal ? "44px 42px" : 50}
        borderRadius={isTerminal ? 6 : isSplit ? 18 : 36}
        style={{ fontFamily: FONTS.primary }}
      >
        {isTerminal && (
          <RevealText delay={2} style={{ fontSize: 22, color: theme.muted, fontWeight: 900, marginBottom: 14 }}>
            {">"} context.resolve(data_tension)
          </RevealText>
        )}
        <RevealText
          delay={3}
          style={{
            fontSize: 30,
            color: theme.accent,
            fontWeight: 900,
            marginBottom: 24,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </RevealText>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {bullets.map((bullet, index) => {
            const rowSpring = spring({
              frame: Math.max(0, frame - (6 + index * 7)),
              fps,
              config: { damping: 180, stiffness: 220 },
            });
            const rowY = interpolate(rowSpring, [0, 1], [22, 0]);
            const rowAccent = index === 0 ? changeColor : theme.accent;
            return (
              <div
                key={bullet}
                style={{
                  opacity: rowSpring,
                  transform: `translateY(${rowY}px)`,
                  padding: "24px 28px",
                  borderRadius: isTerminal ? 6 : 18,
                  backgroundColor: "rgba(255, 255, 255, 0.055)",
                  borderLeft: `6px solid ${rowAccent}`,
                  fontSize: isSplit ? 34 : 36,
                  fontWeight: 900,
                  color: COLORS.text,
                  letterSpacing: 0.5,
                  lineHeight: 1.2,
                }}
              >
                {bullet}
              </div>
            );
          })}
        </div>

        <RevealText
          delay={18}
          style={{
            marginTop: 26,
            fontSize: 30,
            color: COLORS.textMuted,
            fontWeight: 700,
            lineHeight: 1.32,
          }}
        >
          {conciseTakeaway}
        </RevealText>
      </ProfessionalCard>
    </AbsoluteFill>
  );
};
