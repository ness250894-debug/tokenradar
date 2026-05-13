import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";

export const ContextView: React.FC<{
  contextText: string;
  priceChange24h: number;
  marketCapRank?: number;
  volume24h?: number;
  riskScore: number;
  riskLevel?: string;
  growthPotentialIndex?: number;
}> = ({
  contextText,
  priceChange24h,
  marketCapRank,
  volume24h,
  riskScore,
  riskLevel,
  growthPotentialIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const beats = contextText
    .split(/(?<=[.!?])\s+|;\s+|\s+while\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const contextBeats = beats.length > 0 ? beats : [contextText];
  const beatFrames = Math.max(1, Math.floor((7 * fps) / contextBeats.length));
  const activeIndex = Math.min(contextBeats.length - 1, Math.floor(frame / beatFrames));
  const beatFrame = frame - activeIndex * beatFrames;
  const textOpacity = interpolate(beatFrame, [0, 6, beatFrames - 8, beatFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textY = interpolate(beatFrame, [0, 8], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const changeColor = priceChange24h >= 0 ? COLORS.positive : COLORS.negative;

  const formatCompact = (value: number | undefined) => {
    if (!value) return "N/A";
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const moveLabel = `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`;
  const volumeText = volume24h ? ` with ${formatCompact(volume24h)} in 24h volume` : "";
  const riskText = riskLevel
    ? `${riskLevel.toUpperCase()} risk at ${riskScore.toFixed(1)}/10`
    : `risk at ${riskScore.toFixed(1)}/10`;
  const growthText = growthPotentialIndex === undefined
    ? "the growth index is unavailable"
    : `the growth index is ${growthPotentialIndex}/100`;
  const stabilityText = marketCapRank
    ? `Rank #${marketCapRank} liquidity and ${riskText} keep the setup more stable`
    : `${riskText} keeps the setup on watch`;

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
        accentColor={COLORS.accent}
        width={860}
        minHeight={560}
        padding={54}
        borderRadius={40}
        style={{ fontFamily: FONTS.primary }}
      >
        <RevealText delay={5} style={{ fontSize: 34, color: COLORS.accent, fontWeight: 900, marginBottom: 18, textTransform: "uppercase" }}>
          Market Context
        </RevealText>
        <RevealText
          localFrame={beatFrame}
          delay={0}
          style={{
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            fontSize: 37,
            color: COLORS.text,
            fontWeight: 700,
            lineHeight: 1.34,
            minHeight: 390,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>
            {contextBeats[activeIndex]}{" "}
            <span style={{ color: changeColor }}>The 24h move is {moveLabel}</span>{volumeText}, so this reads as real market activity, not just a thin spike. {stabilityText}, while {growthText}.
          </span>
        </RevealText>
      </ProfessionalCard>
    </AbsoluteFill>
  );
};
