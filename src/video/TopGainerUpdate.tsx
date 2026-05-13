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

export const TopGainerUpdate: React.FC<TopGainerProps> = ({
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
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  // Act durations (in frames)
  const hookDuration = 3 * fps; // 90
  const revealDuration = 4 * fps; // 120
  const metricsDuration = 11 * fps; // 330
  const contextDuration = 7 * fps; // 210
  const verdictDuration = 5 * fps; // 150
  // Total: 900 frames = 30s
  const premountFrames = Math.floor(fps / 2);
  const fadeFrames = fps;
  const fadeOutStart = durationInFrames - fadeFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <VideoBackground priceChange24h={priceChange24h} riskScore={riskScore} verdict={verdict} />

      <Sequence from={0} durationInFrames={hookDuration}>
        <HookScreen text={hookText || "THIS TOKEN IS BREAKING OUT"} />
      </Sequence>

      <Sequence from={hookDuration} durationInFrames={revealDuration} premountFor={premountFrames}>
        <DataCard
          tokenName={tokenName}
          symbol={symbol}
          price={price}
          priceChange24h={priceChange24h}
          marketCapRank={marketCapRank}
          volume24h={volume24h}
        />
      </Sequence>

      <Sequence from={hookDuration + revealDuration} durationInFrames={metricsDuration} premountFor={premountFrames}>
        <MetricsView
          marketCap={marketCap}
          marketCapRank={marketCapRank}
          priceChange24h={priceChange24h}
          riskScore={riskScore}
          riskLevel={riskLevel}
          volume24h={volume24h}
          growthPotentialIndex={growthPotentialIndex}
        />
      </Sequence>

      <Sequence
        from={hookDuration + revealDuration + metricsDuration}
        durationInFrames={contextDuration}
        premountFor={premountFrames}
      >
        <ContextView
          contextText={contextText || "Strong social sentiment and increasing volume are driving this breakout."}
          priceChange24h={priceChange24h}
          marketCapRank={marketCapRank}
          volume24h={volume24h}
          riskScore={riskScore}
          riskLevel={riskLevel}
          growthPotentialIndex={growthPotentialIndex}
        />
      </Sequence>

      <Sequence
        from={hookDuration + revealDuration + metricsDuration + contextDuration}
        durationInFrames={verdictDuration}
        premountFor={premountFrames}
      >
        <VerdictBadge verdict={verdict || "BUY"} />
      </Sequence>

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
