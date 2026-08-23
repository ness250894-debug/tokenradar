import { describe, expect, it } from "vitest";

import {
  buildTelegramWeeklyRecap,
  buildWeeklyThreadsRecap,
  selectWeeklyRecapTokens,
  type WeeklyRecapToken,
} from "../scripts/lib/threads-recap";

function token(overrides: Partial<WeeklyRecapToken> & Pick<WeeklyRecapToken, "id" | "symbol" | "name">): WeeklyRecapToken {
  const { market: marketOverrides, ...rest } = overrides;
  return {
    ...rest,
    market: {
      priceChange7d: 0,
      priceChange24h: 0,
      marketCap: 100_000_000,
      marketCapRank: 100,
      volume24h: 1_000_000,
      ...marketOverrides,
    },
  };
}

describe("Threads weekly recap", () => {
  it("selects weekly leaders, pullbacks, and liquidity context from eligible tokens", () => {
    const selection = selectWeeklyRecapTokens([
      token({ id: "thin", symbol: "THIN", name: "Thin", market: { priceChange7d: 500, volume24h: 10 } }),
      token({ id: "stale", symbol: "STALE", name: "Stale", marketDataSource: "local-cache", market: { priceChange7d: 24, volume24h: 5_000_000 } }),
      token({ id: "outlier", symbol: "OUT", name: "Outlier", market: { priceChange7d: 900, volume24h: 5_000_000 } }),
      token({ id: "one", symbol: "ONE", name: "One", market: { priceChange7d: 22.4, volume24h: 2_000_000 } }),
      token({ id: "two", symbol: "TWO", name: "Two", market: { priceChange7d: 18.2, volume24h: 3_000_000 } }),
      token({ id: "three", symbol: "THREE", name: "Three", market: { priceChange7d: 14.1, volume24h: 4_000_000 } }),
      token({ id: "red", symbol: "RED", name: "Red", market: { priceChange7d: -11.2, volume24h: 5_000_000 } }),
      token({ id: "liquid", symbol: "LIQ", name: "Liquid", market: { priceChange7d: 1.1, volume24h: 50_000_000 } }),
    ]);

    expect(selection.leaders.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(selection.pullback?.id).toBe("red");
    expect(selection.volumeLeader?.id).toBe("liquid");
  });

  it("builds a Threads-native recap within the platform text limit", () => {
    const recap = buildWeeklyThreadsRecap({
      leaders: [
        token({ id: "one", symbol: "ONE", name: "One", market: { priceChange7d: 22.4 } }),
        token({ id: "two", symbol: "TWO", name: "Two", market: { priceChange7d: 18.2 } }),
        token({ id: "three", symbol: "THREE", name: "Three", market: { priceChange7d: 14.1 } }),
      ],
      pullback: token({ id: "red", symbol: "RED", name: "Red", market: { priceChange7d: -11.2 } }),
      volumeLeader: token({ id: "liquid", symbol: "LIQ", name: "Liquid", market: { volume24h: 50_000_000 } }),
    });

    expect(recap.topicTag).toBe("Crypto");
    expect(recap.caption).toContain("TokenRadar weekly recap");
    expect(recap.caption).toContain("$ONE +22.4%");
    expect(recap.caption).toContain("Pullback watch: $RED -11.2%");
    expect(recap.caption).toContain("Reported-volume context: $LIQ");
    expect(recap.caption).toContain("Which supplied field was most useful this week");
    expect(recap.caption.length).toBeLessThanOrEqual(500);
  });

  it("builds a Telegram image-backed recap payload", () => {
    const recap = buildTelegramWeeklyRecap({
      leaders: [
        token({ id: "one", symbol: "ONE", name: "One", market: { priceChange7d: 22.4 } }),
        token({ id: "two", symbol: "TWO", name: "Two", market: { priceChange7d: 18.2 } }),
        token({ id: "three", symbol: "THREE", name: "Three", market: { priceChange7d: 14.1 } }),
      ],
      pullback: token({ id: "red", symbol: "RED", name: "Red", market: { priceChange7d: -11.2 } }),
      volumeLeader: token({ id: "liquid", symbol: "LIQ", name: "Liquid", market: { volume24h: 50_000_000 } }),
    }, new Date("2026-05-29T16:00:00.000Z"));

    expect(recap.tokenIds).toEqual(["one", "two", "three", "red", "liquid"]);
    expect(recap.captionBody).toContain("<b>Weekly Radar Recap</b>");
    expect(recap.captionBody).toContain("$ONE +22.4%");
    expect(recap.captionBody).toContain("Pullback watch: <b>$RED -11.2%</b>");
    expect(recap.image.title).toBe("Weekly Radar Recap");
    expect(recap.image.leaders.map((item) => item.symbol)).toEqual(["ONE", "TWO", "THREE"]);
    expect(recap.image.pullback?.symbol).toBe("RED");
    expect(recap.image.volumeLeader?.symbol).toBe("LIQ");
  });
});
