import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { TopGainerProps } from "./Root";
import { COLORS } from "./styles";
import { HookScreen } from "./components/HookScreen";
import { DataCard } from "./components/DataCard";
import { MetricsView } from "./components/MetricsView";
import { ContextView } from "./components/ContextView";
import { VerdictBadge } from "./components/VerdictBadge";
import { VideoBackground } from "./components/VideoBackground";

// Keep Remotion render startup fast by loading only the weights used by the video.
loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin"],
});

export const TopGainerUpdate: React.FC<TopGainerProps> = ({
  tokenName,
  symbol,
  price,
  priceChange24h,
  riskScore,
  marketCap,
  audioFile,
  audioStartSeconds = 0,
  hookText,
  verdict,
  contextText,
}) => {
  const { fps } = useVideoConfig();
  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    // Wait for custom fonts to be ready before rendering
    document.fonts.ready.then(() => setFontLoaded(true));
  }, []);

  if (!fontLoaded) {
    return null; // Don't render until fonts load to avoid FOUT
  }

  // Act durations (in frames)
  const hookDuration = 8 * fps; // 240
  const revealDuration = 12 * fps; // 360
  const metricsDuration = 15 * fps; // 450
  const contextDuration = 15 * fps; // 450
  const verdictDuration = 10 * fps; // 300
  // Total: 1800 frames = 60s

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <VideoBackground priceChange24h={priceChange24h} riskScore={riskScore} verdict={verdict} />

      <Sequence from={0} durationInFrames={hookDuration}>
        <HookScreen text={hookText || "THIS TOKEN IS BREAKING OUT"} />
      </Sequence>

      <Sequence from={hookDuration} durationInFrames={revealDuration} premountFor={30}>
        <DataCard
          tokenName={tokenName}
          symbol={symbol}
          price={price}
          priceChange24h={priceChange24h}
        />
      </Sequence>

      <Sequence from={hookDuration + revealDuration} durationInFrames={metricsDuration} premountFor={30}>
        <MetricsView marketCap={marketCap} riskScore={riskScore} />
      </Sequence>

      <Sequence
        from={hookDuration + revealDuration + metricsDuration}
        durationInFrames={contextDuration}
        premountFor={30}
      >
        <ContextView contextText={contextText || "Strong social sentiment and increasing volume are driving this breakout."} />
      </Sequence>

      <Sequence
        from={hookDuration + revealDuration + metricsDuration + contextDuration}
        durationInFrames={verdictDuration}
        premountFor={30}
      >
        <VerdictBadge verdict={verdict || "BUY"} />
      </Sequence>

      {audioFile && (
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          startFrom={audioStartSeconds * fps}
          loop
          volume={(f) => {
            // Fade in at the very beginning (0-30 frames)
            if (f < 30) return f / 30;
            // Fade out at the very end (1770-1800 frames)
            if (f > 1770) return (1800 - f) / 30;
            return 1;
          }}
        />
      )}
    </AbsoluteFill>
  );
};
