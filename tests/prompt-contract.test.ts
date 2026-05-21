import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const generateContentSource = fs.readFileSync(
  path.resolve(__dirname, "../scripts/generate-content.ts"),
  "utf-8",
);
const publishFromQueueSource = fs.readFileSync(
  path.resolve(__dirname, "../scripts/publish-from-queue.ts"),
  "utf-8",
);

function extractTemplate(name: string): string {
  const match = generateContentSource.match(
    new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`),
  );
  return match?.[1] || "";
}

function extractSourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    return "";
  }

  return source.slice(startIndex, endIndex);
}

function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("article prompt contract", () => {
  it("keeps standard article grounding availability-aware", () => {
    const prompt = extractTemplate("SYSTEM_PROMPT");

    expect(prompt).toContain("Reference at least 1 real-world development or event when provided");
    expect(prompt).toContain("Do not invent events when source material is unavailable");
    expect(prompt).toContain("Do not copy source snippets verbatim");
  });

  it("applies shared safety and formatting constraints to both prompt families", () => {
    const standardPrompt = extractTemplate("SYSTEM_PROMPT");
    const tgePrompt = extractTemplate("TGE_SYSTEM_PROMPT");

    for (const prompt of [standardPrompt, tgePrompt]) {
      expect(prompt).toContain("NEVER guarantee returns, profits, safety, or exact future prices");
      expect(prompt).toContain("Do not bold entire paragraphs");
      expect(prompt).toContain("Do not copy source snippets verbatim");
    }
  });

  it("keeps documented publish-time placeholders hydrated", () => {
    for (const placeholder of [
      "{{LIVE_PRICE}}",
      "{{LIVE_MARKET_CAP}}",
      "{{LIVE_RANK}}",
      "{{LIVE_DATE}}",
      "{{LIVE_24H_CHANGE}}",
      "{{GLOBAL_MCAP}}",
      "{{GLOBAL_TOTAL_MARKET_CAP}}",
      "{{BTC_DOM}}",
      "{{GLOBAL_BTC_DOMINANCE}}",
    ]) {
      expect(publishFromQueueSource).toContain(`"${placeholder}"`);
    }
  });

  it("keeps article archetype target lengths aligned with the prompt contract", () => {
    expect(generateContentSource).toContain('case "overview":');
    expect(generateContentSource).toContain('case "price-prediction":');
    expect(generateContentSource).toContain('return "1000-1200";');
    expect(generateContentSource).toContain('case "how-to-buy":');
    expect(generateContentSource).toContain('case "tge-preview":');
    expect(generateContentSource).toContain('return "800-1000";');
  });

  it("keeps daily drip generation free of the removed price-swing queue label", () => {
    const removedQueueLabel = ["V", "olatile"].join("");

    expect(generateContentSource).not.toContain(removedQueueLabel);
    expect(generateContentSource).not.toContain(`[${removedQueueLabel.toUpperCase()}]`);
  });

  it("keeps the price-move stale refresh trigger disabled in active code", () => {
    const isStaleSource = extractSourceBetween(
      generateContentSource,
      "async function isStale",
      "async function needsArticleGeneration",
    );
    const activeIsStaleSource = stripSourceComments(isStaleSource);

    expect(isStaleSource).toContain("Disabled price-move refresh trigger");
    expect(activeIsStaleSource).not.toContain("priceChange24h");
    expect(activeIsStaleSource).not.toContain("VOLATILITY TRIGGER");
  });

  it("keeps daily drip active queue limited to TGE previews and graduations", () => {
    const dripSource = extractSourceBetween(
      generateContentSource,
      "if (dripMode) {",
      "// Standard logic (Bulk or Single Token)",
    );
    const activeDripSource = stripSourceComments(dripSource);

    expect(dripSource).toContain("Disabled non-launch drip tiers");
    expect(activeDripSource).toContain("tgeTokensToProcess.push");
    expect(activeDripSource).toContain("graduatedToProcess.push");
    expect(activeDripSource).not.toContain("incompleteTokens");
    expect(activeDripSource).not.toContain("refreshCandidates");
    expect(activeDripSource).not.toContain("[INCOMPLETE]");
  });
});
