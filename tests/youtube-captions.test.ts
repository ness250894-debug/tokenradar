import { describe, expect, it } from "vitest";

import { buildWebVttCaptionTrack } from "../src/lib/youtube";

describe("YouTube caption tracks", () => {
  it("turns narration into timed, readable WebVTT cues", () => {
    const track = buildWebVttCaptionTrack(
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa.",
      10,
    );

    expect(track).toMatch(/^WEBVTT/);
    expect(track).toContain("00:00:00.000 --> 00:00:05.000");
    expect(track).toContain("Alpha beta gamma delta epsilon zeta eta");
    expect(track).toContain("00:00:05.000 --> 00:00:10.000");
    expect(track).toContain("theta iota kappa.");
  });

  it("removes markup and prevents cue injection", () => {
    const track = buildWebVttCaptionTrack("<b>Risk</b> --> context", 4);

    expect(track).toContain("Risk → context");
    expect(track).not.toContain("<b>");
    expect((track.match(/-->/g) || [])).toHaveLength(1);
  });

  it("carries rounded milliseconds into the next second", () => {
    const track = buildWebVttCaptionTrack("one two three four five six seven eight nine ten eleven twelve thirteen fourteen", 1.9998);

    expect(track).toContain("00:00:01.000 --> 00:00:02.000");
    expect(track).not.toMatch(/\.1000\b/);
  });
});
