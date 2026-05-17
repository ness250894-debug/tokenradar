import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { TopGainerProps } from "../Root";
import { COLORS, FONTS, SAFE_ZONES, type Verdict } from "../styles";
import { getVideoFormat } from "../../lib/video-formats";
import {
  getVideoSceneDurations,
  getVideoTheme,
  resolveVideoVisualRecipe,
  type VideoSceneId,
} from "../../lib/video-recipes";

interface StoryBeat {
  sceneId: VideoSceneId;
  eyebrow: string;
  headline: React.ReactNode;
  supporting?: React.ReactNode;
  align?: "left" | "center";
  compact?: boolean;
}

function formatCompact(value: number | undefined): string {
  if (!value) return "N/A";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function cleanText(value: string | undefined): string {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function firstSentence(value: string | undefined): string {
  const text = cleanText(value);
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.length > 118 ? `${sentence.slice(0, 112).trim()}...` : sentence;
}

function getWatchLabel(verdict: Verdict | undefined, fallback: string): string {
  if (fallback) return fallback;
  if (verdict === "CAUTION") return "RISK ELEVATED";
  if (verdict === "HOLD") return "NEUTRAL WATCH";
  if (verdict === "BUY" || verdict === "STRONG BUY") return "POSITIVE DATA SETUP";
  return "DATA WATCH";
}

function formatMoveLabel(priceChange24h: number): string | null {
  const roundedAbsMove = Math.round(Math.abs(priceChange24h) * 100) / 100;
  if (roundedAbsMove === 0) return null;
  return `${priceChange24h >= 0 ? "+" : "-"}${roundedAbsMove.toFixed(2)}%`;
}

function getNearFlatRevealCopy(formatKey: string | undefined, symbol: string): {
  headline: React.ReactNode;
  supporting: string;
} {
  if (formatKey === "catalyst_explainer") {
    return {
      headline: (
        <>
          {symbol} has a <Highlight color="#10B981">fresh catalyst</Highlight>
        </>
      ),
      supporting: "Price action is flat; catalyst and volume confirmation matter next.",
    };
  }

  if (formatKey === "new_listing_radar") {
    return {
      headline: (
        <>
          {symbol} is on <Highlight color="#10B981">new radar</Highlight>
        </>
      ),
      supporting: "Fresh attention needs liquidity and risk filters before it becomes useful.",
    };
  }

  if (formatKey === "risk_alert" || formatKey === "risk_score_breakdown") {
    return {
      headline: (
        <>
          {symbol} needs a <Highlight color="#F59E0B">risk check</Highlight>
        </>
      ),
      supporting: "Flat price action still needs risk, liquidity, and confirmation checks.",
    };
  }

  return {
    headline: (
      <>
        {symbol} is <Highlight color="#10B981">back on radar</Highlight>
      </>
    ),
    supporting: "The move is muted; watch whether volume creates confirmation.",
  };
}

const Highlight: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{ color, WebkitTextStroke: "0 transparent" }}>{children}</span>
);

