import { describe, expect, it } from "vitest";

import {
  buildVideoCaptionCues,
  estimateVoiceoverDuration,
  splitScriptIntoClauses,
} from "../src/lib/video-captioning";

describe("video captioning and clause splitting", () => {
  it("splits narration scripts into punchy clauses on punctuation boundaries", () => {
    const script = "Solana surged 14% today, outpacing the wider market. Volume crossed $3.2B; momentum remains high.";
    const clauses = splitScriptIntoClauses(script);

    expect(clauses.length).toBeGreaterThanOrEqual(3);
    expect(clauses[0]).toMatch(/Solana surged 14% today/i);
    expect(clauses.some((c) => c.includes("3.2B"))).toBe(true);
  });

  it("handles scripts with no internal punctuation cleanly", () => {
    const script = "Bitcoin moves higher into key resistance";
    const clauses = splitScriptIntoClauses(script);

    expect(clauses).toEqual(["Bitcoin moves higher into key resistance"]);
  });

  it("estimates voiceover duration at standard speaking cadence (~145 wpm)", () => {
    // 29 words at 145 wpm = (29 / 145) * 60 = 12 seconds at 1.0x speed
    const words29 = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty one twenty two twenty three twenty four twenty five";
    const estimated = estimateVoiceoverDuration(words29, 1.0);

    expect(estimated).toBeCloseTo(12.0, 1);
  });

  it("generates monotonically ordered caption cues matching total duration", () => {
    const script = "Solana surged 14% today, with volume crossing $3B. Risk check: score is 4.2 out of 10.";
    const totalDuration = 12.0;
    const cues = buildVideoCaptionCues(script, totalDuration);

    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues[0].startSeconds).toBe(0);
    expect(cues[cues.length - 1].endSeconds).toBeCloseTo(totalDuration, 1);

    for (let i = 0; i < cues.length - 1; i++) {
      expect(cues[i].endSeconds).toBeCloseTo(cues[i + 1].startSeconds, 2);
      expect(cues[i].text.length).toBeGreaterThan(0);
    }
  });
});
