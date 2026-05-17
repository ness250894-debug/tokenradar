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
import type { VideoAssetLayer, VideoAssetStageSegment, VideoMediaStage } from "../../lib/video-assets";
import { getVideoTheme, resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";
import { MediaAssetLayer } from "./MediaAssetLayer";

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
  visualRecipe?: VideoVisualRecipe;
  mediaAssets?: VideoAssetLayer[];
  mediaSegments?: VideoAssetStageSegment[];
  mediaStage?: VideoMediaStage;
}> = ({ priceChange24h, riskScore, verdict, visualRecipe, mediaAssets, mediaSegments, mediaStage = "ambient" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const theme = getVideoTheme(recipe);
  const signalColor = resolveAccentColor(verdict, priceChange24h, riskScore);
  const accentColor = recipe.colorTheme === "electric_indigo" ? signalColor : theme.accent;
  const pulse = Math.sin(frame / 22) * 0.5 + 0.5;
  const slowProgress = frame / Math.max(durationInFrames, 1);
  const brandScale = interpolate(
    Math.sin(frame / 90),
    [-1, 1],
    [1.04, 1.12],
  );
  const scanY = interpolate(frame % 180, [0, 180], [-180, 2100]);
  const tickerX = interpolate(frame % 150, [0, 150], [-740, 0]);
  const gridSize = recipe.backgroundSystem === "terminal_scan" ? "72px 72px" : "96px 96px";
  const isPrimaryMediaStage = mediaStage === "primary" && (Boolean(mediaAssets?.length) || Boolean(mediaSegments?.length));

  if (isPrimaryMediaStage) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: COLORS.background,
          overflow: "hidden",
        }}
      >
        <MediaAssetLayer
          assets={mediaAssets}
          segments={mediaSegments}
          visualRecipe={recipe}
          mediaStage={mediaStage}
        />
        <AbsoluteFill
          style={{
            background: [
              "linear-gradient(180deg, rgba(0,0,0,0.56) 0%, rgba(0,0,0,0.22) 30%, rgba(0,0,0,0.24) 60%, rgba(0,0,0,0.68) 100%)",
              "linear-gradient(90deg, rgba(0,0,0,0.54) 0%, rgba(0,0,0,0.12) 44%, rgba(0,0,0,0.32) 100%)",
            ].join(", "),
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        overflow: "hidden",
      }}
    >
      <MediaAssetLayer
        assets={mediaAssets}
        segments={mediaSegments}
        visualRecipe={recipe}
        mediaStage={mediaStage}
      />

      <AbsoluteFill
        style={{
          backgroundImage: backgroundGrid(accentColor),
          backgroundSize: gridSize,
          transform: `translateY(${-(frame % 96)}px)`,
          opacity: isPrimaryMediaStage ? 0.1 : recipe.backgroundSystem === "heatmap_field" ? 0.16 : 0.28,
        }}
      />

      {!isPrimaryMediaStage && (
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
      )}

      <div
        style={{
          position: "absolute",
          inset: -160,
          background: [
            `linear-gradient(118deg, transparent 0%, ${accentColor}1f 32%, transparent 58%)`,
            `linear-gradient(22deg, ${theme.secondary}18 0%, transparent 44%)`,
            `linear-gradient(292deg, ${theme.negative}14 0%, transparent 48%)`,
          ].join(", "),
          opacity: isPrimaryMediaStage ? 0.42 : 0.95,
        }}
      />

      {recipe.backgroundSystem === "ticker_tape" && (
        <div
          style={{
            position: "absolute",
            left: tickerX,
            right: -740,
            top: 280,
            height: 1180,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            opacity: 0.22,
            color: theme.muted,
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 3,
            transform: "rotate(-8deg)",
          }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} style={{ whiteSpace: "nowrap" }}>
              TOKENRADAR DATA SIGNAL / RISK CHECK / LIQUIDITY / MOMENTUM / TOKENRADAR DATA SIGNAL
            </div>
          ))}
        </div>
      )}

      {recipe.backgroundSystem === "heatmap_field" && (
        <div
          style={{
            position: "absolute",
            inset: 90,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 18,
            opacity: 0.18,
            transform: `translateY(${Math.sin(frame / 34) * 18}px)`,
          }}
        >
          {Array.from({ length: 30 }).map((_, index) => {
            const intensity = 0.16 + ((index * 17 + frame) % 80) / 220;
            return (
              <div
                key={index}
                style={{
                  height: 112,
                  borderRadius: 8,
                  background: index % 4 === 0 ? theme.negative : index % 3 === 0 ? theme.warning : accentColor,
                  opacity: intensity,
                }}
              />
            );
          })}
        </div>
      )}

      {recipe.backgroundSystem === "liquidity_depth" && (
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            bottom: 250,
            height: 520,
            opacity: 0.2,
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
          }}
        >
          {Array.from({ length: 26 }).map((_, index) => {
            const height = 60 + ((index * 37 + frame) % 260);
            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  height,
                  background: `linear-gradient(180deg, ${accentColor}, transparent)`,
                  borderRadius: 6,
                }}
              />
            );
          })}
        </div>
      )}

      {!isPrimaryMediaStage && AVATAR_LAYERS.map((layer, index) => {
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
          opacity: isPrimaryMediaStage ? 0.12 : 0.4,
          transform: `scale(${1 + pulse * 0.08})`,
          boxShadow: `0 0 90px ${accentColor}24 inset, 0 0 80px ${accentColor}16`,
        }}
      />

      {recipe.backgroundSystem === "terminal_scan" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
          backgroundImage: `repeating-linear-gradient(180deg, transparent 0, transparent 18px, ${accentColor}0f 19px, transparent 21px)`,
            opacity: isPrimaryMediaStage ? 0.18 : 0.5,
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 210,
          top: 430,
          width: 660,
          height: 660,
          borderRadius: "50%",
          border: `1px solid ${accentColor}44`,
          opacity: isPrimaryMediaStage ? 0.1 : 0.32,
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
          opacity: isPrimaryMediaStage ? 0.16 : recipe.backgroundSystem === "radar_grid" ? 0.42 : 0.3,
          transform: recipe.backgroundSystem === "orbital_map" ? "skewY(8deg)" : "skewY(-8deg)",
        }}
      />

      <AbsoluteFill
        style={{
          background: [
            isPrimaryMediaStage
              ? "linear-gradient(180deg, rgba(10,10,11,0.54) 0%, rgba(10,10,11,0.24) 42%, rgba(10,10,11,0.72) 100%)"
              : "linear-gradient(180deg, rgba(10,10,11,0.84) 0%, rgba(10,10,11,0.56) 42%, rgba(10,10,11,0.9) 100%)",
            "linear-gradient(90deg, rgba(10,10,11,0.34) 0%, transparent 18%, transparent 82%, rgba(10,10,11,0.34) 100%)",
          ].join(", "),
        }}
      />
    </AbsoluteFill>
  );
};
