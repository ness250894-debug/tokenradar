import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../styles";
import { ProfessionalCard, RevealText } from "./MotionPrimitives";
import type { VideoMetricId } from "../../lib/video-formats";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

interface MetricDefinition {
  id: VideoMetricId;
  label: string;
  numericValue: number | undefined;
  formatValue: (value: number) => string;
  sub: string;
  color: string;
}

export const MetricsView: React.FC<{
  marketCap: number;
  marketCapRank?: number;
  priceChange24h: number;
  riskScore: number;
  riskLevel?: string;
  volume24h?: number;
  growthPotentialIndex?: number;
  metricOrder?: readonly VideoMetricId[];
  summaryTitle?: string;
  summaryLead?: string;
  visualRecipe?: VideoVisualRecipe;
}> = ({
  marketCap,
  marketCapRank,
  priceChange24h,
  riskScore,
  riskLevel,
  volume24h,
  growthPotentialIndex,
  metricOrder,
  summaryTitle = "Snapshot Summary",
  summaryLead,
  visualRecipe,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);

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
  const riskColor = riskScore < 4 ? theme.positive : riskScore < 7 ? theme.warning : theme.negative;
  const changeColor = priceChange24h >= 0 ? theme.positive : theme.negative;
  const beatFrames = Math.floor(fps * 1.65);
  const baseMetrics: MetricDefinition[] = [
    {
      id: "priceMove",
      label: "24H MOVE",
      numericValue: priceChange24h,
      formatValue: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
      sub: priceChange24h >= 0 ? "Momentum is positive today" : "Momentum is cooling today",
      color: changeColor,
    },
    {
      id: "marketCap",
      label: "MARKET CAP",
      numericValue: marketCap,
      formatValue: formatCompact,
      sub: marketCapRank ? `Market rank #${marketCapRank}` : "Rank unavailable",
      color: COLORS.text,
    },
    {
      id: "volume",
      label: "24H VOLUME",
      numericValue: volume24h,
      formatValue: formatCompact,
      sub: volumeToCap ? `${volumeToCap.toFixed(2)}% of market cap` : "Volume ratio unavailable",
      color: COLORS.accent,
    },
    {
      id: "risk",
      label: "RISK SCORE",
      numericValue: riskScore,
      formatValue: (value: number) => `${value.toFixed(1)}/10`,
      sub: riskLevel ? `${riskLevel.toUpperCase()} risk profile` : "Risk profile",
      color: riskColor,
    },
    {
      id: "growth",
      label: "GROWTH INDEX",
      numericValue: growthPotentialIndex,
      formatValue: (value: number) => `${Math.round(value)}/100`,
      sub: "TokenRadar growth potential",
      color: COLORS.warning,
    },
  ];
  const requestedMetricIds = new Set(metricOrder || []);
  const orderedMetrics = [
    ...(metricOrder || [])
      .map((id) => baseMetrics.find((metric) => metric.id === id))
      .filter((metric): metric is MetricDefinition => Boolean(metric)),
    ...baseMetrics.filter((metric) => !requestedMetricIds.has(metric.id)),
  ];
  const seenMetricIds = new Set<VideoMetricId>();
  const metrics = orderedMetrics.filter((metric) => {
    if (seenMetricIds.has(metric.id)) return false;
    seenMetricIds.add(metric.id);
    return true;
  });
  const metricCount = metrics.length;
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

  const activeMetric = metrics[activeIndex] || metrics[metrics.length - 1];
  const activeValue = activeMetric.numericValue === undefined
    ? "N/A"
    : activeMetric.formatValue(activeMetric.numericValue * countDriver);
  const normalizedValue = activeMetric.id === "risk"
    ? Math.min(100, Math.max(0, (riskScore / 10) * 100))
    : activeMetric.id === "growth"
      ? Math.min(100, Math.max(0, growthPotentialIndex || 0))
      : activeMetric.id === "priceMove"
        ? Math.min(100, Math.max(8, Math.abs(priceChange24h) * 6))
        : activeMetric.id === "volume" && marketCap > 0 && volume24h
          ? Math.min(100, Math.max(8, (volume24h / marketCap) * 300))
          : 58;
  const moveLabel = `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`;
  const rankLabel = marketCapRank ? `Rank #${marketCapRank}` : "Rank N/A";
  const riskLabel = riskLevel ? `${riskLevel.toUpperCase()} risk ${riskScore.toFixed(1)}/10` : `Risk ${riskScore.toFixed(1)}/10`;
  const growthLabel = growthPotentialIndex === undefined ? "Growth index N/A" : `Growth index ${growthPotentialIndex}/100`;
  const renderChart = () => {
    if (recipe.chartPack === "spotlight_count") return null;
    if (recipe.chartPack === "risk_gauge") {
      return (
        <div style={{ margin: "34px auto 0", width: 520 }}>
          <div style={{ height: 26, borderRadius: 999, background: `${COLORS.surfaceHighlight}`, overflow: "hidden" }}>
            <div style={{ width: `${normalizedValue}%`, height: "100%", background: activeMetric.color, boxShadow: `0 0 24px ${activeMetric.color}88` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: COLORS.textMuted, fontSize: 20, fontWeight: 900 }}>
            <span>LOW</span><span>WATCH</span><span>HIGH</span>
          </div>
        </div>
      );
    }
    if (recipe.chartPack === "volume_ladder" || recipe.chartPack === "market_compare") {
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginTop: 34 }}>
          {Array.from({ length: 12 }).map((_, index) => {
            const height = 28 + ((index * 19 + Math.round(normalizedValue)) % 88);
            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  height,
                  borderRadius: 8,
                  background: index === activeIndex % 12 ? activeMetric.color : theme.accent,
                  opacity: 0.32 + (index % 4) * 0.14,
                }}
              />
            );
          })}
        </div>
      );
    }
    if (recipe.chartPack === "heat_tiles") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginTop: 34 }}>
          {Array.from({ length: 18 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: 34,
                borderRadius: 6,
                background: index % 5 === 0 ? theme.warning : index % 4 === 0 ? theme.negative : activeMetric.color,
                opacity: 0.2 + ((index * 11 + Math.round(normalizedValue)) % 60) / 100,
              }}
            />
          ))}
        </div>
      );
    }
    return (
      <div style={{ position: "relative", width: 260, height: 260, margin: "24px auto 0" }}>
        {[0, 1, 2].map((ring) => (
          <div
            key={ring}
            style={{
              position: "absolute",
              inset: ring * 36,
              borderRadius: "50%",
              border: `2px solid ${activeMetric.color}${ring === 0 ? "66" : "33"}`,
            }}
          />
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 126,
              top: 126,
              width: 4,
              height: 114,
              background: activeMetric.color,
              opacity: 0.35 + (index % 3) * 0.16,
              transformOrigin: "2px 2px",
              transform: `rotate(${index * 60 + normalizedValue}deg)`,
            }}
          />
        ))}
      </div>
    );
  };

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
            width={recipe.layoutPack === "split_report" ? 940 : 860}
            minHeight={460}
            padding="56px 50px"
            borderRadius={recipe.layoutPack === "terminal_feed" ? 6 : 32}
            style={{ fontFamily: FONTS.primary, textAlign: "left" }}
          >
            <RevealText localFrame={summaryFrame} delay={4} style={{ fontSize: 34, color: theme.accent, fontWeight: 900, marginBottom: 22, textTransform: "uppercase" }}>
              {summaryTitle}
            </RevealText>
            <RevealText localFrame={summaryFrame} delay={8} style={{ fontSize: 42, color: COLORS.text, fontWeight: 850, lineHeight: 1.22 }}>
              {summaryLead || "Previous slides show a liquid momentum setup."} <span style={{ color: changeColor }}>{moveLabel}</span> over 24h with {formatCompact(volume24h)} volume and {formatCompact(marketCap)} market cap.
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
            width={recipe.layoutPack === "scoreboard" ? 930 : 860}
            minHeight={460}
            padding="62px 50px"
            borderRadius={recipe.layoutPack === "terminal_feed" ? 6 : recipe.layoutPack === "scoreboard" ? 18 : 32}
            style={{ fontFamily: FONTS.primary, textAlign: recipe.layoutPack === "terminal_feed" ? "left" : "center" }}
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
            <RevealText localFrame={beatFrame} delay={14}>
              {renderChart()}
            </RevealText>
            </div>
          </ProfessionalCard>
        )}
      </div>
    </AbsoluteFill>
  );
};
