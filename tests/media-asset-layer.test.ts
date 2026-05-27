import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async () => {
  const ReactModule = await import("react");
  const makeElement = (tag: string) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement(tag, props, children);

  return {
    AbsoluteFill: makeElement("div"),
    AnimatedImage: makeElement("animated-image"),
    Html5Video: makeElement("html5-video"),
    Img: makeElement("img"),
    OffthreadVideo: makeElement("offthread-video"),
    Sequence: makeElement("sequence"),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    staticFile: (src: string) => `/public/${src}`,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30 }),
  };
});

import { MediaAssetLayer } from "../src/video/components/MediaAssetLayer";

describe("MediaAssetLayer", () => {
  it("renders local video b-roll with OffthreadVideo for Remotion renders", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MediaAssetLayer, {
        mediaStage: "primary",
        assets: [
          {
            id: "local-broll",
            kind: "video",
            source: "local",
            src: "broll/market.mp4",
            fit: "cover",
            role: "background",
            opacity: 1,
          },
        ],
      }),
    );

    expect(markup).toContain("<offthread-video");
    expect(markup).toContain("/public/broll/market.mp4");
    expect(markup).not.toContain("<html5-video");
  });
});
