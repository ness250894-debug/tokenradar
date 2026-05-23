import * as fs from "fs";
import * as path from "path";

import {
  buildStockAssetQueries,
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "../src/lib/video-assets";
import { probeLocalVideoAsset } from "../src/lib/video-asset-metadata";
import { loadEnv } from "../src/lib/utils";

loadEnv();

type ProviderName = "pexels" | "pixabay";

interface ProviderCandidate {
  id: string;
  provider: ProviderName;
  downloadUrl: string;
  pageUrl?: string;
  attribution?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags?: string[];
}

interface PexelsVideoFile {
  file_type?: string;
  link?: string;
  width?: number;
  height?: number;
}

interface PexelsVideoItem {
  id: string | number;
  url?: string;
  duration?: number;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
}

interface PixabayVideoFile {
  url?: string;
  width?: number;
  height?: number;
}

interface PixabayHit {
  id: string | number;
  pageURL?: string;
  user?: string;
  duration?: number;
  videos?: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
}

const PUBLIC_VIDEO_ASSETS_DIR = path.resolve(process.cwd(), "public", "video-assets");
const BROLL_DIR = path.join(PUBLIC_VIDEO_ASSETS_DIR, "broll");
const MANIFEST_FILE = path.join(BROLL_DIR, "manifest.json");

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

function sanitizeFilePart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

function getDefaultQueries(): string[] {
  return buildStockAssetQueries({
    tokenName: "",
    symbol: "",
    selectionReason: "daily video market data",
    videoFormatKey: "volume_spike_check",
  });
}

function getProviders(args: string[]): ProviderName[] {
  const requested = (getArgValue(args, "--provider") || process.env.VIDEO_ASSET_PROVIDERS || "pexels,pixabay")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  const providers = requested.includes("all") ? ["pexels", "pixabay"] : requested;
  return providers.filter((provider): provider is ProviderName => provider === "pexels" || provider === "pixabay");
}

function buildQueryTags(query: string): string[] {
  const normalized = query.toLowerCase();
  const tags = new Set(["market", "stock", "broll"]);
  const tagHints: Array<[RegExp, string]> = [
    [/\b(person|people|woman|man|trader|worker|human)\b/, "human"],
    [/\b(phone|app)\b/, "phone"],
    [/\bhands?\b/, "hands"],
    [/\blaptop\b/, "laptop"],
    [/\bdesk\b/, "desk"],
    [/\bmonitor|screen\b/, "monitor"],
    [/\bchart|candlestick|analytics|dashboard|heatmap\b/, "chart"],
    [/\bdata|financial|finance|market\b/, "data"],
    [/\bliquidity|order book\b/, "liquidity"],
  ];

  for (const [pattern, tag] of tagHints) {
    if (pattern.test(normalized)) tags.add(tag);
  }

  if (tags.has("human") && !tags.has("person")) tags.add("person");
  return Array.from(tags);
}

function scoreCandidate(candidate: ProviderCandidate): number {
  const tags = new Set(candidate.tags || []);
  let score = 0;

  if (tags.has("human") || tags.has("person")) score += 48;
  if (tags.has("phone") || tags.has("hands")) score += 32;
  if (tags.has("laptop") || tags.has("desk") || tags.has("monitor")) score += 24;
  if (tags.has("chart") || tags.has("data")) score += 12;
  if (candidate.height && candidate.width && candidate.height > candidate.width) score += 24;
  if ((candidate.width || 0) > 1080 || (candidate.height || 0) > 1920) score -= 18;

  const duration = candidate.durationSeconds;
  if (duration !== undefined) {
    if (duration >= 5 && duration <= 24) score += 24;
    else if (duration > 30) score -= Math.min(36, Math.round(duration - 30));
  }

  return score;
}

function isPublishableStockCandidate(candidate: ProviderCandidate): boolean {
  if (!candidate.width || !candidate.height) return false;
  if (!candidate.durationSeconds || candidate.durationSeconds < 8) return false;
  if (candidate.width < 720 || candidate.height < 1280) return false;

  // Downloaded stock clips do not carry crop-safe metadata, so keep the
  // automated library to native vertical assets that pass R2 publish rules.
  return candidate.height >= candidate.width;
}

function pickPexelsVideoFile(video: PexelsVideoItem): { link: string; width?: number; height?: number } | null {
  const files = Array.isArray(video.video_files) ? video.video_files : [];
  const mp4Files = files
    .filter((file): file is PexelsVideoFile & { link: string } => file?.file_type === "video/mp4" && Boolean(file?.link))
    .sort((left, right) => {
      const leftVertical = (left.height ?? 0) > (left.width ?? 0) ? 1 : 0;
      const rightVertical = (right.height ?? 0) > (right.width ?? 0) ? 1 : 0;
      const leftPixels = (left.width || 0) * (left.height || 0);
      const rightPixels = (right.width || 0) * (right.height || 0);
      return rightVertical - leftVertical || rightPixels - leftPixels;
    });

  const selected = mp4Files[0];
  return selected ? { link: selected.link, width: selected.width, height: selected.height } : null;
}

async function searchPexels(query: string, perPage: number): Promise<ProviderCandidate[]> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL("https://api.pexels.com/v1/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", String(perPage));

  const response = await fetch(url, { headers: { Authorization: apiKey } });
  if (!response.ok) throw new Error(`Pexels search failed (${response.status}) for "${query}"`);

  const data = await response.json() as { videos?: PexelsVideoItem[] };
  return (Array.isArray(data.videos) ? data.videos : [])
    .map((video): ProviderCandidate | null => {
      const file = pickPexelsVideoFile(video);
      if (!file) return null;

      return {
        id: String(video.id),
        provider: "pexels",
        downloadUrl: file.link,
        pageUrl: video.url,
        attribution: video.user?.name ? `Video by ${video.user.name} on Pexels` : "Video from Pexels",
        width: file.width,
        height: file.height,
        durationSeconds: video.duration,
        tags: buildQueryTags(query),
      };
    })
    .filter((candidate): candidate is ProviderCandidate => Boolean(candidate));
}

