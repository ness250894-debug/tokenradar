import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { buildVideoCaptionCues, type VideoCaptionCue } from "../../lib/video-captioning";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";

export const TimedNarrationCaptions: React.FC<{
  text?: string;
  cues?: VideoCaptionCue[];
  reserveActionRail?: boolean;
}> = ({ text, cues: providedCues, reserveActionRail = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const durationSeconds = durationInFrames / fps;
  const cues = providedCues && providedCues.length > 0
    ? providedCues
    : buildVideoCaptionCues(text || "", durationSeconds);
  const currentSeconds = frame / fps;
  const activeCue = cues.find((cue) =>
    currentSeconds >= cue.startSeconds && currentSeconds < cue.endSeconds
  ) || cues.at(-1);

  if (!text?.trim() || !activeCue || currentSeconds < activeCue.startSeconds) return null;

  const words = activeCue.text.split(/\s+/).filter(Boolean);
  const cueDuration = Math.max(0.1, activeCue.endSeconds - activeCue.startSeconds);
  const cueProgress = Math.min(1, Math.max(0, (currentSeconds - activeCue.startSeconds) / cueDuration));
  const activeWordIdx = Math.min(words.length - 1, Math.floor(cueProgress * words.length));

  return (
    <div
      aria-label="Narration captions"
      style={{
        position: "absolute",
        left: SAFE_ZONES.horizontal,
        right: reserveActionRail ? SAFE_ZONES.actionRail : SAFE_ZONES.horizontal,
        bottom: SAFE_ZONES.narrationBottom,
        zIndex: 40,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 860,
          borderRadius: 20,
          padding: "16px 26px 18px",
          background: "rgba(10, 10, 11, 0.88)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: COLORS.text,
          fontFamily: FONTS.primary,
          fontSize: 44,
          fontWeight: 900,
          lineHeight: 1.18,
          textAlign: "center",
          textShadow: "0 3px 12px rgba(0,0,0,0.92)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 12px",
        }}
      >
        {words.map((word, idx) => {
          const isActive = idx === activeWordIdx;
          const isSpoken = idx < activeWordIdx;
          return (
            <span
              key={`${word}-${idx}`}
              style={{
                color: isActive ? "#FACC15" : isSpoken ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                textShadow: isActive ? "0 0 18px rgba(250, 204, 21, 0.8)" : "none",
                display: "inline-block",
                transition: "color 0.1s ease, transform 0.1s ease",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
