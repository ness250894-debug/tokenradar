import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { shouldRegenerateOutput } from "../scripts/generate-og-images";
import { preloadOgFont, renderOgImage } from "../src/lib/og-renderer";

describe("OG image generation freshness", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-og-test-"));
    tmpRoots.push(root);
    return root;
  }

  it("regenerates existing images when source data is newer", () => {
    const root = makeTempRoot();
    const output = path.join(root, "out.png");
    const source = path.join(root, "token.json");

    fs.writeFileSync(output, "old-image");
    fs.writeFileSync(source, "{}");
    const now = new Date("2026-05-18T12:00:00.000Z");
    fs.utimesSync(output, new Date("2026-05-18T10:00:00.000Z"), new Date("2026-05-18T10:00:00.000Z"));
    fs.utimesSync(source, now, now);

    expect(shouldRegenerateOutput(output, [source], false)).toBe(true);
  });

  it("keeps existing images when they are newer than source data", () => {
    const root = makeTempRoot();
    const output = path.join(root, "out.png");
    const source = path.join(root, "token.json");

    fs.writeFileSync(output, "fresh-image");
    fs.writeFileSync(source, "{}");
    fs.utimesSync(source, new Date("2026-05-18T10:00:00.000Z"), new Date("2026-05-18T10:00:00.000Z"));
    fs.utimesSync(output, new Date("2026-05-18T12:00:00.000Z"), new Date("2026-05-18T12:00:00.000Z"));

    expect(shouldRegenerateOutput(output, [source], false)).toBe(false);
  });
});

describe("OG image font loading and rendering", () => {
  it("loads the bundled Inter font into memory", async () => {
    const font = await preloadOgFont();
    expect(font).toBeDefined();
    expect(font.byteLength).toBeGreaterThan(100_000);

    // Verify TrueType header signature: 0x00010000
    const view = new DataView(font);
    const magic = view.getUint32(0);
    expect(magic).toBe(0x00010000);
  });

  it("renders a valid PNG buffer with token data", async () => {
    const buffer = await renderOgImage({
      name: "Bitcoin",
      symbol: "BTC",
      marketCap: 1_200_000_000_000,
      volume24h: 30_000_000_000,
      rank: 1,
      risk: 2.5,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Verify PNG magic bytes: \x89PNG\r\n\x1a\n (0x89504e47)
    expect(buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

