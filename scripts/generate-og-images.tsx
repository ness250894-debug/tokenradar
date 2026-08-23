import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { generateMoversImage } from "../src/lib/movers-generator";
import { renderOgImage } from "../src/lib/og-renderer";
import { loadEnv } from "../src/lib/utils";
import { hasSocialImageSafeText, loadCandidateTokens } from "./lib/token-selection";

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const OG_DIR = path.join(PUBLIC_DIR, "og", "token");
const REPO_ROOT = path.resolve(process.cwd()).replace(/\\/g, "/");
const MODIFIED_TIME_TOLERANCE_MS = 1000;

type TokenOgData = {
  symbol: string;
  name?: string;
  id: string;
  market?: {
    marketCap?: number;
    volume24h?: number;
    marketCapRank?: number;
  };
};

type MetricsOgData = {
  riskScore?: number;
};

function ensureOgDir(): void {
  if (!fs.existsSync(OG_DIR)) {
    fs.mkdirSync(OG_DIR, { recursive: true });
  }
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return fallback;
}

function readFileModifiedTime(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
}

function toRepositoryPath(filePath: string): string | undefined {
  const relativePath = path.relative(process.cwd(), path.resolve(filePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.replace(/\\/g, "/");
}

function readGitCommitTime(filePath: string): number | undefined {
  const repositoryPath = toRepositoryPath(filePath);
  if (!repositoryPath) {
    return undefined;
  }

  try {
    const output = execFileSync(
      "git",
      ["-c", `safe.directory=${REPO_ROOT}`, "log", "-1", "--format=%ct", "--", repositoryPath],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    const seconds = Number(output);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function shouldRegenerateOutput(outputPath: string, sourcePaths: string[], force = false): boolean {
  if (force) {
    return true;
  }

  const outputModifiedTime = readFileModifiedTime(outputPath);
  if (outputModifiedTime === undefined) {
    return true;
  }

  let outputCommitTime: number | undefined;

  return sourcePaths.some((sourcePath) => {
    const sourceModifiedTime = readFileModifiedTime(sourcePath);
    if (sourceModifiedTime !== undefined) {
      if (sourceModifiedTime > outputModifiedTime + MODIFIED_TIME_TOLERANCE_MS) {
        return true;
      }

      if (outputModifiedTime > sourceModifiedTime + MODIFIED_TIME_TOLERANCE_MS) {
        return false;
      }
    }

    const sourceCommitTime = readGitCommitTime(sourcePath);
    outputCommitTime ??= readGitCommitTime(outputPath);
    return (
      sourceCommitTime !== undefined &&
      outputCommitTime !== undefined &&
      sourceCommitTime > outputCommitTime
    );
  });
}

function listJsonFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dirPath, file));
}

function getMoversSourcePaths(): string[] {
  return [
    path.join(DATA_DIR, "tokens.json"),
    path.join(DATA_DIR, "_registry.json"),
    ...listJsonFiles(TOKENS_DIR),
    ...listJsonFiles(METRICS_DIR),
  ];
}

async function generateTokenOgImages(force: boolean): Promise<number> {
  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter((file) => file.endsWith(".json"));
  let failureCount = 0;

  for (const file of tokenFiles) {
    const tokenId = file.replace(".json", "");
    const outputPath = path.join(OG_DIR, `${tokenId}.png`);
    const tokenPath = path.join(TOKENS_DIR, file);
    const metricsPath = path.join(METRICS_DIR, file);

    if (!shouldRegenerateOutput(outputPath, [tokenPath, metricsPath], force)) {
      continue;
    }

    const tokenData = safeReadJson<TokenOgData | null>(tokenPath, null);
    const metricsData = safeReadJson<MetricsOgData | null>(metricsPath, null);

    if (!tokenData) {
      continue;
    }

    const symbol = (tokenData.symbol || tokenId.split("-")[0]).toUpperCase();
    const name = tokenData.name || tokenId;
    const riskScore = metricsData?.riskScore || 5;
    const marketCap = tokenData.market?.marketCap || 0;
    const volume24h = tokenData.market?.volume24h || 0;
    const rank = tokenData.market?.marketCapRank || 0;

    try {
      const pngBuffer = await renderOgImage({
        name,
        symbol,
        marketCap,
        volume24h,
        rank,
        risk: riskScore,
      });

      fs.writeFileSync(outputPath, pngBuffer);
      console.info(`Generated OG image for ${tokenId}`);
    } catch (error) {
      failureCount += 1;
      console.error(`Failed to generate OG image for ${tokenId}:`, error);
    }
  }

  return failureCount;
}

async function generateMoversOgImage(force: boolean): Promise<number> {
  const moversPath = path.join(PUBLIC_DIR, "og", "movers.png");

  // Static builds must be reproducible and must not depend on a live market API.
  // Daily Refresh owns regeneration and calls this script with --force after it
  // has refreshed the underlying market data. All other builds consume the
  // committed artifact produced by that workflow.
  if (!force) {
    if (fs.existsSync(moversPath)) {
      console.info("Using committed Daily Movers static image (live refresh not requested).");
      return 0;
    }

    console.error(
      "Missing public/og/movers.png. Run `npx tsx scripts/generate-og-images.tsx --force` in a credentialed refresh job and commit the result.",
    );
    return 1;
  }

  if (!shouldRegenerateOutput(moversPath, getMoversSourcePaths(), force)) {
    console.info("Daily Movers static image is up to date.");
    return 0;
  }

  console.info("Generating Daily Movers static image using live API data...");

  try {
    const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 500);
    const maxChangeThreshold = 500;

    const movers = candidates
      .filter(
        (token) =>
          token.market.priceChange24h > 0 &&
          token.market.priceChange24h <= maxChangeThreshold &&
          token.market.price > 0 &&
          hasSocialImageSafeText(token),
      )
      .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
      .slice(0, 5)
      .map((token) => ({
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        imageUrl: token.imageUrl,
        price: token.market.price,
        change24h: token.market.priceChange24h,
      }));

    if (movers.length > 0) {
      const moversBuffer = await generateMoversImage(movers);
      fs.writeFileSync(moversPath, moversBuffer);
      console.info("Generated static movers image at public/og/movers.png.");
    }

    return 0;
  } catch (error) {
    console.error("Failed to generate static movers image:", error);
    return 1;
  }
}

export async function generateOGImages(options: { force?: boolean } = {}): Promise<void> {
  loadEnv();
  ensureOgDir();

  console.info("Starting static OG image generation...");

  if (!fs.existsSync(TOKENS_DIR)) {
    console.info("No tokens dir found.");
    return;
  }

  const force = options.force ?? process.argv.includes("--force");
  const failureCount = (await generateTokenOgImages(force)) + (await generateMoversOgImage(force));

  if (failureCount > 0) {
    throw new Error(`Failed to generate ${failureCount} OG image${failureCount === 1 ? "" : "s"}.`);
  }

  console.info("Done.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateOGImages().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
