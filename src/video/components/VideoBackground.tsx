import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, getVerdictColor, type Verdict } from "../styles";

const AVATAR_LAYERS = [
  { x: -110, y: 210, size: 360, opacity: 0.16, delay: 0, speed: 1.0, rotate: -10 },
  { x: 740, y: 270, size: 300, opacity: 0.14, delay: 18, speed: 0.85, rotate: 12 },
  { x: 620, y: 1280, size: 420, opacity: 0.12, delay: 42, speed: 0.7, rotate: -18 },
  { x: -170, y: 1280, size: 460, opacity: 0.11, delay: 64, speed: 0.65, rotate: 16 },
  { x: 380, y: 850, size: 280, opacity: 0.08, delay: 86, speed: 0.9, rotate: 0 },
] as const;

function resolveAccentColor(verdict: Verdict | undefined, priceChange24h: number, riskScore: number): string {
  if (verdict) return getVerdictColor(verdict);
  if (riskScore >= 7) return COLORS.negative;
  if (priceChange24h < 0) return COLORS.negative;
  if (riskScore >= 4) return COLORS.warning;
  return COLORS.positive;
}

function backgroundGrid(accentColor: string): string {
  return [
    `linear-gradient(${accentColor}12 1px, transparent 1px)`,
    `linear-gradient(90deg, ${accentColor}10 1px, transparent 1px)`,
  ].join(", ");
}

export const VideoBackground: React.FC<{
  priceChange24h: number;
  riskScore: number;
  verdict?: Verdict;
}> = ({ priceChange24h, riskScore, verdict }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accentColor = resolveAccentColor(verdict, priceChange24h, riskScore);
  const pulse = Math.sin(frame / 22) * 0.5 + 0.5;
  const slowProgress = frame / Math.max(durationInFrames, 1);
  const brandScale = interpolate(
    Math.sin(frame / 90),
    [-1, 1],
    [1.04, 1.12],
  );
  const scanY = interpolate(frame % 180, [0, 180], [-180, 2100]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: backgroundGrid(accentColor),
          backgroundSize: "96px 96px",
          transform: `translateY(${-(frame % 96)}px)`,
          opacity: 0.28,
        }}
      />

      <Img
        src={staticFile("og-image.png")}
        style={{
          position: "absolute",
          left: -260,
          top: -60,
          width: 1600,
          height: 1600,
          objectFit: "cover",
          opacity: 0.18,
          filter: "blur(18px) saturate(1.2)",
          transform: `scale(${brandScale}) rotate(${slowProgress * 3}deg)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: -160,
          background: [
            `linear-gradient(118deg, transparent 0%, ${accentColor}1f 32%, transparent 58%)`,
            "linear-gradient(22deg, rgba(34,211,238,0.08) 0%, transparent 44%)",
            "linear-gradient(292deg, rgba(124,58,237,0.10) 0%, transparent 48%)",
          ].join(", "),
          opacity: 0.95,
        }}
      />

      {AVATAR_LAYERS.map((layer, index) => {
        const bob = Math.sin((frame + layer.delay) / (36 / layer.speed)) * 26;
        const drift = Math.cos((frame + layer.delay) / (58 / layer.speed)) * 22;
        const rotate = layer.rotate + Math.sin((frame + layer.delay) / 80) * 5;
        const localPulse = interpolate(
          Math.sin((frame + layer.delay) / 28),
          [-1, 1],
          [0.75, 1.08],
        );

        return (
          <Img
            key={index}
            src={staticFile("icon.png")}
            style={{
              position: "absolute",
              left: layer.x + drift,
              top: layer.y + bob,
              width: layer.size,
              height: layer.size,
              opacity: layer.opacity * localPulse,
              filter: `drop-shadow(0 0 46px ${accentColor}66) blur(${index === 4 ? 1.5 : 0}px)`,
              transform: `rotate(${rotate}deg) scale(${localPulse})`,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 110,
          top: 330,
          width: 860,
          height: 860,
          borderRadius: "50%",
          border: `2px solid ${accentColor}${Math.round(42 + pulse * 36).toString(16).padStart(2, "0")}`,
          opacity: 0.4,
          transform: `scale(${1 + pulse * 0.08})`,
          boxShadow: `0 0 90px ${accentColor}24 inset, 0 0 80px ${accentColor}16`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 210,
          top: 430,
          width: 660,
          height: 660,
          borderRadius: "50%",
          border: `1px solid ${accentColor}44`,
          opacity: 0.32,
          transform: `scale(${1.06 - pulse * 0.05})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: scanY,
          height: 160,
          background: `linear-gradient(180deg, transparent, ${accentColor}28, transparent)`,
          opacity: 0.42,
          transform: "skewY(-8deg)",
        }}
      />

      <AbsoluteFill
        style={{
          background: [
            "linear-gradient(180deg, rgba(10,10,11,0.84) 0%, rgba(10,10,11,0.56) 42%, rgba(10,10,11,0.9) 100%)",
            "linear-gradient(90deg, rgba(10,10,11,0.34) 0%, transparent 18%, transparent 82%, rgba(10,10,11,0.34) 100%)",
          ].join(", "),
        }}
      />
    </AbsoluteFill>
  );
};
