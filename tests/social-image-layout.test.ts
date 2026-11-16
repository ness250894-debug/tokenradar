import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { SatoriNode } from "satori";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDailyMoversCarousel } from "../src/lib/daily-movers-carousel-generator";
import { fetchTokenImage } from "../src/lib/og-fetcher";
import { renderOgImage } from "../src/lib/og-renderer";
import { renderTelegramMarketImage } from "../src/lib/telegram-market-image";
import { renderTelegramWeeklyRecapImage } from "../src/lib/telegram-weekly-recap-image";
import { generateTokenComparisonImage } from "../src/lib/token-comparison";

const layouts = vi.hoisted(() => [] as SatoriNode[][]);

vi.mock("satori", async (importOriginal) => {
  const { default: render } = await importOriginal<typeof import("satori")>();
  return {
    default: (element: Parameters<typeof render>[0], options: Parameters<typeof render>[1]) => {
      const nodes: SatoriNode[] = [];
      layouts.push(nodes);
      return render(element, { ...options, onNodeDetected: (node) => nodes.push(node) });
    },
  };
});

// The comparison renderer fetches a font and the carousel and comparison may fetch icons.
beforeEach(() => {
  const font = readFileSync("src/assets/fonts/og-inter.ttf");
  vi.stubGlobal("fetch", async (url: string) => url.endsWith("Roboto-Medium.ttf")
    ? new Response(new Uint8Array(font))
    : new Response(null, { status: 404 }));
});

afterEach(() => {
  layouts.length = 0;
  vi.unstubAllGlobals();
});

async function expectContentInFrame(
  image: Buffer,
  width: number,
  height: number,
  expectedText: string[],
  nodes = layouts[0],
) {
  expect(await sharp(image).metadata()).toMatchObject({ format: "png", width, height });
  const textNodes = nodes.filter((node) => node.textContent);
  // Intrinsic text width and panel bounds can exceed the canvas even when the PNG size is right.
  const overflow = nodes.filter(({ props, textContent, left, top, width: w, height: h }) => {
    if (props.style?.position === "absolute") return false;
    const inset = textContent ? 12 : 0;
    return left < inset || top < inset || left + w > width - inset || top + h > height - inset;
  });
  expect(overflow.map((node) => `${node.textContent ?? node.type} (${node.left}, ${node.top}, ${node.width}, ${node.height})`)).toEqual([]);
  const text = textNodes.map((node) => node.textContent).join(" ");
  for (const expected of expectedText) expect(text).toContain(expected);
}

const snapshotTime = "2026-11-16T18:36:00.000Z";
const pengu = {
  name: "Pudgy Penguins", symbol: "PENGU", marketCap: 306_850_000, volume24h: 80_560_000,
  rank: 123, risk: 6,
};
const longSymbol = "W".repeat(15);
const movers = [longSymbol, "ANOTHERTICKER15", "PENGU", "BTC", "ETH"].map((symbol, index) => ({
  id: `layout-mover-${index}`,
  name: `Layout Mover ${index}`,
  symbol,
  price: 1,
  change24h: 95 - index,
  marketCap: 50_000_000,
  volume24h: (index === 1 ? 5 : 1) * 25_000_000,
  rank: index + 1,
}));

