import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";

export const ContextView: React.FC<{
  contextText: string;
}> = ({ contextText }) => {
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
    from: 0.9,
    to: 1,
    config: { mass: 0.5, damping: 12 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
        padding: `0 ${SAFE_ZONES.horizontal}px`,
        opacity,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          backgroundColor: COLORS.surface,
          padding: 60,
          borderRadius: 40,
          border: `2px solid ${COLORS.accent}`,
          boxShadow: `0 0 40px rgba(79, 70, 229, 0.3)`,
          width: 800,
          fontFamily: FONTS.primary,
        }}
      >
        <div style={{ fontSize: 40, color: COLORS.accent, fontWeight: 900, marginBottom: 30, textTransform: "uppercase" }}>
          Why It&apos;s Moving
        </div>
        <div style={{ fontSize: 50, color: COLORS.text, fontWeight: 500, lineHeight: 1.4 }}>
          {contextText}
        </div>
      </div>
    </AbsoluteFill>
  );
};
