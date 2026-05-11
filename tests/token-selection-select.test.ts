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

import { selectToken, type TokenData } from "../scripts/lib/token-selection";

const tempDirs: string[] = [];

function makeMetricsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-selection-"));
  tempDirs.push(dir);
  return path.join(dir, "metrics");
}

function token(id: string, priceChange24h = 0): TokenData {
  return {
    id,
    symbol: id.slice(0, 4).toUpperCase(),
    name: id,
    rank: 100,
    market: {
      price: 1,
      priceChange24h,
      marketCap: 10_000_000,
      marketCapRank: 100,
      volume24h: 1_000_000,
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe("selectToken cooldown behavior", () => {
  it("does not use recently posted tokens for spotlight fallback", async () => {
    const metricsDir = makeMetricsDir();
    fs.mkdirSync(metricsDir, { recursive: true });
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
});
