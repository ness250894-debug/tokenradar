import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, getVerdictColor } from "../styles";
import type { Verdict } from "../styles";
import { RevealText, useRevealMotion } from "./MotionPrimitives";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

export const VerdictBadge: React.FC<{
  verdict: Verdict;
  kicker?: string;
  labelOverride?: string;
  subLabel?: string;
  visualRecipe?: VideoVisualRecipe;
}> = ({
  verdict,
  kicker = "TOKENRADAR SCORECARD",
  labelOverride,
  subLabel = "EDUCATIONAL DATA ONLY",
  visualRecipe,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);
  const isTerminal = recipe.layoutPack === "terminal_feed";
  const isScoreboard = recipe.layoutPack === "scoreboard";

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const motion = useRevealMotion(undefined, 0);
  const sweepX = interpolate(frame, [10, 34], [-110, 125], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweepOpacity = interpolate(frame, [9, 15, 30, 40], [0, 0.48, 0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const verdictColor = getVerdictColor(verdict);
  const color = verdict !== "DATA SNAPSHOT"
    ? verdictColor
    : recipe.colorTheme === "electric_indigo"
      ? verdictColor
      : theme.accent;
  const label = labelOverride || verdict;
  const fontSize = label.length > 16
    ? (isScoreboard ? 68 : 64)
    : label.length > 12
      ? (isScoreboard ? 84 : 78)
      : (isScoreboard ? 108 : 98);

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
      <div
        style={{
          textAlign: isTerminal ? "left" : "center",
          transform: `translateY(${motion.translateY}px) scale(${motion.scale})`,
          filter: `blur(${motion.blur}px)`,
          width: isTerminal || isScoreboard ? 880 : "auto",
          maxWidth: 920,
        }}
      >
        <RevealText
          delay={4}
          style={{
            fontSize: 36,
            color: COLORS.textMuted,
            fontWeight: 800,
            marginBottom: 20,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </RevealText>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            fontSize,
            color: COLORS.background,
            backgroundColor: color,
            fontWeight: 900,
            padding: "38px 64px",
            borderRadius: isTerminal ? 6 : isScoreboard ? 14 : 24,
            textTransform: "uppercase",
            letterSpacing: 1,
            boxShadow: `0 20px 60px ${color}66`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -80,
              bottom: -80,
              left: `${sweepX}%`,
              width: "34%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent)",
              opacity: sweepOpacity,
              transform: "skewX(-16deg)",
            }}
          />
          <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
        </div>
        <RevealText
          delay={12}
          style={{
            fontSize: 30,
            color: COLORS.text,
            fontWeight: 800,
            marginTop: 26,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {subLabel}
        </RevealText>
      </div>

      {/* Watermark CTA */}
      <div
        style={{
          position: "absolute",
          bottom: 250,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 2,
          opacity: spring({
            frame: frame - 15,
            fps,
            config: { damping: 200 },
          }),
          color: recipe.layoutPack === "ticker_stack" ? theme.accent : COLORS.textMuted,
        }}
      >
        TOKENRADAR.CO
      </div>
    </AbsoluteFill>
  );
};
