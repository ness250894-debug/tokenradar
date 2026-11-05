import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { generateTokenOgImages } from "../scripts/lib/token-og-images";
import { renderOgImage } from "../src/lib/og-renderer";

const repositoryRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repositoryRoot, "scripts/generate-og-images.tsx");
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = path.resolve(root);
    if (!absolute.startsWith(path.join(os.tmpdir(), "tokenradar-og-cache-"))) throw new Error("Unexpected fixture path");
    fs.rmSync(absolute, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-og-cache-"));
  roots.push(root);
  for (const dir of ["data/tokens", "data/metrics", "public/og/token", "src/assets/fonts"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(repositoryRoot, "src/assets/fonts/og-inter.ttf"), path.join(root, "src/assets/fonts/og-inter.ttf"));
  fs.writeFileSync(path.join(root, "public/og/movers.png"), "existing committed movers card");
  const tokenPath = path.join(root, "data/tokens/bitcoin.json");
  const token = { id: "bitcoin", name: "Bitcoin", symbol: "btc", market: { marketCap: 1.2e12, volume24h: 3e10, marketCapRank: 1 } };
  fs.writeFileSync(tokenPath, JSON.stringify(token));
  fs.writeFileSync(path.join(root, "data/metrics/bitcoin.json"), JSON.stringify({ riskScore: 2.5 }));
  return { root, token, tokenPath, output: path.join(root, "public/og/token/bitcoin.png") };
}

function generate(root: string, args: string[] = []): string {
  return execFileSync(process.execPath, ["--import", tsxLoader, scriptPath, ...args], {
    cwd: root,
    env: { ...process.env, OG_IMAGE_CONCURRENCY: "1" },
    stdio: "pipe",
    encoding: "utf8",
    timeout: 30_000,
  });
}

function digest(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function batchOptions(root: string) {
  return {
    tokensDir: path.join(root, "data/tokens"),
    metricsDir: path.join(root, "data/metrics"),
    outputDir: path.join(root, "public/og/token"),
    cacheFile: path.join(root, "data/cache/og-images.json"),
    concurrency: 2,
  };
}

describe("token OG image content cache", () => {
  it("reuses an image when only metadata and checkout timestamps change", () => {
    const { root, token, tokenPath, output } = fixture();
    generate(root);
    const original = fs.statSync(output).mtimeMs;
    fs.writeFileSync(tokenPath, JSON.stringify({ ...token, description: "New unrelated description", fetchedAt: "2099-01-01" }));
    fs.utimesSync(tokenPath, new Date("2099-01-01"), new Date("2099-01-01"));

    generate(root);

    expect(fs.statSync(output).mtimeMs).toBe(original);
  });

  it("regenerates changed rendered data even when source timestamps are older", () => {
    const { root, token, tokenPath, output } = fixture();
    generate(root);
    const original = digest(output);
    fs.writeFileSync(tokenPath, JSON.stringify({ ...token, name: "Changed token name" }));
    fs.utimesSync(tokenPath, new Date("2000-01-01"), new Date("2000-01-01"));

    generate(root);

    expect(digest(output)).not.toBe(original);
  });

  it("repairs a corrupted PNG instead of treating its newer timestamp as a cache hit", () => {
    const { root, output } = fixture();
    generate(root);
    const original = digest(output);
    fs.writeFileSync(output, "broken png");
    fs.utimesSync(output, new Date("2099-01-01"), new Date("2099-01-01"));

    generate(root);

    expect(digest(output)).toBe(original);
  });

  it("uses the cached font fallback when the bundled font is unavailable", () => {
    const { root, output } = fixture();
    const bundledFont = path.join(root, "src/assets/fonts/og-inter.ttf");
    fs.mkdirSync(path.join(root, "data/cache"), { recursive: true });
    fs.copyFileSync(bundledFont, path.join(root, "data/cache/og-inter.ttf"));
    fs.unlinkSync(bundledFont);

    generate(root);

    expect(fs.readFileSync(output).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("invalidates cached output when the resolved font bytes change", () => {
    const { root, output } = fixture();
    generate(root);
    const original = fs.statSync(output).mtimeMs;
    // Extra bytes are allowed after the font tables and change its content hash.
    fs.appendFileSync(path.join(root, "src/assets/fonts/og-inter.ttf"), Buffer.from([0]));

    generate(root);

    expect(fs.statSync(output).mtimeMs).toBeGreaterThan(original);
    expect(fs.readFileSync(output).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("rebuilds safely when the restored cache manifest is corrupt", () => {
    const { root, output } = fixture();
    generate(root);
    const original = digest(output);
    fs.writeFileSync(path.join(root, "data/cache/og-images.json"), "{corrupt");
    fs.writeFileSync(output, "broken output");

    generate(root);

    expect(digest(output)).toBe(original);
  });

  it("refreshes Movers separately without forcing unchanged token images", () => {
    const { root, output } = fixture();
    generate(root);
    const original = fs.statSync(output).mtimeMs;
    const stdout = generate(root, ["--force-movers"]);

    expect(stdout).toContain("Generating Daily Movers static image");
    expect(fs.statSync(output).mtimeMs).toBe(original);
  });
});

describe("parallel token OG image generation", () => {
  it("renders in two real workers with the same bytes as the direct renderer", async () => {
    const { root, token, output } = fixture();
    fs.writeFileSync(path.join(root, "data/tokens/ethereum.json"), JSON.stringify({ ...token, name: "Ethereum", symbol: "eth" }));
    const expected = await renderOgImage({ name: "Bitcoin", symbol: "BTC", marketCap: 1.2e12, volume24h: 3e10, rank: 1, risk: 2.5 });

    const result = await generateTokenOgImages(batchOptions(root));

    expect(result).toMatchObject({ rendered: 2, reused: 0, failed: 0, workers: 2 });
    expect(fs.readFileSync(output)).toEqual(expected);
    expect(fs.readFileSync(path.join(root, "public/og/token/ethereum.png")).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("rejects invalid concurrency instead of starting an unbounded or empty pool", async () => {
    const { root } = fixture();
    for (const concurrency of [0, -1, 1.5, 9, NaN]) {
      await expect(generateTokenOgImages({ ...batchOptions(root), concurrency })).rejects.toThrow(/concurrency/i);
    }
  });

  it("reuses cached output without workers and honors a forced rebuild", async () => {
    const { root } = fixture();
    const options = batchOptions(root);
    await generateTokenOgImages(options);

    expect(await generateTokenOgImages(options)).toMatchObject({ rendered: 0, reused: 1, workers: 0 });
    expect(await generateTokenOgImages({ ...options, force: true })).toMatchObject({ rendered: 1, reused: 0, workers: 1 });
  });

  it("reports a failed render, completes valid jobs, and does not cache the failure", async () => {
    const { root, token } = fixture();
    fs.writeFileSync(path.join(root, "data/tokens/broken.json"), JSON.stringify({ ...token, market: { ...token.market, marketCap: "invalid" } }));

    const result = await generateTokenOgImages(batchOptions(root));

    expect(result).toMatchObject({ rendered: 1, reused: 0, failed: 1 });
    expect(fs.existsSync(path.join(root, "public/og/token/broken.png"))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(batchOptions(root).cacheFile, "utf8"));
    expect(Object.keys(manifest.entries)).toEqual(["bitcoin"]);
  });

  it("repairs missing files and removes images for tokens no longer present", async () => {
    const { root, token, output } = fixture();
    const options = batchOptions(root);
    fs.writeFileSync(path.join(root, "data/tokens/removed.json"), JSON.stringify(token));
    await generateTokenOgImages(options);
    fs.unlinkSync(output);
    fs.unlinkSync(path.join(root, "data/tokens/removed.json"));

    expect(await generateTokenOgImages(options)).toMatchObject({ rendered: 1, reused: 0, failed: 0 });
    expect(fs.existsSync(path.join(root, "public/og/token/removed.png"))).toBe(false);
    expect(fs.readFileSync(output).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
