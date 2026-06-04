import { describe, expect, it } from "vitest";
import {
  getTgeContractQueries,
  isLikelyStaleExpectedTge,
  normalizeTge,
  shouldPublishTgePreview,
  type UpcomingTge,
} from "../src/lib/tge";

const baseTge: UpcomingTge = {
  id: "example-protocol",
  name: "Example Protocol",
  symbol: "TBD",
  category: "Infrastructure",
  expectedTge: "Funding Stage",
  narrativeStrength: 80,
  dataSource: "https://cointelegraph.com/news/example-raises-series-a",
  discoveredAt: "2026-05-01T00:00:00.000Z",
};

describe("TGE lifecycle normalization", () => {
  it("keeps funding-only news as a non-publishable candidate", () => {
    const tge = normalizeTge(baseTge);

    expect(tge.lifecycleStatus).toBe("candidate");
    expect(tge.confidence).toBeLessThan(45);
    expect(shouldPublishTgePreview(tge)).toBe(false);
  });

  it("promotes explicit airdrop evidence into the publishable watchlist", () => {
    const tge = normalizeTge({
      ...baseTge,
      expectedTge: "Confirmed airdrop campaign in Q3 2026",
      dataSource: "https://airdropalert.com/blogs/example-airdrop-guide/",
    });

    expect(["watchlist", "confirmed_tge"]).toContain(tge.lifecycleStatus);
    expect(shouldPublishTgePreview(tge)).toBe(true);
  });

  it("marks old quarter windows as stale", () => {
    expect(isLikelyStaleExpectedTge("Q2 2025", new Date("2026-05-11T00:00:00.000Z"))).toBe(true);
  });

  it("only allows contract queries for valid EVM addresses", () => {
    const queries = getTgeContractQueries({
      ...baseTge,
      contracts: [
        { chain: "ethereum", address: "0x0000000000000000000000000000000000000000" },
        { chain: "solana", address: "not-an-evm-address" },
      ],
    });

    expect(queries).toEqual(["0x0000000000000000000000000000000000000000"]);
  });

  it("normalizes date-only signal observation dates into ISO timestamps", () => {
    const tge = normalizeTge({
      ...baseTge,
      signals: [
        {
          type: "tge",
          sourceType: "official",
          url: "https://example.com/tge",
          observedAt: "2026-06-02",
        },
      ],
    });

    expect(tge.signals?.[0]?.observedAt).toBe("2026-06-02T00:00:00.000Z");
  });
});
