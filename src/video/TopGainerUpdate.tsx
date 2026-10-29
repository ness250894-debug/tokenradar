import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { TopGainerProps } from "./Root";
import { COLORS, getVerdict } from "./styles";
import { HookScreen } from "./components/HookScreen";
import { DataCard } from "./components/DataCard";
import { MetricsView } from "./components/MetricsView";
import { ContextView } from "./components/ContextView";
import { VerdictBadge } from "./components/VerdictBadge";
import { VideoBackground } from "./components/VideoBackground";
import { BrollStoryOverlay } from "./components/BrollStoryOverlay";
import { TimedNarrationCaptions } from "./components/TimedNarrationCaptions";
import { VideoSourceBadge } from "./components/VideoSourceBadge";
import { selectVideoDataTension } from "../lib/video-evidence";
import { getVideoFormat } from "../lib/video-formats";
import {
  getVideoSceneDurationsForTotalFrames,
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
    fdv,
    athChangePercentage,
    high24h,
    low24h,
    tokenIconDataUrl,
    sparklinePrices,
    audioFile,
    audioStartSeconds = 0,
    voiceoverFile,
    voiceoverScript,
    marketDataSource,
    marketDataAsOf,
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
  const sceneDurations = getVideoSceneDurationsForTotalFrames(visualRecipe, durationInFrames);
  const dataTension = selectVideoDataTension({
    tokenName,
    symbol,
    price,
    priceChange24h,
    volume24h,
    marketCap,
    marketCapRank,
    riskScore,
    growthPotentialIndex,
    fdv,
    athChangePercentage,
    formatKey: videoFormat.key,
    allowDerivedContext: true,
    marketDataSource,
    marketDataAsOf,
  });
  const resolvedVerdict = verdict || getVerdict(riskScore, priceChange24h, {
    volume24h,
    marketCap,
    fdv,
    athChangePercentage,
  });
  const premountFrames = 15;
  const fadeFrames = 30;
  const fadeOutStart = durationInFrames - fadeFrames;
  const isPrimaryMediaStory = mediaStage === "primary";

  const scenes: Record<VideoSceneId, React.ReactNode> = {
    hook: (
      <HookScreen
        text={hookText || dataTension.hookText}
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
        high24h={high24h}
        low24h={low24h}
        tokenIconDataUrl={tokenIconDataUrl}
        sparklinePrices={sparklinePrices}
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
        contextText={videoThesis || contextText || dataTension.thesis}
        title={videoFormat.contextTitle}
        formatLead={videoFormat.contextLead}
        tensionBullets={dataTension.bullets}
        takeaway={dataTension.takeaway}
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
        verdict={resolvedVerdict}
        kicker={dataTension.verdictKicker || videoFormat.verdictKicker}
        labelOverride={dataTension.verdictLabel || videoFormat.signalLabel}
        subLabel={dataTension.verdictSubLabel}
        visualRecipe={visualRecipe}
      />
    ),
  };

  const sfxSequences = visualRecipe.sceneOrder.map((sceneId, index) => {
    if (index === 0) return null;
    const from = visualRecipe.sceneOrder
      .slice(0, index)
      .reduce((total, priorScene) => total + sceneDurations[priorScene], 0);

    const sfxFile = sceneId === "verdict" ? "reveal.wav" : sceneId === "metrics" ? "tick.wav" : "whoosh.wav";
    const volume = sceneId === "verdict" ? 0.38 : sceneId === "metrics" ? 0.25 : 0.32;

    return (
      <Sequence key={`sfx-${sceneId}-${index}`} from={from} durationInFrames={20}>
        <Audio src={staticFile(`sfx/${sfxFile}`)} volume={volume} />
      </Sequence>
    );
  });

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
        verdict={resolvedVerdict}
        visualRecipe={visualRecipe}
        mediaAssets={mediaAssets}
        mediaSegments={mediaSegments}
        mediaStage={mediaStage}
      />
      {isPrimaryMediaStory ? <BrollStoryOverlay {...props} mediaStage={mediaStage} /> : orderedSequences}
      {sfxSequences}
      <TimedNarrationCaptions text={voiceoverScript} cues={props.captionCues} />
      <VideoSourceBadge
        tokenName={tokenName}
        symbol={symbol}
        marketDataSource={marketDataSource}
        marketDataAsOf={marketDataAsOf}
      />

      {audioFile && (
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          startFrom={audioStartSeconds * fps}
          loop
          volume={(f) => {
            const voiceoverDucking = voiceoverFile ? 0.22 : 1;
            if (f < fadeFrames) return (f / fadeFrames) * voiceoverDucking;
            if (f > fadeOutStart) return Math.max(0, (durationInFrames - f) / fadeFrames) * voiceoverDucking;
            return voiceoverDucking;
          }}
        />
      )}
      {voiceoverFile && (
        <Audio
          src={staticFile(`voiceover/${voiceoverFile}`)}
          volume={(f) => {
            if (f < 10) return f / 10;
            if (f > durationInFrames - 18) return Math.max(0, (durationInFrames - f) / 18);
            return 1;
          }}
        />
      )}
    </AbsoluteFill>
  );
};
