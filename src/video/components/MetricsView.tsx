import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";

export const MetricsView: React.FC<{
  marketCap: number;
  marketCapRank?: number;
  priceChange24h: number;
  riskScore: number;
  riskLevel?: string;
  volume24h?: number;
  growthPotentialIndex?: number;
}> = ({
  marketCap,
  marketCapRank,
  priceChange24h,
  riskScore,
  riskLevel,
  volume24h,
  growthPotentialIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const formatCompact = (value: number | undefined) => {
    if (!value) return "N/A";
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const volumeToCap = marketCap > 0 && volume24h ? (volume24h / marketCap) * 100 : undefined;
  const riskColor = riskScore < 4 ? COLORS.positive : riskScore < 7 ? COLORS.warning : COLORS.negative;
  const changeColor = priceChange24h >= 0 ? COLORS.positive : COLORS.negative;
  const beatFrames = Math.floor(fps * 1.65);
  const metricCount = 5;
  const summaryStartFrame = beatFrames * metricCount;
  const isSummary = frame >= summaryStartFrame;
  const summaryFrame = frame - summaryStartFrame;
  const activeIndex = Math.min(metricCount - 1, Math.floor(frame / beatFrames));
  const beatFrame = frame - activeIndex * beatFrames;
  const countDriver = spring({
    frame: Math.max(0, beatFrame - 3),
    fps,
    durationInFrames: 18,
    config: {
      mass: 0.7,
      damping: 24,
      stiffness: 180,
      overshootClamping: true,
    },
  });

  const metrics = [
    {
      label: "24H MOVE",
      numericValue: priceChange24h,
      formatValue: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
      sub: priceChange24h >= 0 ? "Momentum is positive today" : "Momentum is cooling today",
      color: changeColor,
    },
    {
      label: "MARKET CAP",
      numericValue: marketCap,
      formatValue: formatCompact,
      sub: marketCapRank ? `Market rank #${marketCapRank}` : "Rank unavailable",
      color: COLORS.text,
    },
    {
      label: "24H VOLUME",
      numericValue: volume24h,
      formatValue: formatCompact,
      sub: volumeToCap ? `${volumeToCap.toFixed(2)}% of market cap` : "Volume ratio unavailable",
      color: COLORS.accent,
    },
    {
      label: "RISK SCORE",
      numericValue: riskScore,
      formatValue: (value: number) => `${value.toFixed(1)}/10`,
      sub: riskLevel ? `${riskLevel.toUpperCase()} risk profile` : "Risk profile",
      color: riskColor,
    },
    {
      label: "GROWTH INDEX",
      numericValue: growthPotentialIndex,
      formatValue: (value: number) => `${Math.round(value)}/100`,
      sub: "TokenRadar growth potential",
      color: COLORS.warning,
    },
  ];

  const activeMetric = metrics[activeIndex] || metrics[metrics.length - 1];
  const activeValue = activeMetric.numericValue === undefined
    ? "N/A"
    : activeMetric.formatValue(activeMetric.numericValue * countDriver);
  const moveLabel = `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`;
  const rankLabel = marketCapRank ? `Rank #${marketCapRank}` : "Rank N/A";
  const riskLabel = riskLevel ? `${riskLevel.toUpperCase()} risk ${riskScore.toFixed(1)}/10` : `Risk ${riskScore.toFixed(1)}/10`;
  const growthLabel = growthPotentialIndex === undefined ? "Growth index N/A" : `Growth index ${growthPotentialIndex}/100`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONTS.primary,
        opacity,
      }}
    >
      <div style={{ width: 860 }}>
        {isSummary ? (
          <ProfessionalCard
            key="metrics-summary"
            accentColor={COLORS.accent}
            localFrame={summaryFrame}
            width={860}
            minHeight={460}
            padding="56px 50px"
            borderRadius={32}
            style={{ fontFamily: FONTS.primary, textAlign: "left" }}
          >
            <RevealText localFrame={summaryFrame} delay={4} style={{ fontSize: 34, color: COLORS.accent, fontWeight: 900, marginBottom: 22, textTransform: "uppercase" }}>
              Snapshot Summary
            </RevealText>
            <RevealText localFrame={summaryFrame} delay={8} style={{ fontSize: 42, color: COLORS.text, fontWeight: 850, lineHeight: 1.22 }}>
              Previous slides show a liquid momentum setup: <span style={{ color: changeColor }}>{moveLabel}</span> over 24h with {formatCompact(volume24h)} volume and {formatCompact(marketCap)} market cap.
            </RevealText>
            <RevealText localFrame={summaryFrame} delay={14} style={{ fontSize: 32, color: COLORS.textMuted, fontWeight: 800, lineHeight: 1.32, marginTop: 28 }}>
              {rankLabel} | {riskLabel} | {growthLabel}
            </RevealText>
          </ProfessionalCard>
        ) : (
          <ProfessionalCard
            key={activeMetric.label}
            accentColor={activeMetric.color}
            localFrame={beatFrame}
            width={860}
            minHeight={460}
            padding="62px 50px"
            borderRadius={32}
            style={{ fontFamily: FONTS.primary, textAlign: "center" }}
          >
            <div
              style={{
                minHeight: 336,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
            <RevealText localFrame={beatFrame} delay={4} style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 900, marginBottom: 18 }}>
              {activeMetric.label}
            </RevealText>
            <RevealText localFrame={beatFrame} delay={7} style={{ fontSize: 118, color: activeMetric.color, fontWeight: 900, lineHeight: 1 }}>
              {activeValue}
            </RevealText>
            <RevealText localFrame={beatFrame} delay={11} style={{ fontSize: 36, color: COLORS.text, fontWeight: 700, marginTop: 34 }}>
              {activeMetric.sub}
            </RevealText>
            </div>
          </ProfessionalCard>
        )}
      </div>
    </AbsoluteFill>
  );
};
