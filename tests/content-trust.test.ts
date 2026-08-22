import * as fs from "fs";
import * as path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResearchFreshnessNotice } from "../src/components/ResearchFreshnessNotice";
import { normalizeMetricSummary, resolveTokenMarketTimestamp } from "../src/lib/content-loader";

describe("content trust labels and timestamps", () => {
  it("prefers the market provider update over an older ingestion timestamp", () => {
    expect(resolveTokenMarketTimestamp({
      fetchedAt: "2026-05-13T00:00:00.000Z",
      lastMarketUpdate: "2026-08-21T00:00:00.000Z",
    })).toBe("2026-08-21T00:00:00.000Z");
    expect(resolveTokenMarketTimestamp({ fetchedAt: "2026-05-13T00:00:00.000Z" }))
      .toBe("2026-05-13T00:00:00.000Z");
    expect(resolveTokenMarketTimestamp({
      lastMarketUpdate: "not-a-timestamp",
      fetchedAt: "2026-05-13T00:00:00.000Z",
    })).toBe("2026-05-13T00:00:00.000Z");
    expect(resolveTokenMarketTimestamp({
      lastMarketUpdate: "invalid",
      fetchedAt: "also-invalid",
    })).toBeNull();
  });

  it("labels generated content and market updates without implying human review", () => {
    const markup = renderToStaticMarkup(createElement(ResearchFreshnessNotice, {
      contentUpdatedAt: "2026-08-14T00:00:00.000Z",
      marketDataAt: "2026-08-21T00:00:00.000Z",
    }));

    expect(markup).toContain("Article generated");
    expect(markup).toContain("Market data updated");
    expect(markup).not.toContain("Article reviewed");
    expect(markup).not.toContain("Market fields fetched");
  });

  it("neutralizes forecast-like metric summaries at render time", () => {
    expect(normalizeMetricSummary("high growth potential, limited upside"))
      .toBe("high recovery-room signal, limited recovery-room signal");
  });

  it("does not advertise unsupported contract, liquidity, audit, or emissions scoring", () => {
    const glossary = fs.readFileSync(path.join(process.cwd(), "data", "glossary.json"), "utf-8");

    expect(glossary).not.toContain("analyzing contract ownership and liquidity patterns in real-time");
    expect(glossary).not.toContain("Look for the **Liquidity Score** on TokenRadar");
    expect(glossary).not.toContain("our Security Score automatically deducts points");
    expect(glossary).not.toContain("TokenRadar tracks 'Emission Schedules'");
    expect(glossary).not.toContain("TokenRadar's Tokenomics gauge");
    expect(glossary).toContain("does not inspect contract ownership");
    expect(glossary).toContain("does not measure live DEX pool depth");
  });
});
