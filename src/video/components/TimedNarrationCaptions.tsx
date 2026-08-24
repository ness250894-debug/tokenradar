import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { buildVideoCaptionCues } from "../../lib/video-captioning";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";

export const TimedNarrationCaptions: React.FC<{
  text?: string;
  reserveActionRail?: boolean;
}> = ({ text, reserveActionRail = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const durationSeconds = durationInFrames / fps;
  const cues = buildVideoCaptionCues(text || "", durationSeconds);
  const currentSeconds = frame / fps;
  const activeCue = cues.find((cue) =>
    currentSeconds >= cue.startSeconds && currentSeconds < cue.endSeconds
  ) || cues.at(-1);

  if (!text?.trim() || !activeCue || currentSeconds < activeCue.startSeconds) return null;

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
          maxWidth: 820,
          borderRadius: 18,
          padding: "14px 22px 16px",
          background: "rgba(0,0,0,0.86)",
          border: "1px solid rgba(255,255,255,0.22)",
          color: COLORS.text,
          fontFamily: FONTS.primary,
          fontSize: 42,
          fontWeight: 900,
          lineHeight: 1.12,
          textAlign: "center",
          textShadow: "0 3px 12px rgba(0,0,0,0.92)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        }}
      >
        {activeCue.text}
      </div>
    </div>
  );
};
