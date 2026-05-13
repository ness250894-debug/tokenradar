import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../styles";

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function useRevealMotion(localFrame?: number, delay = 0) {
  const currentFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = (localFrame ?? currentFrame) - delay;
  const safeFrame = Math.max(0, frame);

  const driver = spring({
    frame: safeFrame,
    fps,
    durationInFrames: 18,
    config: {
      mass: 0.65,
      damping: 22,
      stiffness: 190,
      overshootClamping: true,
    },
  });

  return {
    localFrame: frame,
    opacity: frame < 0 ? 0 : interpolate(safeFrame, [0, 8], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    translateY: interpolate(driver, [0, 1], [46, 0]),
    scale: interpolate(driver, [0, 1], [0.965, 1]),
    blur: interpolate(safeFrame, [0, 14], [12, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    progress: driver,
  };
}

export const ProfessionalCard: React.FC<{
  children: React.ReactNode;
  accentColor?: string;
  delay?: number;
  localFrame?: number;
  width?: number | string;
  minHeight?: number;
  padding?: number | string;
  borderRadius?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  accentColor = COLORS.accent,
  delay = 0,
  localFrame,
  width = 820,
  minHeight,
  padding = 56,
  borderRadius = 36,
  style,
}) => {
  const motion = useRevealMotion(localFrame, delay);
  const frame = Math.max(0, motion.localFrame);
  const sweepX = interpolate(frame, [5, 26], [-95, 135], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweepOpacity = interpolate(frame, [3, 10, 23, 32], [0, 0.42, 0.22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trace = interpolate(frame, [0, 18], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        width,
        minHeight,
        padding,
        borderRadius,
        background: `linear-gradient(145deg, rgba(32,32,38,0.96), rgba(18,18,22,0.96))`,
        border: `1px solid ${accentColor}88`,
        boxShadow: `0 0 52px ${accentColor}22, 0 30px 80px rgba(0,0,0,0.48)`,
        opacity: motion.opacity,
        transform: `translateY(${motion.translateY}px) scale(${motion.scale})`,
        filter: `blur(${motion.blur}px)`,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${trace}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity: clampOpacity(motion.opacity),
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: `${trace}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity: clampOpacity(motion.opacity * 0.75),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -120,
          bottom: -120,
          left: `${sweepX}%`,
          width: "34%",
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.26), ${accentColor}40, transparent)`,
          opacity: sweepOpacity,
          transform: "skewX(-16deg)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
};

export const RevealText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  localFrame?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, localFrame, style }) => {
  const motion = useRevealMotion(localFrame, delay);

  return (
    <div
      style={{
        opacity: motion.opacity,
        transform: `translateY(${motion.translateY * 0.62}px) scale(${motion.scale})`,
        filter: `blur(${motion.blur * 0.25}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
