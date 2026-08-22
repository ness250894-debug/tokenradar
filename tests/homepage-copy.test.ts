import fs from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { metadata as homeMetadata } from "../src/app/page";
import { AlphaTicker } from "../src/components/AlphaTicker";

const HOME_SURFACE_FILES = [
  "src/components/HomeRadarBrief.tsx",
  "src/components/HomeSearchIntentRadar.tsx",
  "src/components/HomeMarketLab.tsx",
  "src/components/HomeTabs.tsx",
  "src/components/SentimentPoll.tsx",
];

describe("homepage market surface copy", () => {
  it("does not imply live freshness with today, now, or visible update timestamps", () => {
    const bannedCopy = /\b(?:today(?:'s|’s)?|now)\b|last updated/i;
    const offenders = HOME_SURFACE_FILES
      .map((file) => {
        const source = fs.readFileSync(path.join(process.cwd(), file), "utf-8");
        return { file, match: source.match(bannedCopy)?.[0] };
      })
      .filter((result): result is { file: string; match: string } => Boolean(result.match));

    expect(offenders).toEqual([]);
  });

  it("keeps the homepage title branded and ticker copy out of search snippets", () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");
    const tickerSource = fs.readFileSync(path.join(process.cwd(), "src/components/AlphaTicker.tsx"), "utf-8");

    expect(pageSource).toContain("title: { absolute: HOME_SHARE_TITLE }");
    expect(tickerSource).toContain("data-nosnippet");
    expect(pageSource).not.toContain("getTotalArticleCount");
    expect(pageSource).not.toContain("Published Research");
    expect(pageSource).toContain("Documented scoring rules");
    expect(homeMetadata.title).toEqual({
      absolute: "TokenRadar - Crypto Token Risk Scores & Launch Research",
    });
    expect(renderToStaticMarkup(createElement(AlphaTicker))).toContain("data-nosnippet");
  });
});
