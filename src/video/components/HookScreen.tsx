import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";
import { RevealText } from "./MotionPrimitives";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

export const HookScreen: React.FC<{
  text: string;
  eyebrow?: string;
  subline?: string;
  visualRecipe?: VideoVisualRecipe;
}> = ({ text, eyebrow = "Educational Market Data Only", subline = "Educational Research Only | Risk Varies By Token", visualRecipe }) => {
  const frame = useCurrentFrame();
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);
  const words = text.split(/\s+/).filter(Boolean);
  const isTerminal = recipe.layoutPack === "terminal_feed";
  const isSplit = recipe.layoutPack === "split_report" || recipe.layoutPack === "market_map";
  const isTicker = recipe.layoutPack === "ticker_stack";
  const underlineWidth = interpolate(frame, [18, 34], [0, 440], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cleanSubline = subline
    ? subline
        .replace(/^Educational\s+(Market\s+Data|Research)\s+Only\s*(\|\s*)?/i, "")
        .replace(/\|\s*Risk Varies By Token/i, "")
        .trim()
    : "";
  const accentGlow = interpolate(frame, [16, 28, 58, 80], [0, 0.52, 0.22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: isSplit || isTerminal ? "flex-start" : "center",
        padding: `0 ${SAFE_ZONES.horizontal}px`,
      }}
    >
      {isTicker && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 230,
            height: 66,
            background: theme.accent,
            color: COLORS.background,
            fontFamily: FONTS.primary,
            fontSize: 28,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          TokenRadar Market Read / Data First / Educational Only
        </div>
      )}
      <div
        style={{
          position: "relative",
          color: COLORS.text,
          fontFamily: FONTS.primary,
          fontSize: isTerminal ? 66 : isSplit ? 74 : 80,
          fontWeight: 900,
          textAlign: isTerminal || isSplit ? "left" : "center",
          lineHeight: 1.2,
          textShadow: `0 10px 30px rgba(0,0,0,0.5)`,
          width: isTerminal || isSplit ? 820 : "auto",
          marginLeft: isTerminal || isSplit ? 30 : 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-90px -70px",
            background: `radial-gradient(circle at center, ${theme.accent}2e 0%, transparent 58%)`,
            filter: "blur(26px)",
            opacity: accentGlow,
          }}
        />
        {isTerminal && (
          <RevealText delay={0} style={{ color: theme.accent, fontSize: 28, fontWeight: 900, marginBottom: 28 }}>
            $ tokenradar scan --market --risk --volume
          </RevealText>
        )}
        {eyebrow && (
          <RevealText
            delay={0}
            style={{
              position: "relative",
              zIndex: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 22px",
              borderRadius: 999,
              background: "rgba(16, 16, 24, 0.88)",
              border: `1.5px solid ${theme.accent}`,
              boxShadow: `0 0 24px ${theme.accent}44`,
              color: theme.accent,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            <span style={{ fontSize: 16 }}>●</span>
            {eyebrow}
          </RevealText>
        )}
        <div style={{ position: "relative", zIndex: 1 }}>
          {words.map((word, index) => (
            <RevealText
              key={`${word}-${index}`}
              delay={index * 2}
              style={{
                display: "inline-block",
                marginRight: index === words.length - 1 ? 0 : 18,
              }}
            >
              {word}
            </RevealText>
          ))}
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: underlineWidth,
            height: 4,
            margin: isTerminal || isSplit ? "34px 0 0" : "34px auto 0",
            background: `linear-gradient(90deg, transparent, ${theme.accent}, ${theme.positive}, transparent)`,
            boxShadow: `0 0 28px ${theme.accent}88`,
          }}
        />
        {cleanSubline ? (
          <RevealText
            delay={14}
            style={{
              position: "relative",
              zIndex: 1,
              margin: "32px auto 0",
              color: COLORS.textMuted,
              fontSize: 24,
              fontWeight: 850,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              textAlign: isTerminal || isSplit ? "left" : "center",
            }}
          >
            {cleanSubline}
          </RevealText>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
