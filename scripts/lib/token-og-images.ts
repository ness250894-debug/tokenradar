import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { availableParallelism } from "node:os";
import { preloadOgFont, type OgRenderData } from "../../src/lib/og-renderer";
import { writeFileAtomicSync } from "../../src/lib/utils";
import { renderOgImageJobs, type OgImageJob } from "./og-image-pool";

interface CacheEntry { key: string; sha256: string }
interface CacheManifest { version: 1; entries: Record<string, CacheEntry> }

export interface TokenOgImageOptions {
  tokensDir: string;
  metricsDir: string;
  outputDir: string;
  cacheFile: string;
  force?: boolean;
  concurrency?: number;
  font?: ArrayBuffer;
}

export interface TokenOgImageSummary {
  rendered: number;
  reused: number;
  failed: number;
  workers: number;
  durationMs: number;
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function rendererFingerprint(font: ArrayBuffer): string {
  const root = path.resolve(__dirname, "../..");
  const hash = createHash("sha256");
  for (const file of [
    "src/lib/og-renderer.ts", "src/lib/formatters.ts", "src/lib/social-icons.ts",
    "scripts/generate-og-images.tsx", "scripts/lib/token-og-images.ts", "package-lock.json",
    "scripts/lib/og-image-pool.ts", "scripts/lib/og-image-worker.cjs",
  ]) {
    hash.update(file).update("\0").update(fs.readFileSync(path.join(root, file)));
  }
  hash.update(Buffer.from(font));
  hash.update(`${process.platform}:${process.arch}:${process.versions.node}`);
  return hash.digest("hex");
}

function readManifest(file: string): CacheManifest {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as CacheManifest;
    if (manifest.version === 1 && manifest.entries && typeof manifest.entries === "object") return manifest;
  } catch { /* Missing or invalid caches are rebuilt. */ }
  return { version: 1, entries: Object.create(null) };
}

function cacheHit(outputPath: string, key: string, entry?: CacheEntry): boolean {
  if (!entry || entry.key !== key) return false;
  try {
    const png = fs.readFileSync(outputPath);
    return png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && sha256(png) === entry.sha256;
  } catch { return false; }
}

function renderData(tokenFile: string, metricsFile: string, id: string): OgRenderData {
  const token = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  const metric = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, "utf8")) : undefined;
  return {
    name: token.name || id,
    symbol: (token.symbol || id.split("-")[0]).toUpperCase(),
    marketCap: token.market?.marketCap || 0,
    volume24h: token.market?.volume24h || 0,
    rank: token.market?.marketCapRank || 0,
    risk: metric?.riskScore || 5,
  };
}

export async function generateTokenOgImages(options: TokenOgImageOptions): Promise<TokenOgImageSummary> {
  const started = performance.now();
  const concurrency = options.concurrency ?? (process.env.OG_IMAGE_CONCURRENCY === undefined
    ? Math.min(4, availableParallelism()) : Number(process.env.OG_IMAGE_CONCURRENCY));
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("OG image concurrency must be an integer from 1 to 8.");
  }
  const font = options.font ?? await preloadOgFont();
  const fingerprint = rendererFingerprint(font);
  const previous = readManifest(options.cacheFile);
  const entries: Record<string, CacheEntry> = Object.create(null);
  const summary: TokenOgImageSummary = { rendered: 0, reused: 0, failed: 0, workers: 0, durationMs: 0 };
  const files = fs.readdirSync(options.tokensDir).filter(file => file.endsWith(".json")).sort();
  const jobs: Array<OgImageJob & { key: string; outputPath: string }> = [];
  fs.mkdirSync(options.outputDir, { recursive: true });

  for (const file of files) {
    const id = file.slice(0, -5);
    const outputPath = path.join(options.outputDir, `${id}.png`);
    try {
      const data = renderData(path.join(options.tokensDir, file), path.join(options.metricsDir, file), id);
      const key = sha256(`${fingerprint}\0${JSON.stringify(data)}`);
      if (!options.force && cacheHit(outputPath, key, previous.entries[id])) {
        entries[id] = previous.entries[id];
        summary.reused++;
        continue;
      }
      jobs.push({ id, data, key, outputPath });
    } catch (error) {
      summary.failed++;
      console.error(`Failed to generate OG image for ${id}:`, error);
    }
  }

  summary.workers = await renderOgImageJobs(jobs, concurrency, font, (job, png, error) => {
    try {
      if (error) throw error;
      if (!png) throw new Error("No image returned.");
      writeFileAtomicSync(job.outputPath, png);
      entries[job.id] = { key: job.key, sha256: sha256(png) };
      summary.rendered++;
    } catch (error) {
      summary.failed++;
      console.error(`Failed to generate OG image for ${job.id}:`, error);
    }
  });

  // The generator owns this PNG directory; discard removed tokens from restored caches.
  if (summary.failed === 0) {
    for (const file of fs.readdirSync(options.outputDir)) {
      if (file.endsWith(".png") && !Object.hasOwn(entries, file.slice(0, -4))) {
        fs.unlinkSync(path.join(options.outputDir, file));
      }
    }
  }
  writeFileAtomicSync(options.cacheFile, JSON.stringify({ version: 1, entries } satisfies CacheManifest));
  summary.durationMs = performance.now() - started;
  console.info(`Token OG images: ${summary.rendered} generated, ${summary.reused} reused, ${summary.failed} failed in ${(summary.durationMs / 1000).toFixed(2)}s (${summary.workers} workers).`);
  return summary;
}
