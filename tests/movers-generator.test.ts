import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import type { SatoriNode } from "satori";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateMoversImage, type MoverToken } from "../src/lib/movers-generator";

const layout = vi.hoisted(() => ({ nodes: [] as SatoriNode[] }));

// Observe the real layout engine so an overflowing image fails even when its
// PNG dimensions are correct. Keep both SVG and PNG rendering real.
vi.mock("satori", async (importOriginal) => {
  const actual = await importOriginal<typeof import("satori")>();
  return {
    ...actual,
    default: (element: Parameters<typeof actual.default>[0], options: Parameters<typeof actual.default>[1]) =>
      actual.default(element, {
        ...options,
        onNodeDetected: (node) => layout.nodes.push(node),
      }),
  };
});

const movers: MoverToken[] = [
  { id: "seeker", symbol: "SKR", name: "Seeker", price: 0.01094, change24h: 24.44 },
  { id: "meme-horse", symbol: "MHORSE", name: "MEME HORSE", price: 0.058592, change24h: 18.61 },
  { id: "aria-ai", symbol: "ARIA", name: "Aria.AI", price: 0.238456, change24h: 18.32 },
  { id: "banana-for-scale", symbol: "BANANAS31", name: "Banana For Scale", price: 0.004827, change24h: 17.1 },
  { id: "concordium", symbol: "CCD", name: "Concordium", price: 0.003292, change24h: 15.47 },
];

afterEach(() => {
  layout.nodes.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Telegram movers image layout", () => {
  it.each([true, false])("keeps the complete card inside the PNG with token icons available: %s", async (hasIcons) => {
    const font = fs.readFileSync(path.resolve("src/assets/fonts/og-inter.ttf"));
    vi.spyOn(fs.promises, "readFile").mockResolvedValueOnce(font);
    vi.stubGlobal("fetch", async () => hasIcons
      ? new Response('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="red"/></svg>')
      : new Response(null, { status: 404 }));

    const image = await generateMoversImage(movers.map((mover) => ({
      ...mover,
      imageUrl: `https://assets.coingecko.com/movers-test-${hasIcons}-${mover.id}.svg`,
    })));
    const metadata = await sharp(image).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1200, height: 630 });

    const textNodes = layout.nodes.filter((node) => node.textContent);
    expect(layout.nodes.filter((node) => node.type === "img")).toHaveLength(hasIcons ? 5 : 0);
    expect(textNodes.some((node) => node.textContent === "RADAR")).toBe(true);
    for (const mover of movers) {
      expect(textNodes.some((node) => node.textContent === mover.symbol)).toBe(true);
      expect(textNodes.some((node) => node.textContent === `+${mover.change24h.toFixed(2)}%`)).toBe(true);
    }

    for (const node of layout.nodes.filter((node) => node.textContent || node.type === "img")) {
      expect(node.left, `${node.textContent}: left edge`).toBeGreaterThanOrEqual(0);
      expect(node.top, `${node.textContent}: top edge`).toBeGreaterThanOrEqual(0);
      expect(node.left + node.width, `${node.textContent}: right edge`).toBeLessThanOrEqual(1200);
      expect(node.top + node.height, `${node.textContent}: bottom edge`).toBeLessThanOrEqual(630);
    }
  });
});