const StoryBeatText: React.FC<{
  beat: StoryBeat;
  durationInFrames: number;
  accentColor: string;
}> = ({ beat, durationInFrames, accentColor }) => {
  const frame = useCurrentFrame();
  const enterEnd = Math.min(14, Math.floor(durationInFrames * 0.22));
  const exitStart = Math.max(enterEnd + 1, durationInFrames - 14);
  const opacity = interpolate(frame, [0, enterEnd, exitStart, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, enterEnd, exitStart, durationInFrames], [22, 0, 0, -18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const align = beat.align || "left";
  const headlineSize = beat.compact ? 58 : 76;

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONTS.primary,
        color: COLORS.text,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: SAFE_ZONES.top + 28,
          left: SAFE_ZONES.horizontal,
          right: SAFE_ZONES.horizontal + 90,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "rgba(255,255,255,0.72)",
          fontSize: 23,
          fontWeight: 900,
          textTransform: "uppercase",
          textShadow: "0 3px 14px rgba(0,0,0,0.72)",
        }}
      >
        <span>TOKENRADAR</span>
        <span>{beat.eyebrow}</span>
      </div>

      <div
        style={{
          position: "absolute",
          top: 410,
          bottom: SAFE_ZONES.bottom + 40,
          left: SAFE_ZONES.horizontal,
          right: SAFE_ZONES.horizontal + 110,
          display: "flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "flex-start",
          textAlign: align,
        }}
      >
        <div style={{ width: "100%", maxWidth: align === "center" ? 880 : 820 }}>
          <div
            style={{
              color: accentColor,
              fontSize: 28,
              fontWeight: 950,
              marginBottom: 22,
              textTransform: "uppercase",
              textShadow: "0 4px 18px rgba(0,0,0,0.86)",
            }}
          >
            {beat.eyebrow}
          </div>
          <div
            style={{
              fontSize: headlineSize,
              lineHeight: 1.02,
              fontWeight: 950,
              letterSpacing: 0,
              textTransform: "uppercase",
              textShadow: "0 6px 24px rgba(0,0,0,0.92), 0 2px 0 rgba(0,0,0,0.72)",
              WebkitTextStroke: "1.5px rgba(0,0,0,0.42)",
              overflowWrap: "break-word",
            }}
          >
            {beat.headline}
          </div>
          {beat.supporting && (
            <div
              style={{
                marginTop: 28,
                fontSize: 32,
                lineHeight: 1.2,
                fontWeight: 850,
                color: "rgba(255,255,255,0.88)",
                textShadow: "0 5px 22px rgba(0,0,0,0.9)",
                maxWidth: 760,
                marginLeft: align === "center" ? "auto" : 0,
                marginRight: align === "center" ? "auto" : 0,
              }}
            >
              {beat.supporting}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BrollStoryOverlay: React.FC<TopGainerProps> = ({
  tokenName,
  symbol,
  price,
  priceChange24h,
  riskScore,
  riskLevel,
  marketCap,
  marketCapRank,
  volume24h,
  growthPotentialIndex,
  hookText,
  verdict,
  contextText,
  videoFormatKey,
  videoThesis,
  visualRecipe: inputVisualRecipe,
}) => {
  const { durationInFrames } = useVideoConfig();
  const videoFormat = getVideoFormat(videoFormatKey);
  const visualRecipe = resolveVideoVisualRecipe(inputVisualRecipe);
  const sceneDurations = getVideoSceneDurations(visualRecipe);
  const theme = getVideoTheme(visualRecipe);
  const moveColor = priceChange24h >= 0 ? theme.positive : theme.negative;
  const moveLabel = formatMoveLabel(priceChange24h);
  const nearFlatRevealCopy = moveLabel ? null : getNearFlatRevealCopy(videoFormat.key, symbol);
  const context = firstSentence(videoThesis || contextText) ||
    "The setup needs price, volume, and risk confirmation before it deserves attention.";
  const rankLabel = marketCapRank ? `Rank #${marketCapRank}` : "Rank N/A";
  const riskLabel = riskLevel ? `${riskLevel.toUpperCase()} risk ${riskScore.toFixed(1)}/10` : `Risk ${riskScore.toFixed(1)}/10`;
  const growthLabel = growthPotentialIndex === undefined ? "Growth N/A" : `Growth ${Math.round(growthPotentialIndex)}/100`;
  const signalLabel = getWatchLabel(verdict, videoFormat.signalLabel);

  const beatsByScene: Record<VideoSceneId, StoryBeat> = {
    hook: {
      sceneId: "hook",
      eyebrow: videoFormat.openingEyebrow,
      headline: cleanText(hookText) || `${symbol} is moving. Check the data.`,
      supporting: "A quick market read. Educational data only.",
    },
    reveal: {
      sceneId: "reveal",
      eyebrow: videoFormat.revealLabel,
      headline: nearFlatRevealCopy?.headline || (
        <>
          {symbol} is <Highlight color={moveColor}>{moveLabel}</Highlight> today
        </>
      ),
      supporting: nearFlatRevealCopy?.supporting || (
        <>
          {tokenName} at ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </>
      ),
    },
    metrics: {
      sceneId: "metrics",
      eyebrow: videoFormat.metricsTitle,
      headline: (
        <>
          Volume: <Highlight color={theme.accent}>{formatCompact(volume24h)}</Highlight>
        </>
      ),
      supporting: `${rankLabel} | ${riskLabel} | ${growthLabel}`,
    },
    context: {
      sceneId: "context",
      eyebrow: videoFormat.contextTitle,
      headline: context,
      supporting: `Market cap ${formatCompact(marketCap)}. Watch whether the move keeps follow-through.`,
      compact: true,
    },
    verdict: {
      sceneId: "verdict",
      eyebrow: videoFormat.verdictKicker,
      headline: <Highlight color={theme.accent}>{signalLabel}</Highlight>,
      supporting: "Not financial advice. Use this as a watchlist filter.",
      align: "center",
    },
  };

  const orderedBeats = visualRecipe.sceneOrder.map((sceneId) => beatsByScene[sceneId]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {orderedBeats.map((beat, index) => {
        const from = visualRecipe.sceneOrder
          .slice(0, index)
          .reduce((total, priorScene) => total + sceneDurations[priorScene], 0);
        const duration = index === orderedBeats.length - 1
          ? Math.max(1, durationInFrames - from)
          : sceneDurations[beat.sceneId];

        return (
          <Sequence key={beat.sceneId} from={from} durationInFrames={duration}>
            <StoryBeatText beat={beat} durationInFrames={duration} accentColor={theme.accent} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
