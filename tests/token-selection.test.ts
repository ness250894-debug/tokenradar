import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupExpiredCooldownFolders,
  getTodayPostedTokens,
  getTokensPostedWithinDays,
} from "../scripts/lib/token-selection";

const tempDirs: string[] = [];

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-state-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("social posted token tracking", () => {
  it("reads token ids from platform and generic tracker payloads", () => {
    const dataDir = makeDataDir();
    const postedDir = path.join(dataDir, "posted", "2026-05-04");

    writeJson(path.join(postedDir, "solana-x.json"), {
      postedAt: "2026-05-04T03:00:00.000Z",
      platform: "x",
    });
    writeJson(path.join(postedDir, "immutable-x.json"), {
      postedAt: "2026-05-04T06:00:00.000Z",
    });
    writeJson(path.join(postedDir, "interactive-daily.json"), {
      postedAt: "2026-05-04T12:00:00.000Z",
      tokenId: "pepe",
    });
    writeJson(path.join(postedDir, "daily-telegram-movers.json"), {
      postedAt: "2026-05-04T21:00:00.000Z",
      movers: ["bonk", "jupiter-exchange-solana"],
    });
    writeJson(path.join(postedDir, "daily-telegram-poll.json"), {
      postedAt: "2026-05-04T15:00:00.000Z",
      question: "Market mood?",
    });

    expect(getTodayPostedTokens(dataDir, "2026-05-04")).toEqual(
      new Set(["solana", "immutable-x", "pepe", "bonk", "jupiter-exchange-solana"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "x")).toEqual(
      new Set(["solana", "immutable-x", "pepe"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "telegram")).toEqual(
      new Set(["immutable-x", "bonk", "jupiter-exchange-solana"]),
    );
  });

  it("uses whole UTC date keys for cooldown windows", () => {
    const dataDir = makeDataDir();

    writeJson(path.join(dataDir, "posted", "2026-04-03", "old-token.json"), {
      postedAt: "2026-04-03T23:00:00.000Z",
    });
    writeJson(path.join(dataDir, "posted", "2026-04-04", "cutoff-token.json"), {
      postedAt: "2026-04-04T00:01:00.000Z",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-04", "today-token.json"), {
      postedAt: "2026-05-04T12:00:00.000Z",
    });

    const posted = getTokensPostedWithinDays(dataDir, 30, undefined, new Date("2026-05-04T23:30:00.000Z"));

    expect(posted).toEqual(new Set(["cutoff-token", "today-token"]));
  });

  it("removes expired posted and video cooldown date folders", () => {
    const dataDir = makeDataDir();

    writeJson(path.join(dataDir, "posted", "2026-04-03", "old-token.json"), {});
    writeJson(path.join(dataDir, "posted", "2026-04-04", "cutoff-token.json"), {});
    writeJson(path.join(dataDir, "posted", "2026-05-04", "today-token.json"), {});

    writeJson(path.join(dataDir, "posted_video", "2026-04-26", "old-video.json"), {});
    writeJson(path.join(dataDir, "posted_video", "2026-04-27", "cutoff-video.json"), {});
    writeJson(path.join(dataDir, "posted_video", "2026-05-04", "today-video.json"), {});

    const removed = cleanupExpiredCooldownFolders(dataDir, {
      now: new Date("2026-05-04T12:00:00.000Z"),
      postedRetentionDays: 30,
      videoRetentionDays: 7,
    });

    expect(removed).toEqual({
      posted: ["2026-04-03"],
      postedVideo: ["2026-04-26"],
    });
    expect(fs.existsSync(path.join(dataDir, "posted", "2026-04-03"))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "posted", "2026-04-04"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "posted_video", "2026-04-26"))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "posted_video", "2026-04-27"))).toBe(true);
  });
});
