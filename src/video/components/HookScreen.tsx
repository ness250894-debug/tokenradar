import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";

export const HookScreen: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animation
  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const translateY = spring({
    frame,
    fps,
    from: 50,
    to: 0,
    config: { mass: 0.5, damping: 10 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
        padding: `0 ${SAFE_ZONES.horizontal}px`,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          color: COLORS.text,
          fontFamily: FONTS.primary,
          fontSize: 80,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
          textShadow: `0 10px 30px rgba(0,0,0,0.5)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
