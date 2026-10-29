import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const coingeckoMocks = vi.hoisted(() => ({
  fetchTokensByRank: vi.fn(async () => []),
  fetchTrendingCoins: vi.fn(async () => []),
}));

vi.mock("../src/lib/coingecko", () => ({
  fetchTokensByRank: coingeckoMocks.fetchTokensByRank,
  fetchTrendingCoins: coingeckoMocks.fetchTrendingCoins,
}));

vi.mock("../src/lib/x-client", () => ({
  fetchXTrends: vi.fn(async () => []),
  matchTrendsToTokens: vi.fn(() => []),
}));

import {
  filterActiveVideoCandidates,
  getExactPlatformPostedTokensWithinDays,
  selectToken,
  type TokenData,
} from "../scripts/lib/token-selection";

const tempDirs: string[] = [];

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-selection-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "metrics"), { recursive: true });
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function token(
  id: string,
  priceChange24h = 0,
  overrides: Partial<TokenData["market"]> & { rank?: number } = {},
): TokenData {
  const { rank = 100, ...marketOverrides } = overrides;
  return {
    id,
    symbol: id.slice(0, 4).toUpperCase(),
    name: id,
    rank,
    market: {
      price: 1,
      priceChange24h,
      marketCap: 100_000_000,
      marketCapRank: rank,
      volume24h: 1_000_000,
      ...marketOverrides,
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe("selectToken cooldown and video breakout behavior", () => {
  it("does not use recently posted tokens for spotlight fallback", async () => {
    const dataDir = makeDataDir();
    const metricsDir = path.join(dataDir, "metrics");
    const recent = token("recent-spotlight", 0.5);

    const selection = await selectToken(
      [recent],
      new Set(),
      new Set([recent.id]),
      metricsDir,
      [{ id: recent.id, name: recent.name, symbol: recent.symbol }],
      new Set(),
      "x",
      false,
    );

    expect(selection).toBeNull();
  });

  it("filters active video candidates by |priceChange24h| >= 2.5% or turnover >= 4%", () => {
    const sleepy = token("sleepy-coin", 0.4, { volume24h: 800_000, marketCap: 100_000_000 });
    const breakout = token("midcap-breakout", 9.6, { rank: 142, volume24h: 2_000_000, marketCap: 100_000_000 });
    const selloff = token("sharp-selloff", -6.2, { rank: 118, volume24h: 2_000_000, marketCap: 100_000_000 });
    const highTurnover = token("turnover-spike", 0.9, { rank: 165, volume24h: 6_500_000, marketCap: 100_000_000 });

    const filtered = filterActiveVideoCandidates([sleepy, breakout, selloff, highTurnover]);
    expect(filtered.map((item) => item.id)).toEqual([
      "midcap-breakout",
      "sharp-selloff",
      "turnover-spike",
    ]);
  });

  it("reads exact single-platform posted tokens while ignoring multi-token roundups", () => {
    const dataDir = makeDataDir();
    const now = new Date("2026-08-24T18:00:00.000Z");

    writeJson(path.join(dataDir, "posted", "2026-08-24", "daily-instagram-movers.json"), {
      postedAt: "2026-08-24T12:00:00.000Z",
      movers: ["render-token", "bittensor", "kaspa"],
    });
    writeJson(path.join(dataDir, "posted", "2026-08-24", "daily-telegram-movers.json"), {
      postedAt: "2026-08-24T09:00:00.000Z",
      movers: ["pendle", "aerodrome-finance"],
    });
    writeJson(path.join(dataDir, "posted", "2026-08-23", "solana-x.json"), {
      postedAt: "2026-08-23T14:00:00.000Z",
      platform: "x",
    });
    writeJson(path.join(dataDir, "posted", "2026-08-22", "token-comparison-x.json"), {
      postedAt: "2026-08-22T14:00:00.000Z",
      tokenIds: ["arbitrum", "optimism"],
    });
    writeJson(path.join(dataDir, "posted", "2026-08-24", "daily-threads-text.json"), {
      postedAt: "2026-08-24T16:00:00.000Z",
      tokenId: "sui",
    });

    expect(getExactPlatformPostedTokensWithinDays(dataDir, 7, "youtube", now)).toEqual(new Set());
    expect(getExactPlatformPostedTokensWithinDays(dataDir, 7, "instagram", now)).toEqual(new Set());
    expect(getExactPlatformPostedTokensWithinDays(dataDir, 7, "x", now)).toEqual(
      new Set(["solana", "arbitrum", "optimism"]),
    );
    expect(getExactPlatformPostedTokensWithinDays(dataDir, 0, "threads", now)).toEqual(
      new Set(["sui"]),
    );
  });

  it("lets explicit video trendingCooldown pick CoinGecko #1 trending despite text roundup history", async () => {
    const dataDir = makeDataDir();
    const metricsDir = path.join(dataDir, "metrics");

    writeJson(path.join(dataDir, "posted", new Date().toISOString().slice(0, 10), "daily-telegram-movers.json"), {
      postedAt: new Date().toISOString(),
      movers: ["pendle"],
    });

    coingeckoMocks.fetchTrendingCoins.mockResolvedValueOnce([
      { id: "pendle", name: "Pendle", symbol: "PENDLE", score: 0 } as never,
    ]);

    const pendle = token("pendle", 11.4, { rank: 88, volume24h: 45_000_000 });
    const selection = await selectToken(
      [pendle],
      new Set(),
      new Set(),
      metricsDir,
      [{ id: pendle.id, name: pendle.name, symbol: pendle.symbol }],
      new Set(),
      "all",
      false,
      { trendingCooldown: new Set() },
    );

    expect(selection).toMatchObject({
      reason: "trending-coingecko",
      token: { id: "pendle" },
    });
  });

  it("selects high-magnitude selloffs or turnover spikes ahead of flat safe-play coins on red days", async () => {
    const dataDir = makeDataDir();
    const metricsDir = path.join(dataDir, "metrics");

    const flatSafe = token("flat-safe", -0.2, { volume24h: 800_000, marketCap: 100_000_000 });
    const sharpDrop = token("sharp-drop", -11.8, { rank: 135, volume24h: 12_000_000, marketCap: 100_000_000 });
    writeJson(path.join(metricsDir, "flat-safe.json"), {
      riskScore: 3,
      riskLevel: "low",
      growthPotentialIndex: 60,
    });

    const selection = await selectToken(
      [flatSafe, sharpDrop],
      new Set(),
      new Set(),
      metricsDir,
      [
        { id: flatSafe.id, name: flatSafe.name, symbol: flatSafe.symbol },
        { id: sharpDrop.id, name: sharpDrop.name, symbol: sharpDrop.symbol },
      ],
      new Set(),
      "all",
      false,
      { includeHighMagnitudeMovers: true },
    );

    expect(selection?.token.id).toBe("sharp-drop");
    expect(selection?.reason).toBe("volume-outlier");
  });
});
