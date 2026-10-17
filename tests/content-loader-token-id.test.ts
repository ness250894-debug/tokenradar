import { describe, expect, it } from "vitest";

import { sanitizeTokenId } from "../src/lib/content-loader";
import { normalizeWatchlistId } from "../src/lib/watchlist-storage";

describe("sanitizeTokenId", () => {
  it("preserves underscores used by CoinGecko IDs such as hive_dollar", () => {
    // Regression: stripping "_" made /hive_dollar render a not-found page,
    // which failed the rendered SEO audit and blocked the Daily Refresh merge.
    expect(sanitizeTokenId("hive_dollar")).toBe("hive_dollar");
  });

  it("keeps lowercase alphanumerics and hyphens unchanged", () => {
    expect(sanitizeTokenId("bitcoin")).toBe("bitcoin");
    expect(sanitizeTokenId("zebec-network")).toBe("zebec-network");
  });

  it("strips path traversal and separator characters", () => {
    expect(sanitizeTokenId("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeTokenId("foo\\bar.json")).toBe("foobarjson");
  });
});

describe("normalizeWatchlistId", () => {
  it("accepts token IDs with underscores", () => {
    expect(normalizeWatchlistId("hive_dollar")).toBe("hive_dollar");
    expect(normalizeWatchlistId("  HIVE_DOLLAR  ")).toBe("hive_dollar");
  });

  it("rejects invalid characters", () => {
    expect(normalizeWatchlistId("bad/id")).toBeNull();
    expect(normalizeWatchlistId("bad..id")).toBeNull();
  });
});
