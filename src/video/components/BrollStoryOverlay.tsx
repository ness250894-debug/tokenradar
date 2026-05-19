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

function cleanText(value: string | undefined): string {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function firstSentence(value: string | undefined): string {
  const text = cleanText(value);
  if (!text) return "";
  const sentence = text
    .split(/(?<=[.!?])\s+/)[0]
    .replace(/\$\d[\d,.]*(?:[KMBT])?/gi, "market activity")
    .replace(/\b\d+(?:\.\d+)?\/10\b/g, "the risk read")
    .replace(/\b\d+(?:\.\d+)?\/100\b/g, "the growth read") || text;
  return sentence.length > 118 ? `${sentence.slice(0, 112).trim()}...` : sentence;
}

function getWatchLabel(verdict: Verdict | undefined, fallback: string): string {
  if (fallback) return fallback;
  if (verdict === "RISK ELEVATED") return "RISK ELEVATED";
  if (verdict === "NEUTRAL") return "NEUTRAL WATCH";
  if (verdict === "POSITIVE DATA" || verdict === "CONSTRUCTIVE") return "POSITIVE DATA SETUP";
  return "DATA WATCH";
}

function getStoryReveal(symbol: string, tokenName: string, formatKey: string): {
  headline: React.ReactNode;
  supporting: string;
} {
  if (formatKey === "new_listing_radar") {
    return {
      headline: (
        <>
          {symbol} is <Highlight color="#10B981">new on radar</Highlight>
        </>
      ),
      supporting: `${tokenName} needs context before conviction.`,
    };
  }

  if (formatKey === "catalyst_explainer") {
    return {
      headline: (
        <>
          {symbol} has a <Highlight color="#10B981">why-now story</Highlight>
        </>
      ),
      supporting: "Catalyst first. Metrics stay backstage.",
    };
  }

  if (formatKey === "risk_alert" || formatKey === "risk_score_breakdown") {
    return {
      headline: (
        <>
          {symbol} needs a <Highlight color="#F59E0B">risk check</Highlight>
        </>
      ),
      supporting: "Attention is useful only after confirmation.",
    };
  }

  return {
    headline: (
      <>
        {symbol} is <Highlight color="#10B981">back on radar</Highlight>
      </>
    ),
    supporting: `${tokenName} is the story. The dashboard stays backstage.`,
  };
}

function getStoryFilter(formatKey: string): {
  headline: React.ReactNode;
  supporting: string;
} {
  if (formatKey === "volume_spike_check" || formatKey === "liquidity_stress_test") {
    return {
      headline: (
        <>
          Attention needs <Highlight color="#10B981">proof</Highlight>
        </>
      ),
      supporting: "Fast activity matters only if it survives the first wave.",
    };
  }

  if (formatKey === "narrative_heatmap" || formatKey === "sector_rotation") {
    return {
      headline: (
        <>
          Narrative heat <Highlight color="#10B981">is loud</Highlight>
        </>
      ),
      supporting: "The question is whether the story spreads beyond one token.",
    };
  }

  if (formatKey === "momentum_cooling" || formatKey === "contrarian_signal") {
    return {
      headline: (
        <>
          The move still <Highlight color="#F59E0B">needs follow-through</Highlight>
        </>
      ),
      supporting: "A green candle can fade when attention cools.",
    };
  }

  if (formatKey === "risk_alert" || formatKey === "risk_score_breakdown") {
    return {
      headline: (
        <>
          The catch is <Highlight color="#F59E0B">risk</Highlight>
        </>
      ),
      supporting: "Good stories still need liquidity and confirmation.",
    };
  }

  return {
    headline: (
      <>
        The story needs <Highlight color="#10B981">confirmation</Highlight>
      </>
    ),
    supporting: "Attention is not the same thing as proof.",
  };
}

function getStoryVerdictLabel(verdict: Verdict | undefined, fallback: string): string {
  const label = getWatchLabel(verdict, fallback);
  if (label.includes("CONFIRMATION")) return "CONFIRMATION WATCH";
  if (label.includes("RISK")) return "RISK CHECK";
  if (label.includes("ROTATION")) return "ROTATION WATCH";
  if (label.includes("NARRATIVE")) return "NARRATIVE WATCH";
  if (label.includes("WATCHLIST")) return "WATCHLIST FILTER";
  return "MARKET CONTEXT";
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
  priceChange24h,
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
  const moveLabel = formatMoveLabel(priceChange24h);
  const nearFlatRevealCopy = moveLabel ? null : getNearFlatRevealCopy(videoFormat.key, symbol);
  const context = firstSentence(videoThesis || contextText) ||
    "The setup needs context and confirmation before it deserves attention.";
  const revealCopy = nearFlatRevealCopy || getStoryReveal(symbol, tokenName, videoFormat.key);
  const filterCopy = getStoryFilter(videoFormat.key);
  const researchLabel = getStoryVerdictLabel(verdict, videoFormat.signalLabel);

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
      headline: revealCopy.headline,
      supporting: revealCopy.supporting,
    },
    metrics: {
      sceneId: "metrics",
      eyebrow: videoFormat.metricsTitle,
      headline: filterCopy.headline,
      supporting: filterCopy.supporting,
    },
    context: {
      sceneId: "context",
      eyebrow: videoFormat.contextTitle,
      headline: context,
      supporting: "Watch whether attention turns into confirmation.",
      compact: true,
    },
    verdict: {
      sceneId: "verdict",
      eyebrow: videoFormat.verdictKicker,
      headline: <Highlight color={theme.accent}>{researchLabel}</Highlight>,
      supporting: "Educational market context. Comment the next ticker to risk-check.",
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
