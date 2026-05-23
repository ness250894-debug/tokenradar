import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TopGainerProps } from "./Root";
import { COLORS, FONTS } from "./styles";
import { MediaAssetLayer } from "./components/MediaAssetLayer";
import {
  buildTikTokInVideoScenePlan,
  type TikTokScenePlanItem,
  type TikTokSceneTone,
} from "../lib/tiktok-scene-planner";
import { resolveVideoVisualRecipe } from "../lib/video-recipes";

if (typeof document !== "undefined" && !document.getElementById("tokenradar-tiktok-fonts")) {
  const style = document.createElement("style");
  style.id = "tokenradar-tiktok-fonts";
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

interface NativeBeat extends TikTokScenePlanItem {
  accent: string;
  noteTone: TikTokSceneTone;
}

function getAccentColor(priceChange24h: number, riskScore: number): string {
  if (riskScore >= 7) return COLORS.negative;
  if (priceChange24h < 0) return "#38BDF8";
  if (riskScore >= 4) return COLORS.warning;
  return COLORS.positive;
}

function buildNativeBeats(props: TopGainerProps, durationSeconds: number): NativeBeat[] {
  const accent = getAccentColor(props.priceChange24h, props.riskScore);
  const warning = props.riskScore >= 7 ? COLORS.negative : COLORS.warning;

  const plan = props.tiktokScenePlan || buildTikTokInVideoScenePlan({
    tokenName: props.tokenName,
    symbol: props.symbol,
    priceChange24h: props.priceChange24h,
    riskScore: props.riskScore,
    volume24h: props.volume24h,
    contextText: props.contextText,
    videoThesis: props.videoThesis,
    durationSeconds,
    seedParts: [props.videoFormatKey, props.hookText, props.visualRecipe?.key],
  });

  return plan.scenes.map((scene) => ({
    ...scene,
    accent: scene.intent === "breakpoint" ? warning : accent,
    noteTone: scene.tone,
  }));
}

function getBeatFrames(
  beats: NativeBeat[],
  fps: number,
  durationInFrames: number,
): Array<{ from: number; duration: number }> {
  return beats.map((beat) => {
    const from = Math.max(0, Math.min(durationInFrames - 1, Math.round(beat.fromSeconds * fps)));
    const to = Math.max(from + 1, Math.min(durationInFrames, Math.round(beat.toSeconds * fps)));
    return { from, duration: to - from };
  });
}

const GeneratedVerticalBackdrop: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame % 180, [0, 180], [-120, 120]);
  const sweep = interpolate(frame % 150, [0, 150], [-240, 2050]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050508",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -120,
          background: [
            `linear-gradient(135deg, ${accent}24 0%, transparent 30%, rgba(255,255,255,0.08) 55%, transparent 75%)`,
            "linear-gradient(180deg, #050508 0%, #121018 52%, #050508 100%)",
          ].join(", "),
          transform: `translateX(${drift}px) scale(1.08)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 76,
          right: 76,
          top: 210,
          bottom: 210,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          opacity: 0.18,
        }}
      >
        {Array.from({ length: 28 }).map((_, index) => (
          <div
            key={index}
            style={{
              height: 92 + ((index * 31 + frame) % 210),
              alignSelf: "end",
              borderRadius: 6,
              background: index % 5 === 0 ? COLORS.negative : index % 3 === 0 ? COLORS.warning : accent,
              opacity: 0.25 + ((index * 17 + frame) % 60) / 180,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: -140,
          right: -140,
          top: sweep,
          height: 220,
          background: `linear-gradient(180deg, transparent, ${accent}38, transparent)`,
          transform: "rotate(-8deg)",
        }}
      />
    </AbsoluteFill>
  );
};

function getNoteStyle(tone: NativeBeat["noteTone"], accent: string): React.CSSProperties {
  if (tone === "green") return { background: "#DCFCE7", color: "#052E1A", borderColor: "#86EFAC" };
  if (tone === "amber") return { background: "#FEF3C7", color: "#3F2500", borderColor: "#FACC15" };
  if (tone === "red") return { background: "#FFE4E6", color: "#4C0519", borderColor: "#FDA4AF" };
  if (tone === "blue") return { background: "#DBEAFE", color: "#082F49", borderColor: "#7DD3FC" };
  return { background: "#F8FAFC", color: "#111827", borderColor: `${accent}55` };
}

const CommentCard: React.FC<{ prompt: string; accent: string }> = ({ prompt, accent }) => (
  <div
    style={{
      position: "absolute",
      left: 62,
      right: 62,
      top: 92,
      minHeight: 134,
      borderRadius: 30,
      padding: "22px 28px",
      display: "flex",
      gap: 18,
      alignItems: "center",
      background: "rgba(255,255,255,0.94)",
      boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
      fontFamily: FONTS.primary,
    }}
  >
    <div
      style={{
        width: 58,
        height: 58,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: accent,
        color: "#041014",
        fontSize: 28,
        fontWeight: 950,
      }}
    >
      ?
    </div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          color: "#6B7280",
          fontSize: 22,
          lineHeight: 1,
          fontWeight: 850,
          marginBottom: 10,
        }}
      >
        replying to comment
      </div>
      <div
        style={{
          color: "#111827",
          fontSize: 34,
          lineHeight: 1.08,
          fontWeight: 950,
          letterSpacing: 0,
        }}
      >
        {prompt}
      </div>
    </div>
  </div>
);

const NativeBeatCaption: React.FC<{ beat: NativeBeat; durationInFrames: number }> = ({
  beat,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const enterEnd = Math.min(12, Math.floor(durationInFrames * 0.2));
  const exitStart = Math.max(enterEnd + 1, durationInFrames - 12);
  const opacity = interpolate(frame, [0, enterEnd, exitStart, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, enterEnd, exitStart, durationInFrames], [34, 0, 0, -18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, enterEnd], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const noteStyle = getNoteStyle(beat.noteTone, beat.accent);
  const isClosing = beat.intent === "watch_next";
  const noteRotation = beat.intent === "pattern_interrupt" || beat.intent === "breakpoint" ? "-3deg" : "2deg";

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${y}px) scale(${scale})` }}>
      <CommentCard prompt={beat.prompt} accent={beat.accent} />
      <div
        style={{
          position: "absolute",
          left: isClosing ? 92 : 68,
          right: isClosing ? 92 : 210,
          bottom: isClosing ? 250 : 286,
          fontFamily: FONTS.primary,
          color: COLORS.text,
        }}
      >
        <div
          style={{
            display: "inline-block",
            maxWidth: 810,
            borderRadius: 22,
            padding: "18px 24px 22px",
            background: "rgba(0,0,0,0.72)",
            border: "1px solid rgba(255,255,255,0.16)",
            fontSize: 52,
            lineHeight: 1.08,
            fontWeight: 950,
            letterSpacing: 0,
            overflowWrap: "break-word",
            textWrap: "balance",
            textShadow: "0 4px 18px rgba(0,0,0,0.86)",
          }}
        >
          {beat.subtitle}
        </div>
        <div
          style={{
            position: "absolute",
            right: isClosing ? 20 : -118,
            top: isClosing ? -170 : -112,
            maxWidth: isClosing ? 560 : 330,
            borderRadius: 10,
            padding: "18px 20px",
            background: noteStyle.background,
            border: `2px solid ${noteStyle.borderColor}`,
            color: noteStyle.color,
            fontSize: isClosing ? 26 : 30,
            lineHeight: 1.08,
            fontWeight: 950,
            boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
            transform: `rotate(${noteRotation})`,
          }}
        >
          {beat.note}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const TikTokNativeStory: React.FC<TopGainerProps> = (props) => {
  const {
    priceChange24h,
    riskScore,
    audioFile,
    audioStartSeconds = 0,
    voiceoverFile,
    mediaAssets,
    mediaSegments,
    visualRecipe: inputVisualRecipe,
  } = props;
  const { durationInFrames, fps } = useVideoConfig();
  const visualRecipe = resolveVideoVisualRecipe(inputVisualRecipe);
  const accent = getAccentColor(priceChange24h, riskScore);
  const beats = buildNativeBeats(props, durationInFrames / fps);
  const beatFrames = getBeatFrames(beats, fps, durationInFrames);
  const hasMedia = Boolean(mediaSegments?.length || mediaAssets?.length);
  const fadeFrames = 30;
  const fadeOutStart = durationInFrames - fadeFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050508", overflow: "hidden" }}>
      {hasMedia ? (
        <MediaAssetLayer
          assets={mediaAssets}
          segments={mediaSegments}
          visualRecipe={visualRecipe}
          mediaStage="primary"
        />
      ) : (
        <GeneratedVerticalBackdrop accent={accent} />
      )}
      <AbsoluteFill
        style={{
          background: [
            "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.14) 28%, rgba(0,0,0,0.26) 62%, rgba(0,0,0,0.82) 100%)",
            "linear-gradient(90deg, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.08) 46%, rgba(0,0,0,0.5) 100%)",
          ].join(", "),
        }}
      />
      {beats.map((beat, index) => {
        const timing = beatFrames[index] || { from: 0, duration: durationInFrames };
        return (
          <Sequence key={beat.id} from={timing.from} durationInFrames={timing.duration}>
            <NativeBeatCaption beat={beat} durationInFrames={timing.duration} />
          </Sequence>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 68,
          right: 68,
          bottom: 70,
          height: 68,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          background: "rgba(0,0,0,0.48)",
          border: "1px solid rgba(255,255,255,0.22)",
          color: "rgba(255,255,255,0.84)",
          fontFamily: FONTS.primary,
          fontSize: 23,
          fontWeight: 850,
          textShadow: "0 3px 12px rgba(0,0,0,0.8)",
        }}
      >
        market context only - no trade instructions
      </div>

      {audioFile && (
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          startFrom={audioStartSeconds * fps}
          loop
          volume={(f) => {
            const voiceoverDucking = voiceoverFile ? 0.18 : 0.86;
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