describe("social image layouts", () => {
  it("fits the PENGU brief's complete risk badge and social footer", async () => {
    const image = await fetchTokenImage("pudgy-penguins", pengu);
    expect(image).toBeInstanceOf(Buffer);
    await expectContentInFrame(image!, 1200, 630, ["Pudgy Penguins", "Risk Score", "/10", "MEDIUM", "Token_Radar_Official"]);
  });

  it("keeps a long token name, ticker, and missing risk within the OG template", async () => {
    const name = "ISHARES CORE S&P 500 ETF ONDO TOKENIZED ETF";
    const symbol = "BIG-TOKEN-TICKER";
    const image = await renderOgImage({ ...pengu, name, symbol, risk: undefined });
    await expectContentInFrame(image, 1200, 630, [name, symbol, "N/A", "Token_Radar_Official"]);
  });

  it.each(["Market Pulse", "What turnover tells us"])("fits a full %s card with a long watch ticker", async (title) => {
    const image = await renderTelegramMarketImage({
      title,
      subtitle: "Price movement, reported activity, and the missing checks",
      generatedAtLabel: "2026-11-16 18:36 UTC",
      sourceLabel: "CoinGecko market snapshot",
      globalStats: "$3.84T global market cap | $190.68B 24h volume | BTC 61.2%",
      sectorLines: ["Solana Ecosystem +10.0%", "Real World Assets +9.5%", "Decentralized Exchanges +8.100%"],
      featuredToken: { symbol: longSymbol, name: pengu.name, marketCapRank: 99999, priceChange24h: -12.38, riskScore: 6 },
    });
    await expectContentInFrame(image, 1200, 630, [title, longSymbol, "#99999", "-12.38%", "Decentralized Exchanges"]);
  });

  it("fits the weekly leaders and both side panels", async () => {
    const leaders = movers.slice(0, 3).map((mover) => ({ ...mover, change7d: mover.change24h }));
    const image = await renderTelegramWeeklyRecapImage({
      title: "Weekly Market Recap",
      subtitle: "Seven days of market evidence",
      generatedAtLabel: "2026-11-16 18:36 UTC",
      leaders,
      pullback: { ...leaders[0], change7d: -25 },
      volumeLeader: movers[1],
    });
    await expectContentInFrame(image, 1200, 630, ["Tracked 7d changes", leaders[2].name, "Pullback watch", "Reported 24h volume"]);
  });

  it("fits all three weekly follow-up rows and the cohort note", async () => {
    const image = await renderTelegramWeeklyRecapImage({
      title: "Research follow-up",
      subtitle: "Changes since the original recorded prices",
      generatedAtLabel: "Oldest endpoint: 2026-11-16 18:36 UTC",
      leaders: [],
      followUps: movers.slice(0, 3).map((mover, index) => ({
        contentKey: mover.id,
        postedAt: snapshotTime,
        snapshot: {
          ...mover, version: 1, tokenId: mover.id, priceChange24h: mover.change24h,
          marketDataSource: "coingecko-live", marketDataAsOf: snapshotTime,
        },
        returnPercent: index === 2 ? undefined : -3.45,
      })),
    });
    await expectContentInFrame(image, 1200, 630, [longSymbol, "Price unavailable", "Original cohort retained"]);
  });

  it("fits both comparison columns, the verdict, and source attribution", async () => {
    const [left, right] = movers.slice(0, 2).map((mover) => ({
      ...mover,
      name: "Wide Web Wrapped World Asset Token",
      change7d: mover.change24h * 2,
      marketDataSource: "coingecko-live" as const,
      marketDataAsOf: snapshotTime,
      metrics: { riskScore: 6, growthPotentialIndex: 12, inputDataAsOf: snapshotTime },
    }));
    const image = await generateTokenComparisonImage({ left, right, context: "Decentralized Derivatives and Perpetual Exchanges" });
    await expectContentInFrame(image, 1080, 1080, [`$${left.symbol}`, `$${right.symbol}`, "leads 7D change", "TOKENRADAR.CO", "CoinGecko"]);
  });

  it("fits the content and source attribution on every Instagram slide", async () => {
    const slides = await generateDailyMoversCarousel(movers, {
      generatedAt: new Date(snapshotTime),
      cta: `Compare ${longSymbol} again after the next daily close. Save the four-field research checklist for the next snapshot.`,
    });
    const content = [
      [longSymbol, movers[1].symbol, "Swipe for the calculation"],
      [longSymbol, "ETH", "The columns measure different things."],
      [longSymbol, "The ratio cannot tell us"],
    ["Venue mix", "Turnover alone cannot answer them."],
      ["Available quoted size near price.", "Save the four-field research checklist"],
    ];
    expect(slides).toHaveLength(content.length);
    await Promise.all(slides.map((slide, index) =>
      expectContentInFrame(slide, 1080, 1350, [...content[index], "CoinGecko", "Point-in-time educational research"], layouts[index])));
  });
});