function pickPixabayVideoFile(hit: PixabayHit): { link: string; width?: number; height?: number } | null {
  const videos = hit?.videos || {};
  const candidates = [videos.large, videos.medium, videos.small, videos.tiny]
    .filter((file): file is PixabayVideoFile & { url: string } => Boolean(file?.url))
    .sort((left, right) => ((right.width || 0) * (right.height || 0)) - ((left.width || 0) * (left.height || 0)));
  const selected = candidates[0];
  return selected ? { link: selected.url, width: selected.width, height: selected.height } : null;
}

async function searchPixabay(query: string, perPage: number): Promise<ProviderCandidate[]> {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("safesearch", "true");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay search failed (${response.status}) for "${query}"`);

  const data = await response.json() as { hits?: PixabayHit[] };
  return (Array.isArray(data.hits) ? data.hits : [])
    .map((hit): ProviderCandidate | null => {
      const file = pickPixabayVideoFile(hit);
      if (!file) return null;

      return {
        id: String(hit.id),
        provider: "pixabay",
        downloadUrl: file.link,
        pageUrl: hit.pageURL,
        attribution: hit.user ? `Video by ${hit.user} on Pixabay` : "Video from Pixabay",
        width: file.width,
        height: file.height,
        durationSeconds: hit.duration,
        tags: buildQueryTags(query),
      };
    })
    .filter((candidate): candidate is ProviderCandidate => Boolean(candidate));
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

function readManifest(): VideoAssetManifest {
  if (!fs.existsSync(MANIFEST_FILE)) return { assets: [] };
  return normalizeVideoAssetManifest(JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")));
}

function buildSafeStartOffsets(durationSeconds: number): number[] {
  return [0, 1, 2, 4, 6, 8]
    .filter((offset) => offset < Math.max(1, durationSeconds - 2));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const max = Number(getArgValue(args, "--max") || "6");
  const perQuery = Math.max(1, Math.min(max * 2, 10));
  const explicitQuery = getArgValue(args, "--query");
  const queries = explicitQuery ? [explicitQuery] : getDefaultQueries();
  const providers = getProviders(args);

  if (providers.length === 0) {
    throw new Error("No providers selected. Use --provider pexels,pixabay or set VIDEO_ASSET_PROVIDERS.");
  }

  const candidates: ProviderCandidate[] = [];
  for (const query of queries) {
    if (providers.includes("pexels")) candidates.push(...await searchPexels(query, perQuery));
    if (providers.includes("pixabay")) candidates.push(...await searchPixabay(query, perQuery));
    if (candidates.length >= max) break;
  }

  const selected = candidates
    .filter(isPublishableStockCandidate)
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left) || left.provider.localeCompare(right.provider))
    .slice(0, max);
  if (dryRun) {
    console.log(JSON.stringify(selected, null, 2));
    return;
  }

  fs.mkdirSync(BROLL_DIR, { recursive: true });
  const manifest = readManifest();
  const existingIds = new Set(manifest.assets.map((asset) => asset.id));
  const nextAssets: VideoAssetLayer[] = [...manifest.assets];

  for (const candidate of selected) {
    const id = `${candidate.provider}-${candidate.id}`;
    if (existingIds.has(id)) continue;

    const filename = `${sanitizeFilePart(id)}.mp4`;
    const outputPath = path.join(BROLL_DIR, filename);
    await downloadFile(candidate.downloadUrl, outputPath);
    const metadata = probeLocalVideoAsset(outputPath);

    nextAssets.push({
      id,
      kind: "video",
      source: "local",
      src: `broll/${filename}`,
      provider: candidate.provider,
      orientation: candidate.height && candidate.width && candidate.height >= candidate.width ? "vertical" : "any",
      role: "background",
      fit: "cover",
      opacity: 0.22,
      blur: 0,
      saturation: 1.08,
      tags: candidate.tags,
      attribution: candidate.attribution || candidate.pageUrl,
      sourcePageUrl: candidate.pageUrl,
      license: candidate.provider === "pexels" ? "Pexels License" : "Pixabay Content License",
      downloadedAt: new Date().toISOString(),
      durationSeconds: candidate.durationSeconds || metadata.durationSeconds,
      width: metadata.width || candidate.width,
      height: metadata.height || candidate.height,
      fileSizeBytes: metadata.fileSizeBytes,
      sha256: metadata.sha256,
      safeStartOffsets: buildSafeStartOffsets(candidate.durationSeconds || metadata.durationSeconds),
    });
    existingIds.add(id);
    console.log(`Downloaded ${id} -> ${outputPath}`);
  }

  const normalized = normalizeVideoAssetManifest({
    updatedAt: new Date().toISOString(),
    assets: nextAssets,
  });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(`Wrote ${normalized.assets.length} asset(s) to ${MANIFEST_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
