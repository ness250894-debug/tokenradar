import { describe, expect, it } from "vitest";
import { createResearchSnapshot } from "../src/lib/social-research-snapshot";
import { buildResearchFollowUpText, evaluateResearchCohort, selectResearchCohort } from "../scripts/lib/social-follow-up";

const now = new Date("2026-10-31T12:00:00Z");
const token = (id: string, price: number, asOf = "2026-10-21T12:00:00Z") => ({
  id, symbol: id.toUpperCase(), name: id, marketDataSource: "coingecko-live",
  lastMarketUpdate: asOf,
  market: { price, marketCap: 100_000_000, volume24h: 5_000_000, priceChange24h: 2 },
});
const row = (id: string, date: string) => ({ content_key: id, posted_at: date,
  details_json: JSON.stringify({ variantSurface: "market-update", researchSnapshot: createResearchSnapshot(token(id, 100, date)) }),
});

describe("recorded research follow-ups", () => {
  it("fixes the cohort chronologically, deduplicates assets, and does not select by subsequent returns", () => {
    const cohort = selectResearchCohort([
      { ...row("prior-followup", "2026-10-19T12:00:00Z"), details_json: JSON.stringify({
        editorialMode: "research-follow-up", researchSnapshot: createResearchSnapshot(token("prior-followup", 100, "2026-10-19T12:00:00Z")),
      }) },
      row("four", "2026-10-23T12:00:00Z"), row("two", "2026-10-21T13:00:00Z"),
      row("one", "2026-10-20T12:00:00Z"), row("three", "2026-10-22T12:00:00Z"),
      row("one", "2026-10-23T13:00:00Z"), row("recent", "2026-10-30T12:00:00Z"),
    ], now);
    expect(cohort.map((entry) => entry.snapshot.tokenId)).toEqual(["one", "two", "three"]);
    const results = evaluateResearchCohort(cohort, [token("one", 90, now.toISOString()), token("two", 190, now.toISOString()), token("four", 999, now.toISOString())], now);
    expect(results.map((entry) => entry.snapshot.tokenId)).toEqual(["one", "two", "three"]);
    expect(results[0].returnPercent).toBeCloseTo(-10);
    expect(results[1].returnPercent).toBeCloseTo(90);
    expect(results[2].returnPercent).toBeUndefined();
    const text = buildResearchFollowUpText(results, 500);
    expect(text).toContain("-10.00%");
    expect(text).toContain("+90.00%");
    expect(text).toContain("$THREE: fresh same-source price unavailable");
    expect(text).toContain("2026-10-20 12:00 UTC");
    expect(text).not.toContain("$FOUR");
  });

  it("keeps all assets and dates in a short caption and labels differing endpoint times", () => {
    const ids = ["long-token-name", "second-token", "third-token"];
    const cohort = selectResearchCohort(ids.map((id) => row(id, "2026-10-20T12:00:00Z")), now);
    const results = evaluateResearchCohort(cohort, [
      token(ids[0], 80, "2026-10-31T11:00:00Z"), token(ids[1], 120, now.toISOString()),
    ], now);
    const text = buildResearchFollowUpText(results, 330);
    for (const id of ids) expect(text).toContain(`$${id.toUpperCase()}`);
    expect(text.match(/2026-10-20 12:00 UTC/g)).toHaveLength(3);
    expect(text).toContain("oldest endpoint, 2026-10-31 11:00 UTC");
  });

  it("does not treat cached, stale, future, or malformed endpoint data as a measured result", () => {
    const cohort = selectResearchCohort([row("one", "2026-10-20T12:00:00Z")], now);
    for (const endpoint of [token("one", 0, now.toISOString()), token("one", 50, "2026-10-28T12:00:00Z"),
      token("one", 50, "2026-11-01T12:00:00Z"), { ...token("one", 50, now.toISOString()), marketDataSource: "local-cache" }]) {
      expect(evaluateResearchCohort(cohort, [endpoint], now)[0].returnPercent).toBeUndefined();
    }
    expect(selectResearchCohort([{ content_key: "bad", posted_at: "2026-10-20T12:00:00Z", details_json: "not-json" }], now)).toEqual([]);
    expect(() => buildResearchFollowUpText(evaluateResearchCohort(cohort, [], now), 20)).toThrow("full research cohort");
  });
});
