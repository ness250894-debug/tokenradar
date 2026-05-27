import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/coingecko", () => ({
  fetchTokensByRank: vi.fn(async () => []),
  fetchTrendingCoins: vi.fn(async () => []),
}));

vi.mock("../src/lib/x-client", () => ({
  fetchXTrends: vi.fn(async () => []),
  matchTrendsToTokens: vi.fn(() => []),
}));

import {
  cleanupExpiredCooldownFolders,
  getAutomatedTrendSources,
  getTodayPostedTokens,
  getTokensPostedWithinDays,
  hasSocialImageSafeText,
  selectToken,
  type TokenData,
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
  it("keeps social image text within the bundled font coverage", () => {
    expect(hasSocialImageSafeText({ symbol: "SUI", name: "Sui" })).toBe(true);
    expect(hasSocialImageSafeText({ symbol: "币安人生", name: "币安人生 (BinanceLife)" })).toBe(false);
  });

  it("keeps automated X trend-chasing out of X-capable routes", () => {
    expect(getAutomatedTrendSources("x")).toEqual(["coingecko"]);
    expect(getAutomatedTrendSources("all")).toEqual(["coingecko"]);
    expect(getAutomatedTrendSources("telegram")).toEqual(["coingecko", "x"]);
  });

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
    writeJson(path.join(postedDir, "daily-instagram-movers.json"), {
      postedAt: "2026-05-04T00:05:00.000Z",
      movers: ["optimism", "arbitrum"],
    });
    writeJson(path.join(postedDir, "daily-threads-text.json"), {
      postedAt: "2026-05-04T16:00:00.000Z",
      tokenId: "aptos",
    });

    expect(getTodayPostedTokens(dataDir, "2026-05-04")).toEqual(
      new Set(["solana", "immutable-x", "pepe", "bonk", "jupiter-exchange-solana", "optimism", "arbitrum", "aptos"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "x")).toEqual(
      new Set(["solana", "immutable-x", "pepe", "optimism", "arbitrum", "aptos"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "telegram")).toEqual(
      new Set(["immutable-x", "bonk", "jupiter-exchange-solana", "optimism", "arbitrum", "aptos"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "instagram")).toEqual(
      new Set(["immutable-x", "optimism", "arbitrum"]),
    );
    expect(getTodayPostedTokens(dataDir, "2026-05-04", "threads")).toEqual(
      new Set(["immutable-x", "aptos"]),
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

describe("social token selection quality", () => {
  function token(overrides: Partial<TokenData> & Pick<TokenData, "id" | "symbol" | "name">): TokenData {
    const { market: marketOverrides, ...rest } = overrides;
    return {
      rank: 100,
      description: "",
      ...rest,
      market: {
        price: 1,
        priceChange24h: 0,
        marketCap: 10_000_000,
        marketCapRank: 100,
        volume24h: 100_000,
        ...marketOverrides,
      },
    };
  }

  it("skips newly published tokens with inert market data before posting", async () => {
    const rootDir = makeDataDir();
    const dataDir = path.join(rootDir, "data");
    const metricsDir = path.join(dataDir, "metrics");
    const contentDir = path.join(rootDir, "content", "tokens");
    fs.mkdirSync(metricsDir, { recursive: true });

    writeJson(path.join(contentDir, "thin-rwa", "overview.json"), {});
    writeJson(path.join(contentDir, "active-launch", "overview.json"), {});

    const weakNewlyPublished = token({
      id: "thin-rwa",
      name: "Thin RWA",
      symbol: "trwa",
      market: {
        price: 1.02,
        priceChange24h: 0.05,
        marketCap: 50_000_000,
        marketCapRank: 486,
        volume24h: 0,
      },
    });
    const activeNewlyPublished = token({
      id: "active-launch",
      name: "Active Launch",
      symbol: "act",
      market: {
        price: 2.5,
        priceChange24h: 3.2,
        marketCap: 25_000_000,
        marketCapRank: 220,
        volume24h: 750_000,
      },
    });

    const selection = await selectToken(
      [weakNewlyPublished, activeNewlyPublished],
      new Set(),
      new Set(),
      metricsDir,
      [
        { id: "thin-rwa", name: "Thin RWA", symbol: "trwa" },
        { id: "active-launch", name: "Active Launch", symbol: "act" },
      ],
      new Set(["thin-rwa", "active-launch"]),
      "all",
    );

    expect(selection).toMatchObject({
      reason: "newly-published",
      token: { id: "active-launch" },
    });
  });
});
