import { describe, expect, it } from "vitest";

import {
  recordTikTokManualCompletion,
  validateTikTokManualCompletionInput,
} from "../src/lib/tiktok-manual-completion";

describe("TikTok manual completion tracking", () => {
  it("requires an operator and a TikTok URL or post id", () => {
    expect(validateTikTokManualCompletionInput({ operator: "", tiktokUrl: "" })).toEqual([
      "operator-required",
      "tiktok-url-or-post-id-required",
    ]);
    expect(validateTikTokManualCompletionInput({
      operator: "Pavlo",
      tiktokUrl: "https://example.com/not-a-tiktok-post",
    })).toContain("tiktok-url-invalid");
  });

  it("marks a manual handoff as manually published without disturbing other platforms", () => {
    const tracker = {
      postedAt: "2026-05-18T18:00:00.000Z",
      tokenId: "solana",
      tokenName: "Solana",
      reason: "spotlight",
      platform: "shorts",
      platforms: {
        youtube: {
          postedAt: "2026-05-18T18:02:00.000Z",
          status: "published",
          videoId: "yt-1",
        },
        tiktok: {
          postedAt: "2026-05-18T18:03:00.000Z",
          status: "manual_handoff_sent",
          reportVideoMessageId: 100,
        },
      },
    };

    const updated = recordTikTokManualCompletion(tracker, {
      operator: "Pavlo",
      publishedAt: "2026-05-18T19:00:00.000Z",
      tiktokUrl: "https://www.tiktok.com/@tokenradarco/video/123",
    });

    expect(updated.platforms.youtube).toEqual(tracker.platforms.youtube);
    expect(updated.platforms.tiktok).toMatchObject({
      status: "manual_published",
      manualPublishedAt: "2026-05-18T19:00:00.000Z",
      tiktokUrl: "https://www.tiktok.com/@tokenradarco/video/123",
      humanOperator: "Pavlo",
    });
  });
});
