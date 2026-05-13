import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";
import { RevealText } from "./MotionPrimitives";

export const HookScreen: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const underlineWidth = interpolate(frame, [18, 34], [0, 440], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const accentGlow = interpolate(frame, [16, 28, 58, 80], [0, 0.52, 0.22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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
          position: "relative",
          color: COLORS.text,
          fontFamily: FONTS.primary,
          fontSize: 80,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
          textShadow: `0 10px 30px rgba(0,0,0,0.5)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-90px -70px",
            background: `radial-gradient(circle at center, ${COLORS.accent}2e 0%, transparent 58%)`,
            filter: "blur(26px)",
            opacity: accentGlow,
          }}
        />
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
            margin: "34px auto 0",
            background: `linear-gradient(90deg, transparent, ${COLORS.accent}, ${COLORS.positive}, transparent)`,
            boxShadow: `0 0 28px ${COLORS.accent}88`,
          }}
        />
        <RevealText
          delay={14}
          style={{
            position: "relative",
            zIndex: 1,
            margin: "42px auto 0",
            width: 780,
            maxWidth: "100%",
            padding: "18px 24px",
            border: `1px solid ${COLORS.accent}88`,
            borderRadius: 18,
            background: "rgba(16, 16, 20, 0.72)",
            boxShadow: `0 0 28px ${COLORS.accent}22`,
            textTransform: "uppercase",
          }}
        >
          <div style={{ color: COLORS.text, fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
            Educational Market Data Only
          </div>
          <div style={{ color: COLORS.textMuted, fontSize: 22, fontWeight: 850, marginTop: 6, letterSpacing: 0.6 }}>
            No Buy Or Sell Instructions | Risk Varies By Token
          </div>
        </RevealText>
      </div>
    </AbsoluteFill>
  );
};
