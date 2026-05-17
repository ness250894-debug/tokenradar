import React from "react";
import {
  AbsoluteFill,
  AnimatedImage,
  Html5Video,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { VideoAssetLayer, VideoAssetStageSegment, VideoMediaStage } from "../../lib/video-assets";
import { resolveVideoAssetRenderSource } from "../../lib/video-assets";
import { resolveVideoVisualRecipe, type VideoVisualRecipe } from "../../lib/video-recipes";

function getObjectFit(fit: VideoAssetLayer["fit"]): React.CSSProperties["objectFit"] {
  if (fit === "contain") return "contain";
  if (fit === "fill") return "fill";
  return "cover";
}

function getLayerTransform(frame: number, index: number, visualRecipe?: VideoVisualRecipe): string {
  const recipe = resolveVideoVisualRecipe(visualRecipe);
  const drift = Math.sin((frame + index * 47) / 86) * 18;
  const lift = Math.cos((frame + index * 29) / 72) * 14;
  const zoomBase = recipe.motionPack === "snap_zoom" || recipe.motionPack === "rise_pop" ? 1.06 : 1.03;
  const zoom = interpolate(Math.sin((frame + index * 11) / 140), [-1, 1], [zoomBase, zoomBase + 0.035]);
  const rotate = recipe.motionPack === "ticker_push" || recipe.motionPack === "slide_cut"
    ? Math.sin((frame + index * 17) / 170) * 1.4
    : 0;

  return `translate3d(${drift}px, ${lift}px, 0) scale(${zoom}) rotate(${rotate}deg)`;
}

function getLayerStyle(
  asset: VideoAssetLayer,
  frame: number,
  index: number,
  visualRecipe?: VideoVisualRecipe,
  mediaStage: VideoMediaStage = "ambient",
): React.CSSProperties {
  const isPrimaryStage = mediaStage === "primary";
  const opacity = isPrimaryStage
    ? Math.max(asset.opacity ?? 0, index === 0 ? 0.96 : 0.12)
    : asset.opacity ?? 0.18;
  const inset = isPrimaryStage ? -74 : -44;
  const provider = asset.provider || "";
  const isGeneratedOverlay = isPrimaryStage && index > 0 && provider === "generated";

  return {
    position: "absolute",
    inset,
    width: `calc(100% + ${Math.abs(inset) * 2}px)`,
    height: `calc(100% + ${Math.abs(inset) * 2}px)`,
    objectFit: getObjectFit(asset.fit),
    opacity,
    mixBlendMode: isGeneratedOverlay ? "screen" : "normal",
    filter: `blur(${asset.blur ?? 0}px) saturate(${asset.saturation ?? 1}) contrast(${isPrimaryStage ? 1.05 : 1}) brightness(${isPrimaryStage ? 0.84 : 1})`,
    transform: getLayerTransform(frame, index, visualRecipe),
  };
}

export const MediaAssetLayer: React.FC<{
  assets?: VideoAssetLayer[];
  segments?: VideoAssetStageSegment[];
  visualRecipe?: VideoVisualRecipe;
  mediaStage?: VideoMediaStage;
}> = ({ assets = [], segments = [], visualRecipe, mediaStage = "ambient" }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  if (assets.length === 0 && segments.length === 0) return null;

  const renderAsset = (asset: VideoAssetLayer, index: number, localFrame: number, key: string) => {
    const src = resolveVideoAssetRenderSource(asset, staticFile);
    const style = getLayerStyle(asset, localFrame, index, visualRecipe, mediaStage);

    if (asset.kind === "video") {
      return (
        <Html5Video
          key={key}
          src={src}
          muted
          loop
          playbackRate={asset.playbackRate ?? 1}
          startFrom={Math.round((asset.startOffsetSeconds ?? 0) * fps)}
          style={style}
        />
      );
    }

    if (asset.kind === "animated") {
      return (
        <AnimatedImage
          key={key}
          src={src}
          width={width + 88}
          height={height + 88}
          fit={asset.fit ?? "cover"}
          playbackRate={asset.playbackRate ?? 1}
          style={style}
        />
      );
    }

    return <Img key={key} src={src} style={style} />;
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {segments.length > 0
        ? segments.map((segment, index) => (
          <Sequence
            key={`${segment.segmentId}:${segment.asset.id}`}
            from={Math.round(segment.fromSeconds * fps)}
            durationInFrames={Math.max(1, Math.round((segment.toSeconds - segment.fromSeconds) * fps))}
          >
            {renderAsset(segment.asset, index, frame, `${segment.segmentId}:${segment.asset.id}`)}
          </Sequence>
        ))
        : assets.map((asset, index) => renderAsset(asset, index, frame, asset.id))}
    </AbsoluteFill>
  );
};
