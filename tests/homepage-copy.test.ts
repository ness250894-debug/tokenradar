import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

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
});
