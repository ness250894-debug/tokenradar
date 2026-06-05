import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { collectBackfillSocialPosts } from "../scripts/lib/social-ledger-backfill";

const tempDirs: string[] = [];

function makeTempDataDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-backfill-"));
  tempDirs.push(root);
  return root;
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

describe("social ledger backfill", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("collects daily, market-update, and video tracker records", () => {
    const dataDir = makeTempDataDir();

    writeJson(path.join(dataDir, "posted", "2026-05-16", "interactive-daily.json"), {
      postedAt: "2026-05-16T13:16:27.677Z",
      pollType: "sentiment",
      tweetId: "2055638509889683589",
      tokenId: "bitcoin",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-16", "bitcoin-x.json"), {
      postedAt: "2026-05-16T15:00:00.000Z",
      platform: "x",
      tweetId: "tweet-2",
      reason: "newly-published",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      xText: "$BTC needs confirmation before the move matters.",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-16", "daily-telegram-poll.json"), {
      postedAt: "2026-05-16T15:05:00.000Z",
      messageId: 42,
      theme: "Market Mood",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-16", "weekly-threads-recap.json"), {
      postedAt: "2026-05-16T16:00:00.000Z",
      postId: "threads-recap-1",
      tokenIds: ["one", "two", "three"],
    });
    writeJson(path.join(dataDir, "posted", "2026-05-16", "weekly-telegram-recap.json"), {
      postedAt: "2026-05-16T16:01:00.000Z",
      messageId: 84,
      tokenIds: ["one", "two", "three"],
    });
    writeJson(path.join(dataDir, "posted_video", "2026-05-16", "daily-video.json"), {
      tokenId: "avalanche-2",
      platforms: {
        tiktok: {
          postedAt: "2026-05-16T18:00:00.000Z",
          publishId: "publish-1",
          deliveryMode: "content-posting-api-inbox",
        },
      },
    });

    expect(collectBackfillSocialPosts(dataDir)).toEqual([
      expect.objectContaining({
        platform: "x",
        contentKey: "2026-05-16:interactive-poll",
        externalId: "2055638509889683589",
      }),
      expect.objectContaining({
        platform: "x",
        contentKey: "2026-05-16:market-update:bitcoin",
        externalId: "tweet-2",
        details: expect.objectContaining({
          archetypeKey: "risk_lab",
          hookFamily: "risk-first",
          ctaFamily: "name-invalidation",
          xText: "$BTC needs confirmation before the move matters.",
        }),
      }),
      expect.objectContaining({
        platform: "telegram",
        contentKey: "2026-05-16:telegram-poll",
        externalId: 42,
      }),
      expect.objectContaining({
        platform: "threads",
        contentKey: "2026-05-16:threads-weekly-recap",
        externalId: "threads-recap-1",
      }),
      expect.objectContaining({
        platform: "telegram",
        contentKey: "2026-05-16:telegram-weekly-recap",
        externalId: 84,
      }),
      expect.objectContaining({
        platform: "tiktok",
        contentKey: "2026-05-16:video:avalanche-2:tiktok",
        externalId: "publish-1",
      }),
    ]);
  });
});
