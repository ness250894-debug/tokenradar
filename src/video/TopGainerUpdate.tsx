import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { TopGainerProps } from "./Root";
import { COLORS } from "./styles";
import { HookScreen } from "./components/HookScreen";
import { DataCard } from "./components/DataCard";
import { MetricsView } from "./components/MetricsView";
import { ContextView } from "./components/ContextView";
import { VerdictBadge } from "./components/VerdictBadge";
import { VideoBackground } from "./components/VideoBackground";
import { BrollStoryOverlay } from "./components/BrollStoryOverlay";
import { getVideoFormat } from "../lib/video-formats";
import {
  getVideoSceneDurations,
  resolveVideoVisualRecipe,
  type VideoSceneId,
} from "../lib/video-recipes";

if (typeof document !== "undefined" && !document.getElementById("tokenradar-video-fonts")) {
  const style = document.createElement("style");
  style.id = "tokenradar-video-fonts";
  style.textContent = `
@font-face {
  font-family: "Inter";
  src: url("${staticFile("fonts/inter-latin-normal.woff2")}") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
`;
  document.head.appendChild(style);
}

export const TopGainerUpdate: React.FC<TopGainerProps> = (props) => {
  const {
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
    audioFile,
    audioStartSeconds = 0,
    hookText,
    verdict,
    contextText,
    videoFormatKey,
    videoThesis,
    visualRecipe: inputVisualRecipe,
    mediaAssets,
    mediaSegments,
    mediaStage = "ambient",
  } = props;
  const { durationInFrames, fps } = useVideoConfig();
  const videoFormat = getVideoFormat(videoFormatKey);
  const visualRecipe = resolveVideoVisualRecipe(inputVisualRecipe);
  const sceneDurations = getVideoSceneDurations(visualRecipe);
  const premountFrames = 15;
  const fadeFrames = 30;
  const fadeOutStart = durationInFrames - fadeFrames;
  const isPrimaryMediaStory = mediaStage === "primary";

  const scenes: Record<VideoSceneId, React.ReactNode> = {
    hook: (
      <HookScreen
        text={hookText || "THIS TOKEN NEEDS PROOF"}
        eyebrow={videoFormat.openingEyebrow}
        subline={videoFormat.hookSubline}
        visualRecipe={visualRecipe}
      />
    ),
    reveal: (
      <DataCard
        tokenName={tokenName}
        symbol={symbol}
        price={price}
        priceChange24h={priceChange24h}
        marketCapRank={marketCapRank}
        volume24h={volume24h}
        sceneLabel={videoFormat.revealLabel}
        visualRecipe={visualRecipe}
      />
    ),
    metrics: (
      <MetricsView
        marketCap={marketCap}
        marketCapRank={marketCapRank}
        priceChange24h={priceChange24h}
        riskScore={riskScore}
        riskLevel={riskLevel}
        volume24h={volume24h}
        growthPotentialIndex={growthPotentialIndex}
        metricOrder={videoFormat.metricOrder}
        summaryTitle={videoFormat.summaryTitle}
        summaryLead={videoFormat.summaryLead}
        visualRecipe={visualRecipe}
      />
    ),
    context: (
      <ContextView
        contextText={videoThesis || contextText || "Strong social sentiment and increasing volume are driving this breakout."}
        title={videoFormat.contextTitle}
        formatLead={videoFormat.contextLead}
        priceChange24h={priceChange24h}
        marketCapRank={marketCapRank}
        volume24h={volume24h}
        riskScore={riskScore}
        riskLevel={riskLevel}
        growthPotentialIndex={growthPotentialIndex}
        visualRecipe={visualRecipe}
      />
    ),
    verdict: (
      <VerdictBadge
        verdict={verdict || "POSITIVE DATA"}
        kicker={videoFormat.verdictKicker}
        labelOverride={videoFormat.signalLabel}
        visualRecipe={visualRecipe}
      />
    ),
  };

  const orderedSequences = visualRecipe.sceneOrder.map((sceneId, index) => {
    const from = visualRecipe.sceneOrder
      .slice(0, index)
      .reduce((total, priorScene) => total + sceneDurations[priorScene], 0);
    const duration = sceneDurations[sceneId];
    return (
      <Sequence key={sceneId} from={from} durationInFrames={duration} premountFor={sceneId === "hook" ? 0 : premountFrames}>
        {scenes[sceneId]}
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <VideoBackground
        priceChange24h={priceChange24h}
        riskScore={riskScore}
        verdict={verdict}
        visualRecipe={visualRecipe}
        mediaAssets={mediaAssets}
        mediaSegments={mediaSegments}
        mediaStage={mediaStage}
      />
      {isPrimaryMediaStory ? <BrollStoryOverlay {...props} mediaStage={mediaStage} /> : orderedSequences}

      {audioFile && (
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          startFrom={audioStartSeconds * fps}
          loop
          volume={(f) => {
            if (f < fadeFrames) return f / fadeFrames;
            if (f > fadeOutStart) return Math.max(0, (durationInFrames - f) / fadeFrames);
            return 1;
          }}
        />
      )}
    </AbsoluteFill>
  );
};
