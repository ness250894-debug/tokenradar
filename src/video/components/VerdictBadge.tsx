import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, getVerdictColor } from "../styles";
import type { Verdict } from "../styles";

export const VerdictBadge: React.FC<{
  verdict: Verdict;
}> = ({ verdict }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const scale = spring({
    frame,
    fps,
    from: 0.5,
    to: 1,
    config: { mass: 0.5, damping: 10, stiffness: 100 },
  });

  const color = getVerdictColor(verdict);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONTS.primary,
        opacity,
      }}
    >
      <div style={{ textAlign: "center", transform: `scale(${scale})` }}>
        <div style={{ fontSize: 40, color: COLORS.textMuted, fontWeight: 700, marginBottom: 20, letterSpacing: 4 }}>
          TOKENRADAR VERDICT
        </div>
        <div
          style={{
            fontSize: 120,
            color: COLORS.background,
            backgroundColor: color,
            fontWeight: 900,
            padding: "40px 80px",
            borderRadius: 20,
            textTransform: "uppercase",
            boxShadow: `0 20px 60px ${color}66`,
          }}
        >
          {verdict}
        </div>
      </div>

      {/* Watermark CTA */}
      <div
        style={{
          position: "absolute",
          bottom: 250,
          fontSize: 30,
          color: COLORS.textMuted,
          fontWeight: 700,
          letterSpacing: 2,
          opacity: spring({
            frame: frame - 15,
            fps,
            config: { damping: 200 },
          }),
        }}
      >
        TOKENRADAR.CO
      </div>
    </AbsoluteFill>
  );
};
